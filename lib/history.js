// Per-guild listening history. Capped to last N entries; debounced disk writes.
const fs = require('node:fs');
const path = require('node:path');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'history.json');
const MAX_PER_GUILD = 500;
const SAVE_DEBOUNCE_MS = 2000;

let state = { guilds: {} };
let saveTimer = null;

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    state = parsed && typeof parsed === 'object' ? parsed : { guilds: {} };
    if (!state.guilds) state.guilds = {};
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[history] load failed:', e.message);
  }
};

const writeAtomic = () => {
  try {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    const tmp = `${HISTORY_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, HISTORY_PATH);
  } catch (e) {
    console.warn('[history] save failed:', e.message);
  }
};

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeAtomic(); }, SAVE_DEBOUNCE_MS);
};

const record = (guildId, song, requester) => {
  if (!guildId || !song) return;
  if (!state.guilds[guildId]) state.guilds[guildId] = [];
  state.guilds[guildId].unshift({
    ts: Date.now(),
    name: song.name,
    url: song.url,
    duration: song.duration,
    thumbnail: song.thumbnail || null,
    user: requester || song.user?.displayName || song.user?.username || 'unknown',
    artist: song.uploader?.name || null,
  });
  if (state.guilds[guildId].length > MAX_PER_GUILD) {
    state.guilds[guildId].length = MAX_PER_GUILD;
  }
  scheduleSave();
};

const list = (guildId, limit = 100) => {
  const arr = state.guilds[guildId] || [];
  return arr.slice(0, limit);
};

const allGuilds = () => Object.keys(state.guilds);

const stats = (guildId) => {
  const arr = state.guilds[guildId] || [];
  const byName = new Map();
  const byArtist = new Map();
  const byHour = new Array(24).fill(0);
  let totalSec = 0;
  for (const e of arr) {
    byName.set(e.name, (byName.get(e.name) || 0) + 1);
    if (e.artist) byArtist.set(e.artist, (byArtist.get(e.artist) || 0) + 1);
    byHour[new Date(e.ts).getHours()]++;
    totalSec += e.duration || 0;
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, count: v }));
  return {
    total: arr.length,
    totalListeningSec: totalSec,
    topSongs: top(byName, 10),
    topArtists: top(byArtist, 10),
    plays24h: byHour,
  };
};

load();

// Discovery score: % of plays in last N days that were first-time plays
const discoveryScore = (guildId, days = 30) => {
  const arr = state.guilds[guildId] || [];
  const cutoff = Date.now() - days * 86400000;
  const recent = arr.filter((e) => e.ts >= cutoff);
  if (!recent.length) return { percent: 0, newPlays: 0, totalPlays: 0 };
  // For each play, check if it's the FIRST appearance of that song in the full history
  const firstSeenByName = new Map();
  for (let i = arr.length - 1; i >= 0; i--) firstSeenByName.set(arr[i].name, arr[i].ts);
  const newPlays = recent.filter((e) => firstSeenByName.get(e.name) === e.ts).length;
  return {
    percent: Math.round((newPlays / recent.length) * 100),
    newPlays,
    totalPlays: recent.length,
  };
};

module.exports = { record, list, stats, allGuilds, discoveryScore };
