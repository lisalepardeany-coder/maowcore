// Maintenance for the app: backups, safe bot updates, and self-updates.
// No Electron imports (testable with plain Node).
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const tools = require('./tools');

const runNode = (nodePath, botDir, code, log) => new Promise((resolve) => {
  let out = '';
  const p = spawn(nodePath, ['-e', code], { cwd: botDir, env: tools.envForNode(nodePath), windowsHide: true });
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => String(d).split(/\r?\n/).forEach((l) => l.trim() && log?.(`  ${l}`)));
  p.on('close', (c) => resolve({ code: c, out: out.trim() }));
});
const runStep = (cmd, args, { cwd, env, log }) => new Promise((resolve) => {
  const p = spawn(cmd, args, { cwd, env, windowsHide: true });
  const feed = (d) => String(d).split(/\r?\n/).forEach((l) => l.trim() && log?.(`  ${l.slice(0, 300)}`));
  p.stdout.on('data', feed); p.stderr.on('data', feed);
  p.on('error', (e) => { log?.(`  ${e.message}`); resolve(1); });
  p.on('close', (c) => resolve(c));
});

// ===== Backups (the bot's own snapshot format, data/backups) =====
const backupDir = (botDir) => path.join(botDir, 'data', 'backups');
const listBackups = (botDir) => {
  try {
    return fs.readdirSync(backupDir(botDir)).filter((f) => /\.json(\.gz)?$/.test(f))
      .map((f) => { const st = fs.statSync(path.join(backupDir(botDir), f)); return { name: f, size: st.size, at: st.mtimeMs }; })
      .sort((a, b) => b.at - a.at);
  } catch { return []; }
};
const backupNow = async (nodePath, botDir, log) => {
  const r = await runNode(nodePath, botDir, "process.env.MAOW_QUIET='1';const b=require('./lib/backup');const s=b.create();console.log(JSON.stringify({name:s.name,size:s.size}));setTimeout(()=>process.exit(0),200)", log);
  try { const j = JSON.parse(r.out.split('\n').pop()); log?.(`✓ Backup made: ${j.name} (${(j.size / 1048576).toFixed(1)} MB)`); return j; } catch { throw new Error('The backup could not be made (see the log).'); }
};
const restoreBackup = async (nodePath, botDir, name, log) => {
  if (!/^[\w.-]+\.json(\.gz)?$/.test(name)) throw new Error('Bad backup name.');
  const r = await runNode(nodePath, botDir, `const b=require('./lib/backup');const r=b.restore(${JSON.stringify(name)});console.log(JSON.stringify({restored:r.restored,skipped:r.skipped}));setTimeout(()=>process.exit(0),300)`, log);
  try { const j = JSON.parse(r.out.split('\n').pop()); log?.(`✓ Restored ${j.restored} files${j.skipped ? ` (${j.skipped} skipped)` : ''}.`); return j; } catch { throw new Error('Restore failed (see the log).'); }
};

// ===== Safe bot update =====
// backup → save package-lock → npm update (scripts off) + needed steps →
// yt-dlp -U → tests. Anything fails → put the old packages back.
const updateBot = async (nodePath, botDir, log) => {
  const cli = path.join(path.dirname(nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(cli)) throw new Error('npm was not found next to Node.js.');
  const env = tools.envForNode(nodePath);
  const lock = path.join(botDir, 'package-lock.json');
  const saved = path.join(botDir, 'data', 'package-lock.before-app-update.json');
  await backupNow(nodePath, botDir, log);
  if (fs.existsSync(lock)) fs.copyFileSync(lock, saved);
  log('Updating packages…');
  let code = await runStep(nodePath, [cli, 'update', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: botDir, env, log });
  if (code === 0) { await tools.npmInstall(nodePath, botDir, log); }
  const yt = path.join(botDir, 'node_modules', '@distube', 'yt-dlp', 'bin', 'yt-dlp.exe');
  if (code === 0 && fs.existsSync(yt)) { log('Updating yt-dlp…'); await runStep(yt, ['-U'], { cwd: botDir, env, log }); }
  if (code === 0) {
    log('Running the bot\'s tests…');
    const testEnv = { ...env }; delete testEnv.NODE_TEST_CONTEXT;
    code = await runStep(nodePath, ['--test', 'test/'], { cwd: botDir, env: testEnv, log: () => {} });
    log(code === 0 ? '✓ Tests passed.' : '✕ Tests failed.');
  }
  if (code !== 0) {
    log('Something failed — putting the previous packages back…');
    if (fs.existsSync(saved)) fs.copyFileSync(saved, lock);
    await runStep(nodePath, [cli, 'install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: botDir, env, log });
    await tools.npmInstall(nodePath, botDir, log).catch(() => {});
    throw new Error('Update failed; the previous version was restored.');
  }
  log('✓ Bot updated.');
};

// ===== App self-update =====
// Pure (tested): compare "1.2.10" style versions.
const cmpVer = (a, b) => {
  const pa = String(a).split('.').map(Number); const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
};
// Pure (tested): newest "MaowCore-Portable-x.y.z.exe" in a list of names.
const newestBuild = (names) => names
  .map((n) => ({ n, v: (String(n).match(/^MaowCore-Portable-(\d+\.\d+\.\d+)\.exe$/i) || [])[1] }))
  .filter((x) => x.v)
  .sort((a, b) => cmpVer(b.v, a.v))[0] || null;

const checkAppUpdate = (sourceDirs, current) => {
  for (const dir of sourceDirs.filter(Boolean)) {
    try {
      const best = newestBuild(fs.readdirSync(dir));
      if (best && cmpVer(best.v, current) > 0) return { version: best.v, file: path.join(dir, best.n) };
    } catch { /* folder missing */ }
  }
  return null;
};

// Copies the new exe next to the running one, then a tiny batch script waits
// for the app to close, swaps the files and starts the new version.
const applyAppUpdate = (newFile, targetExe, pid) => {
  const dir = path.dirname(targetExe);
  const staged = path.join(dir, 'MaowCore-Portable.update.exe');
  fs.copyFileSync(newFile, staged);
  const bat = path.join(dir, 'maowcore-update.cmd');
  fs.writeFileSync(bat, [
    '@echo off',
    ':wait',
    `tasklist /FI "PID eq ${pid}" 2>nul | find "${pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)`,
    'set n=0',
    ':swap',
    `move /y "${staged}" "${targetExe}" >nul 2>&1 && goto done`,
    'set /a n+=1',
    'if %n% geq 30 goto done',
    'timeout /t 1 /nobreak >nul',
    'goto swap',
    ':done',
    `start "" "${targetExe}"`,
    '(goto) 2>nul & del "%~f0"',
  ].join('\r\n'));
  const child = spawn('cmd.exe', ['/c', bat], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return true;
};

module.exports = { listBackups, backupNow, restoreBackup, updateBot, cmpVer, newestBuild, checkAppUpdate, applyAppUpdate };
