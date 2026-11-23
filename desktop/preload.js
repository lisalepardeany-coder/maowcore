// The only bridge between the window and the app: a fixed list of actions.
const { contextBridge, ipcRenderer } = require('electron');

const call = (name) => (...args) => ipcRenderer.invoke(name, ...args);
const on = (ch) => (fn) => ipcRenderer.on(ch, (_e, v) => fn(v));
contextBridge.exposeInMainWorld('maow', {
  state: call('state'), logs: call('logs'), chooseFolder: call('chooseFolder'),
  useExisting: call('useExisting'), installFresh: call('installFresh'), setupAll: call('setupAll'), step: call('step'),
  saveEnv: call('saveEnv'), start: call('start'), stop: call('stop'), restart: call('restart'),
  takeover: call('takeover'), disableOldAutostart: call('disableOldAutostart'), openPanel: call('openPanel'),
  openPath: call('openPath'), setOption: call('setOption'), resetBotFolder: call('resetBotFolder'),
  // v1.1
  termRun: call('termRun'), termStop: call('termStop'), termInfo: call('termInfo'),
  backups: call('backups'), backupNow: call('backupNow'), restoreBackup: call('restoreBackup'), updateBot: call('updateBot'),
  checkAppUpdate: call('checkAppUpdate'), applyAppUpdate: call('applyAppUpdate'), setUpdateDir: call('setUpdateDir'),
  onState: on('state'), onLog: on('log'),
  onTermData: on('term:data'), onTermPrompt: on('term:prompt'), onTermClear: on('term:clear'), onAppUpdate: on('appUpdate'),
});
