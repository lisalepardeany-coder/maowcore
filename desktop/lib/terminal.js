// A simple terminal for the app: each line runs in PowerShell in the current
// folder; output streams back live. `cd` and `cls` are handled here so the
// folder sticks between commands. No native modules needed.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');

// Pure (tested): where does `cd <arg>` go from `cwd`?
const resolveCd = (cwd, arg, home) => {
  const a = String(arg || '').trim().replace(/^["']|["']$/g, '');
  if (!a || a === '~') return home || cwd;
  if (a === '-') return null;   // handled by the caller (previous folder)
  // Windows path rules on purpose: this terminal is part of the Windows-only desktop
  // app (PowerShell), and path.win32 gives the same answer on any OS (CI runs on Linux too).
  return path.win32.resolve(cwd, a.replace(/^~(?=$|[\\/])/, home || '~'));
};

// Pure (tested): "C:\a\b\c\d" → "…\c\d" for the prompt.
const shortPath = (p, keep = 2) => {
  const parts = String(p || '').split(/[\\/]+/).filter(Boolean);
  return parts.length > keep + 1 ? `…\\${parts.slice(-keep).join('\\')}` : String(p || '');
};

class Terminal extends EventEmitter {
  constructor({ cwd, env }) {
    super();
    this.cwd = cwd; this.prev = cwd; this.env = env; this.proc = null; this.history = [];
  }

  write(text, kind = 'out') { this.emit('data', { text, kind }); }
  prompt() { this.emit('prompt', this.cwd); }

  // Commands typed while one is running wait their turn (like typing ahead).
  run(line) {
    const cmd = String(line || '').trim();
    if (!cmd) return this.prompt();
    if (this.proc) { (this.queue = this.queue || []).push(cmd); return null; }
    this.history.push(cmd); if (this.history.length > 200) this.history.shift();
    this.write(`PS ${shortPath(this.cwd)}> ${cmd}\n`, 'cmd');
    const m = cmd.match(/^(cd|chdir|set-location|sl)(?:\s+(.*))?$/i);
    if (m) {
      const target = m[2]?.trim() === '-' ? this.prev : resolveCd(this.cwd, m[2], process.env.USERPROFILE);
      if (target && fs.existsSync(target) && fs.statSync(target).isDirectory()) { this.prev = this.cwd; this.cwd = target; }
      else this.write(`Folder not found: ${m[2]}\n`, 'err');
      return this.prompt();
    }
    if (/^(cls|clear|clear-host)$/i.test(cmd)) { this.emit('clear'); return this.prompt(); }
    // -OutputEncoding so emoji / non-English text survive.
    const wrapped = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; ${cmd}`;
    this.proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrapped], { cwd: this.cwd, env: this.env, windowsHide: true });
    const started = Date.now();
    this.proc.stdout.on('data', (d) => this.write(d.toString('utf8')));
    this.proc.stderr.on('data', (d) => this.write(d.toString('utf8'), 'err'));
    this.proc.on('error', (e) => this.write(`${e.message}\n`, 'err'));
    this.proc.on('close', (code) => {
      this.proc = null;
      if (code) this.write(`(exit ${code} · ${((Date.now() - started) / 1000).toFixed(1)} s)\n`, 'info');
      const next = this.queue?.shift();
      if (next) this.run(next); else this.prompt();
    });
    return null;
  }

  stop() {
    this.queue = [];   // Stop also drops anything typed ahead
    if (!this.proc) return false;
    try { execFileSync('taskkill', ['/PID', String(this.proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ }
    this.write('^C\n', 'info');
    return true;
  }
}

module.exports = { Terminal, resolveCd, shortPath };
