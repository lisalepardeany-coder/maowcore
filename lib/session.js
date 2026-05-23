// Persists active queues to disk so /restore can pick up where the bot left off
// after a crash, restart, or accidental /leave.
const fs = require('node:fs');
const path = require('node:path');

const SESSIONS_PATH = path.join(__dirname, '..', 'data', 'sessions.json');
const SAVE_DEBOUNCE_MS = 1000;

let state = { sessions: {} };
let saveTimer = null;

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
    state = parsed && typeof parsed === 'object' ? parsed : { sessions: {} };
    if (!state.sessions) state.sessions = {};
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[session] load failed:', e.message);
  }
};

const writeAtomic = () => {
  try {
    fs.mkdirSync(path.dirname(SESSIONS_PATH), { recursive: true });
    const tmp = `${SESSIONS_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, SESSIONS_PATH);
  } catch (e) {
    console.warn('[session] save failed:', e.message);
  }
};

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeAtomic(); }, SAVE_DEBOUNCE_MS);
};

const captureQueue = (queue) => {
  if (!queue?.songs?.length) return null;
  return {
    voiceChannelId: queue.voice?.channelId || null,
    textChannelId: queue.textChannel?.id || null,
    songs: queue.songs.map((s) => s.url).filter(Boolean),
    repeatMode: queue.repeatMode,
    volume: queue.volume,
    filters: queue.filters?.names || [],
    savedAt: Date.now(),
  };
};

const set = (guildId, queue) => {
  const snap = captureQueue(queue);
  if (!snap) return clear(guildId);
  state.sessions[guildId] = snap;
  scheduleSave();
};

const clear = (guildId) => {
  if (state.sessions[guildId]) {
    delete state.sessions[guildId];
    scheduleSave();
  }
};

const get = (guildId) => state.sessions[guildId] || null;

load();

module.exports = { set, clear, get };
