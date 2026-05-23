const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');
const SAVE_DEBOUNCE_MS = 250;

let state = { guilds: {} };
let saveTimer = null;

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    state = parsed && typeof parsed === 'object' ? parsed : { guilds: {} };
    if (!state.guilds) state.guilds = {};
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[config] load failed:', e.message);
  }
};

const writeAtomic = () => {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    const tmp = `${CONFIG_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, CONFIG_PATH);
  } catch (e) {
    console.warn('[config] save failed:', e.message);
  }
};

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeAtomic(); }, SAVE_DEBOUNCE_MS);
};

const getGuild = (id) => {
  if (!state.guilds[id]) state.guilds[id] = {};
  return state.guilds[id];
};

const updateGuild = (id, patch) => {
  state.guilds[id] = { ...getGuild(id), ...patch };
  scheduleSave();
};

load();

module.exports = { getGuild, updateGuild };
