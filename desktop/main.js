// MaowCore Portable — main process.
// One exe that sets up everything the bot needs and keeps it running:
// tray icon, setup wizard, live log, open panel, start with Windows.
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const tools = require('./lib/tools');
const { BotRunner } = require('./lib/runner');
const png = require('./lib/png');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// ===== Where things live =====
// Portable: everything next to the .exe in "MaowCore-data" (settings, Node.js).
// Dev (npm start): Electron's userData folder.
const BASE = process.env.PORTABLE_EXECUTABLE_DIR ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'MaowCore-data') : app.getPath('userData');
const TOOLS = path.join(BASE, 'tools');
const SETTINGS_FILE = path.join(BASE, 'settings.json');
const BUNDLED_BOT = app.isPackaged ? path.join(process.resourcesPath, 'bot') : path.join(__dirname, 'build', 'bot-bundle');
const STARTUP_VBS = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'MaowCore Bot.vbs');
const EXE = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
fs.mkdirSync(BASE, { recursive: true });

const defaults = { botDir: null, nodePath: null, autoStartBot: true, startHidden: false, closeToTray: true, firstRun: true };
let settings = { ...defaults };
try { settings = { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; } catch { /* first run */ }
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

// The old Startup-folder script knows where an existing bot lives.
const detectExisting = () => {
  try {
    const m = fs.readFileSync(STARTUP_VBS, 'utf8').match(/""([^"]+?)\\scripts\\supervisor\.js""/i);
    if (m && tools.isBotFolder(m[1])) return m[1];
  } catch { /* no script */ }
  return null;
};

// ===== Runner, window, tray =====
const runner = new BotRunner();
let win = null; let panelWin = null; let tray = null; let quitting = false;
let busy = null;            // name of the setup step running, if any
let lastCheck = null;

const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const appLog = (text) => { runner.log(text, 'setup'); };
runner.on('log', (e) => send('log', e));
runner.on('state', (s) => { send('state', fullState()); updateTray(s.state); });

const fullState = () => ({
  settings, base: BASE, exe: EXE, busy, check: lastCheck, runner: runner.status(),
  external: settings.botDir ? !!runner.external() : false,
  oldAutostart: fs.existsSync(STARTUP_VBS),
  detected: settings.botDir ? null : detectExisting(),
  bundled: fs.existsSync(path.join(BUNDLED_BOT, 'index.js')),
  loginItem: app.getLoginItemSettings({ path: EXE }).openAtLogin,
  version: app.getVersion(),
});

const icon = nativeImage.createFromBuffer(png.appIcon(256));
const createWindow = () => {
  win = new BrowserWindow({
    width: 980, height: 720, minWidth: 720, minHeight: 520, title: 'MaowCore', icon, backgroundColor: '#1e1f22',
    show: !(settings.startHidden && process.argv.includes('--hidden')), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.on('close', (e) => {
    if (!quitting && settings.closeToTray) {
      e.preventDefault(); win.hide();
      if (settings.firstHideTip !== false) {
        settings.firstHideTip = false; saveSettings();
        new Notification({ title: 'MaowCore is still running', body: 'It keeps the bot online from the tray (near the clock). Right-click the icon to quit.', icon }).show();
      }
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
};

const openPanel = () => {
  const url = `http://127.0.0.1:${runner.port()}/`;
  if (panelWin && !panelWin.isDestroyed()) { panelWin.show(); panelWin.focus(); return; }
  panelWin = new BrowserWindow({ width: 1280, height: 820, title: 'MaowCore panel', icon, autoHideMenuBar: true, backgroundColor: '#1e1f22',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  panelWin.loadURL(url);
  // Discord sign-in happens inside this window (and comes back to the panel);
  // every other outside link opens in the normal browser.
  panelWin.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https?:/.test(u)) shell.openExternal(u); return { action: 'deny' }; });
  panelWin.webContents.on('will-navigate', (e, u) => {
    const ok = u.startsWith(`http://127.0.0.1:${runner.port()}`) || /^https:\/\/(discord\.com|ptb\.discord\.com|canary\.discord\.com)\/(oauth2|login|api\/oauth2)/.test(u);
    if (!ok) { e.preventDefault(); shell.openExternal(u); }
  });
};

const STATE_LABEL = { online: 'Online', starting: 'Starting…', restarting: 'Restarting…', stopping: 'Stopping…', stopped: 'Stopped', external: 'Running outside the app' };
const updateTray = (state = runner.state) => {
  if (!tray) return;
  tray.setImage(nativeImage.createFromBuffer(png.trayIcon(state)));
  const tag = runner.health?.botTag;
  tray.setToolTip(`MaowCore · ${STATE_LABEL[state] || state}${tag ? ` · ${tag}` : ''}`);
  const running = !!runner.child;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${STATE_LABEL[state] || state}${tag ? ` · ${tag}` : ''}`, enabled: false },
    { type: 'separator' },
    { label: 'Open MaowCore', click: () => { win.show(); win.focus(); } },
    { label: 'Open panel', enabled: !!runner.health || state === 'online' || state === 'external', click: openPanel },
    { type: 'separator' },
    { label: running ? 'Restart bot' : 'Start bot', enabled: !busy && !!settings.botDir && state !== 'external', click: () => (running ? runner.restart() : safeStart()) },
    { label: 'Stop bot', enabled: running, click: () => runner.stop() },
    { type: 'separator' },
    { label: 'Quit (stops the bot)', click: () => quit() },
  ]));
};

const safeStart = () => { try { runner.start(); } catch (e) { appLog(`✕ ${e.message}`); } };
const quit = async () => { quitting = true; await runner.stop(); app.quit(); };

// ===== Setup =====
const refresh = async () => {
  lastCheck = await tools.check({ botDir: settings.botDir, toolsDir: TOOLS, preferredNode: settings.nodePath });
  if (lastCheck.node?.path && lastCheck.node.path !== settings.nodePath) { settings.nodePath = lastCheck.node.path; saveSettings(); }
  runner.configure({ botDir: settings.botDir, nodePath: settings.nodePath });
  send('state', fullState());
  updateTray();
  return lastCheck;
};
const ready = (c) => c && ['botDir', 'node', 'packages', 'ffmpeg', 'ytdlp', 'env'].every((k) => c[k]?.ok) && c.native?.ok !== false;

const step = async (name, fn) => {
  if (busy) throw new Error(`Busy with: ${busy}`);
  busy = name; send('state', fullState()); updateTray();
  try { await fn(); } catch (e) { appLog(`✕ ${e.message}`); throw e; } finally { busy = null; await refresh(); }
};

const STEPS = {
  node: () => step('Installing Node.js', async () => { settings.nodePath = await tools.installNode(TOOLS, appLog); saveSettings(); }),
  packages: () => step('Installing packages', async () => {
    const wasRunning = !!runner.child;
    if (wasRunning) await runner.stop();
    await tools.npmInstall(settings.nodePath, settings.botDir, appLog);
    if (wasRunning) safeStart();
  }),
  native: () => step('Rebuilding', async () => { await tools.npmRebuild(settings.nodePath, settings.botDir, appLog); }),
  ytdlp: () => step('Installing yt-dlp', async () => { await tools.installYtDlp(settings.botDir, appLog); }),
};

// Do every missing step in order.
const setupAll = async () => {
  let c = await refresh();
  if (!c.botDir.ok) throw new Error('Pick or install a bot folder first.');
  if (!c.node.ok) { await STEPS.node(); c = lastCheck; }
  if (!c.packages?.ok || !c.ffmpeg?.ok) { await STEPS.packages(); c = lastCheck; }
  if (c.native && !c.native.ok) { await STEPS.native(); c = lastCheck; }
  if (!c.ytdlp?.ok) { await STEPS.ytdlp(); c = lastCheck; }
  appLog(ready(c) ? '✓ Everything is set up.' : (c.env?.ok ? '▲ Some steps still need attention.' : '◌ Tools are ready. Now fill in the bot settings.'));
  return c;
};

// ===== IPC (only what the UI needs) =====
const handle = (name, fn) => ipcMain.handle(name, async (_e, ...args) => {
  try { return { ok: true, value: await fn(...args) }; } catch (e) { return { ok: false, error: e.message }; }
});
handle('state', async () => { await refresh(); return fullState(); });
handle('logs', () => runner.lines);
handle('chooseFolder', async (title) => {
  const r = await dialog.showOpenDialog(win, { title: title || 'Choose a folder', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
handle('useExisting', async (dir) => {
  if (!tools.isBotFolder(dir)) throw new Error('That folder does not look like a MaowCore bot (no index.js / commands).');
  settings.botDir = dir; settings.firstRun = false; saveSettings();
  return refresh();
});
handle('installFresh', async (dir) => {
  await step('Copying bot files', async () => { tools.copyBot(BUNDLED_BOT, dir, appLog); settings.botDir = dir; settings.firstRun = false; saveSettings(); });
  return setupAll();
});
handle('setupAll', setupAll);
handle('step', (name) => STEPS[name]?.());
handle('saveEnv', async (values) => {
  const clean = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (!['DISCORD_TOKEN', 'CLIENT_ID', 'DISCORD_CLIENT_ID', 'OWNER_USER_ID', 'CONTROL_PORT'].includes(k)) continue;
    if (String(v || '').trim()) clean[k] = String(v).trim();
  }
  if (clean.CLIENT_ID && !tools.readEnv(settings.botDir).DISCORD_CLIENT_ID) clean.DISCORD_CLIENT_ID = clean.CLIENT_ID;
  tools.writeEnv(settings.botDir, clean);
  return refresh();
});
handle('start', () => safeStart());
handle('stop', () => runner.stop());
handle('restart', () => runner.restart());
handle('takeover', async () => { runner.stopExternal(); await new Promise((r) => setTimeout(r, 1500)); safeStart(); });
handle('disableOldAutostart', () => { if (fs.existsSync(STARTUP_VBS)) fs.renameSync(STARTUP_VBS, `${STARTUP_VBS}.disabled`); return true; });
handle('openPanel', () => openPanel());
handle('openPath', (which) => {
  const p = { bot: settings.botDir, data: BASE, logs: settings.botDir }[which];
  if (p) shell.openPath(p);
});
handle('setOption', (key, value) => {
  if (key === 'loginItem') {
    app.setLoginItemSettings({ openAtLogin: !!value, path: EXE, args: ['--hidden'] });
  } else if (['autoStartBot', 'startHidden', 'closeToTray'].includes(key)) {
    settings[key] = !!value; saveSettings();
  }
  return fullState();
});
handle('resetBotFolder', () => { settings.botDir = null; saveSettings(); return refresh(); });

// ===== v1.1: terminal, backups, bot updates, app updates =====
const { Terminal } = require('./lib/terminal');
const maint = require('./lib/maint');
let term = null;
const ensureTerm = () => {
  if (term) return term;
  const env = settings.nodePath ? tools.envForNode(settings.nodePath) : { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  term = new Terminal({ cwd: settings.botDir || process.env.USERPROFILE, env });
  term.on('data', (d) => send('term:data', d));
  term.on('prompt', (cwd) => send('term:prompt', cwd));
  term.on('clear', () => send('term:clear'));
  return term;
};
handle('termRun', (line) => { ensureTerm().run(line); return true; });
handle('termStop', () => ensureTerm().stop());
handle('termInfo', () => ({ cwd: ensureTerm().cwd, history: ensureTerm().history.slice(-100) }));

handle('backups', () => (settings.botDir ? maint.listBackups(settings.botDir) : []));
handle('backupNow', () => step('Making a backup', () => maint.backupNow(settings.nodePath, settings.botDir, appLog)));
handle('restoreBackup', (name) => step('Restoring a backup', async () => {
  const wasRunning = !!runner.child;
  if (wasRunning) await runner.stop();
  try { await maint.restoreBackup(settings.nodePath, settings.botDir, name, appLog); } finally { if (wasRunning) safeStart(); }
}));
handle('updateBot', () => step('Updating the bot', async () => {
  const wasRunning = !!runner.child;
  if (wasRunning) await runner.stop();
  try { await maint.updateBot(settings.nodePath, settings.botDir, appLog); } finally { if (wasRunning) safeStart(); }
}));

// App updates: newer MaowCore-Portable-x.y.z.exe in the bot's desktop/dist
// folder (where new builds land), or a folder picked in the app.
const updateSources = () => [settings.updateDir, settings.botDir && path.join(settings.botDir, 'desktop', 'dist')];
handle('checkAppUpdate', () => ({ current: app.getVersion(), update: maint.checkAppUpdate(updateSources(), app.getVersion()), portable: !!process.env.PORTABLE_EXECUTABLE_FILE }));
handle('applyAppUpdate', async () => {
  const u = maint.checkAppUpdate(updateSources(), app.getVersion());
  if (!u) throw new Error('No newer version found.');
  if (!process.env.PORTABLE_EXECUTABLE_FILE) throw new Error('Self-update only works in the portable .exe.');
  appLog(`⬆ Updating MaowCore to v${u.version}…`);
  await runner.stop();
  maint.applyAppUpdate(u.file, process.env.PORTABLE_EXECUTABLE_FILE, process.pid);
  quitting = true;
  setTimeout(() => app.quit(), 300);
  return true;
});
handle('setUpdateDir', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Folder with new MaowCore-Portable builds', properties: ['openDirectory'] });
  if (!r.canceled) { settings.updateDir = r.filePaths[0]; saveSettings(); }
  return settings.updateDir || null;
});

// ===== Boot =====
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(async () => {
  app.setAppUserModelId('dev.maowcore.desktop');
  createWindow();
  tray = new Tray(nativeImage.createFromBuffer(png.trayIcon('stopped')));
  tray.on('click', () => { win.show(); win.focus(); });
  updateTray();
  const c = await refresh().catch(() => null);
  // Ready + allowed → start the bot right away (unless the old script runs it).
  if (settings.autoStartBot && ready(c) && !runner.external()) safeStart();
  // A newer build waiting? Tell the window (it shows an "Update" banner).
  setTimeout(() => {
    const u = maint.checkAppUpdate(updateSources(), app.getVersion());
    if (u) { send('appUpdate', u); appLog(`⬆ MaowCore v${u.version} is available (Maintenance tab).`); }
  }, 4000);
});
