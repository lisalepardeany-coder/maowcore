// Per-guild listening history. Capped to last N entries; debounced disk writes.
// v3.1.0: when SQLite is available, history rows live in the `history` table
// with proper indexes (heatmap/leaderboard become O(log n)). Per-guild cap
// enforced by trimming oldest rows. JSON path retained as fallback.
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

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
  const user = requester || song.user?.displayName || song.user?.username || 'unknown';
  if (db.isAvailable) {
    db.raw.prepare(`
      INSERT INTO history (guild_id, ts, name, url, artist, user_name, duration, thumbnail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      guildId, Date.now(), song.name || '', song.url || null,
      song.uploader?.name || null, user, song.duration || null, song.thumbnail || null,
    );
    // Trim to MAX_PER_GUILD per guild — drop oldest beyond cap.
    db.raw.prepare(`
      DELETE FROM history WHERE id IN (
        SELECT id FROM history WHERE guild_id = ? ORDER BY ts DESC LIMIT -1 OFFSET ?
      )
    `).run(guildId, MAX_PER_GUILD);
    return;
  }
  if (!state.guilds[guildId]) state.guilds[guildId] = [];
  state.guilds[guildId].unshift({
    ts: Date.now(),
    name: song.name,
    url: song.url,
    duration: song.duration,
    thumbnail: song.thumbnail || null,
    user,
    artist: song.uploader?.name || null,
  });
  if (state.guilds[guildId].length > MAX_PER_GUILD) {
    state.guilds[guildId].length = MAX_PER_GUILD;
  }
  scheduleSave();
};

const list = (guildId, limit = 100) => {
  if (db.isAvailable) {
    const rows = db.raw.prepare(`
      SELECT ts, name, url, artist, user_name, duration, thumbnail
      FROM history WHERE guild_id = ? ORDER BY ts DESC LIMIT ?
    `).all(guildId, limit);
    return rows.map((r) => ({
      ts: r.ts, name: r.name, url: r.url, artist: r.artist,
      user: r.user_name, duration: r.duration, thumbnail: r.thumbnail,
    }));
  }
  const arr = state.guilds[guildId] || [];
  return arr.slice(0, limit);
};

const allGuilds = () => {
  if (db.isAvailable) {
    return db.raw.prepare(`SELECT DISTINCT guild_id FROM history`).all().map((r) => r.guild_id);
  }
  return Object.keys(state.guilds);
};

// Read everything once for a guild — used by stats/discovery/byDay below.
// Works for both SQLite and JSON backends via the existing list() function.
const _allForGuild = (guildId) => list(guildId, MAX_PER_GUILD);

const stats = (guildId) => {
  const arr = _allForGuild(guildId);
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

if (!db.isAvailable) load();

// Discovery score: % of plays in last N days that were first-time plays
const discoveryScore = (guildId, days = 30) => {
  const arr = _allForGuild(guildId);
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

// Daily play-count buckets covering the last `days` days (default 365 = one
// year — exactly what the GitHub-style contribution heatmap renders). Keys
// are ISO date strings (YYYY-MM-DD). Days with no plays return 0 rather than
// being omitted so the dashboard can render a uniform grid.
// Format a Date as YYYY-MM-DD in LOCAL time. We can't use toISOString here
// because it converts to UTC, which gives wrong day labels for any user not
// in UTC (Berlin user's Jun 2 local = Jun 1 UTC = wrong bucket).
const dateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const byDay = (guildId, days = 365) => {
  const out = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out[dateKey(d)] = 0;
  }
  const cutoff = today.getTime() - (days - 1) * 86400000;
  if (db.isAvailable) {
    // Indexed scan — much faster than reading + filtering all rows in JS.
    const rows = db.raw.prepare(
      `SELECT ts FROM history WHERE guild_id = ? AND ts >= ?`,
    ).all(guildId, cutoff);
    for (const r of rows) {
      const key = dateKey(new Date(r.ts));
      if (key in out) out[key]++;
    }
    return out;
  }
  const arr = state.guilds[guildId] || [];
  for (const e of arr) {
    if (e.ts < cutoff) continue;
    const key = dateKey(new Date(e.ts));
    if (key in out) out[key]++;
  }
  return out;
};

module.exports = { record, list, stats, allGuilds, discoveryScore, byDay };
