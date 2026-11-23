// Keeps the bot running: restarts it after a crash or a panel restart, and
// rotates its logs. Run it hidden at login through the Startup folder.
//   node scripts/supervisor.js          start and keep running
//   node scripts/supervisor.js stop     stop the bot and the supervisor
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const STATE = path.join(ROOT, 'data', '.supervisor.json');
const OUT = path.join(ROOT, 'bot.out.log');
const ERR = path.join(ROOT, 'bot.err.log');
const MAX_LOG = 5 * 1024 * 1024;

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const writeState = (s) => fs.writeFileSync(STATE, JSON.stringify(s));
const killTree = (pid) => { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } };

if (process.argv[2] === 'stop') {
  const s = readState();
  if (s.supervisor && alive(s.supervisor)) killTree(s.supervisor);
  if (s.bot && alive(s.bot)) killTree(s.bot);
  try { fs.unlinkSync(STATE); } catch { /* gone */ }
  console.log('Bot stopped.');
  process.exit(0);
}

const existing = readState();
if (existing.supervisor && existing.supervisor !== process.pid && alive(existing.supervisor)) {
  console.log('Already running.');
  process.exit(0);
}

const rotate = (file) => {
  try {
    if (fs.statSync(file).size > MAX_LOG) fs.renameSync(file, `${file}.1`);
  } catch { /* no log yet */ }
};

let delay = 3000;
const run = () => {
  rotate(OUT);
  rotate(ERR);
  const started = Date.now();
  const child = spawn(process.execPath, ['index.js'], {
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, MAOW_SUPERVISED: '1' },
    stdio: ['ignore', fs.openSync(OUT, 'a'), fs.openSync(ERR, 'a')],
  });
  writeState({ supervisor: process.pid, bot: child.pid });
  child.on('exit', (code, signal) => {
    // Tell the next run how this one ended, so it can DM the owner after a
    // real crash (but not after a normal restart from the panel).
    try {
      fs.writeFileSync(path.join(ROOT, 'data', '.last-exit.json'),
        JSON.stringify({ code, signal, at: Date.now(), uptimeMs: Date.now() - started }));
    } catch { /* data folder missing */ }
    // Quick repeat failures back off, so a broken start can't spin forever.
    delay = Date.now() - started > 5 * 60 * 1000 ? 3000 : Math.min(delay * 2, 5 * 60 * 1000);
    setTimeout(run, Date.now() - started > 5 * 60 * 1000 ? 3000 : delay);
  });
};
run();
