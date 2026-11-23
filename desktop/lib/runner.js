// Runs the bot and keeps it running (replaces scripts/supervisor.js when the
// app is in charge). No Electron imports.
//
//  • starts `node index.js` in the bot folder with MAOW_SUPERVISED=1, so the
//    panel's Restart/Update buttons work
//  • restarts after a crash, backing off if it keeps failing quickly
//  • writes data/.last-exit.json so the bot can DM the owner after a crash
//  • writes data/.supervisor.json so the old script sees "already running"
//  • appends output to bot.out.log / bot.err.log (rotated at 5 MB)
//  • stops gracefully over IPC ("maow:shutdown"), then force-kills after 8 s
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { envForNode, readEnv } = require('./tools');

const MAX_LOG = 5 * 1024 * 1024;
const KEEP_LINES = 600;

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Pure (tested): how long to wait before the next restart.
const nextDelay = (prev, ranMs) => (ranMs > 5 * 60 * 1000 ? 3000 : Math.min((prev || 1500) * 2, 5 * 60 * 1000));

class BotRunner extends EventEmitter {
  constructor() {
    super();
    this.child = null; this.botDir = null; this.nodePath = null;
    this.wantRunning = false; this.stopping = false; this.delay = 3000; this.timer = null;
    this.lines = []; this.state = 'stopped'; this.health = null; this.startedAt = null; this.restarts = 0;
    this.healthTimer = setInterval(() => this.pollHealth(), 5000);
    this.healthTimer.unref?.();
  }

  configure({ botDir, nodePath }) { this.botDir = botDir; this.nodePath = nodePath; }
  port() { return Number(readEnv(this.botDir).CONTROL_PORT) || 8765; }
  setState(s) { if (this.state !== s) { this.state = s; this.emit('state', this.status()); } }
  status() {
    return { state: this.state, pid: this.child?.pid || null, health: this.health, startedAt: this.startedAt, restarts: this.restarts, port: this.botDir ? this.port() : null };
  }

  log(line, stream = 'out') {
    const entry = { ts: Date.now(), stream, text: String(line).slice(0, 1000) };
    this.lines.push(entry);
    if (this.lines.length > KEEP_LINES) this.lines.splice(0, this.lines.length - KEEP_LINES);
    this.emit('log', entry);
  }

  // Another supervisor (the old Startup-folder script) already running this bot?
  external() {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(this.botDir, 'data', '.supervisor.json'), 'utf8'));
      if (s.supervisor && s.supervisor !== process.pid && alive(s.supervisor)) return s;
      if (!s.supervisor && s.bot && alive(s.bot)) return s;
    } catch { /* none */ }
    return null;
  }

  stopExternal() {
    const s = this.external();
    if (!s) return false;
    for (const pid of [s.supervisor, s.bot]) {
      if (pid && alive(pid)) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ } }
    }
    this.log('■ Stopped the bot that was running outside the app.', 'app');
    return true;
  }

  rotate(file) { try { if (fs.statSync(file).size > MAX_LOG) fs.renameSync(file, `${file}.1`); } catch { /* none yet */ } }

  start() {
    if (!this.botDir || !this.nodePath) throw new Error('Set up the bot first.');
    if (this.child) return;
    if (this.external()) throw new Error('The bot is already running outside the app. Use "Let the app take over" first.');
    this.wantRunning = true; this.stopping = false;
    clearTimeout(this.timer);
    const out = path.join(this.botDir, 'bot.out.log');
    const err = path.join(this.botDir, 'bot.err.log');
    this.rotate(out); this.rotate(err);
    const outS = fs.createWriteStream(out, { flags: 'a' });
    const errS = fs.createWriteStream(err, { flags: 'a' });
    const started = Date.now();
    this.startedAt = started;
    this.health = null;
    this.setState('starting');
    this.log(`▶ Starting the bot (Node ${path.basename(path.dirname(this.nodePath))})…`, 'app');
    const child = spawn(this.nodePath, ['index.js'], {
      cwd: this.botDir, windowsHide: true,
      env: { ...envForNode(this.nodePath), MAOW_SUPERVISED: '1', MAOW_DESKTOP: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.child = child;
    try { fs.writeFileSync(path.join(this.botDir, 'data', '.supervisor.json'), JSON.stringify({ supervisor: process.pid, bot: child.pid, app: true })); } catch { /* data dir missing */ }
    const pipe = (stream, file, kind) => {
      let buf = '';
      stream.on('data', (d) => {
        file.write(d);
        buf += d;
        const parts = buf.split(/\r?\n/); buf = parts.pop();
        parts.forEach((l) => l.trim() && this.log(l, kind));
      });
    };
    pipe(child.stdout, outS, 'out');
    pipe(child.stderr, errS, 'err');
    child.on('error', (e) => this.log(`✕ Could not start: ${e.message}`, 'app'));
    child.on('exit', (code, signal) => {
      outS.end(); errS.end();
      this.child = null;
      const ran = Date.now() - started;
      if (!this.stopping) {
        try { fs.writeFileSync(path.join(this.botDir, 'data', '.last-exit.json'), JSON.stringify({ code, signal, at: Date.now(), uptimeMs: ran })); } catch { /* */ }
      }
      if (this.wantRunning) {
        this.delay = nextDelay(this.delay, ran);
        if (code === 0) this.log('↻ The bot asked for a restart.', 'app');
        else this.log(`▲ The bot stopped (exit ${code}${signal ? `, ${signal}` : ''}). Restarting in ${Math.round(this.delay / 1000)} s…`, 'app');
        this.restarts++;
        this.setState('restarting');
        this.timer = setTimeout(() => { try { this.start(); } catch (e) { this.log(`✕ ${e.message}`, 'app'); } }, code === 0 ? 1000 : this.delay);
      } else {
        this.setState('stopped');
        this.log('■ Bot stopped.', 'app');
      }
    });
  }

  // Graceful: ask the bot to shut down (it closes the Discord connection so
  // it shows offline right away), then force it after 8 s.
  stop() {
    this.wantRunning = false;
    clearTimeout(this.timer);
    const child = this.child;
    if (!child) { this.setState('stopped'); return Promise.resolve(); }
    this.stopping = true;
    this.setState('stopping');
    return new Promise((resolve) => {
      const force = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 8000);
      child.once('exit', () => { clearTimeout(force); resolve(); });
      try { child.send('maow:shutdown'); } catch { try { child.kill(); } catch { /* */ } }
    });
  }

  async restart() { await this.stop(); this.start(); }

  async pollHealth() {
    if (!this.botDir) return;
    try {
      const h = await (await fetch(`http://127.0.0.1:${this.port()}/api/health`, { signal: AbortSignal.timeout(3000) })).json();
      this.health = h;
      if (this.child && h.botTag) this.setState('online');
      else if (this.child) this.setState('starting');
      else if (this.external()) this.setState('external');
    } catch {
      this.health = null;
      if (!this.child && this.state !== 'stopping') this.setState(this.external() ? 'external' : (this.wantRunning ? 'restarting' : 'stopped'));
    }
    this.emit('state', this.status());
  }
}

module.exports = { BotRunner, nextDelay };
