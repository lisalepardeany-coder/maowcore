// Social features for v2.1.0 — user profiles, song ratings, leaderboards.
// v3.1.0: dual-path SQLite/JSON.

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

const PATH = path.join(__dirname, '..', 'data', 'social.json');
let state = { guilds: {} };

// === JSON fallback persistence ===
const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(PATH, 'utf8'));
    state = parsed && typeof parsed === 'object' ? parsed : { guilds: {} };
    if (!state.guilds) state.guilds = {};
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[social] load failed:', e.message);
  }
};
const save = () => {
  try {
    fs.mkdirSync(path.dirname(PATH), { recursive: true });
    const tmp = `${PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, PATH);
  } catch (e) { console.warn('[social] save failed:', e.message); }
};
const _ensureGuild = (guildId) => {
  if (!state.guilds[guildId]) {
    state.guilds[guildId] = { profiles: {}, ratings: {}, favorites: {} };
  }
  return state.guilds[guildId];
};

if (!db.isAvailable) load();

// === Profiles ===
const setProfile = (guildId, userId, patch) => {
  if (!guildId || !userId) throw new Error('guildId + userId required');
  const updatedAt = Date.now();
  if (db.isAvailable) {
    const existing = db.raw.prepare(
      `SELECT * FROM social_profiles WHERE guild_id = ? AND user_id = ?`,
    ).get(guildId, userId);
    if (existing) {
      const merged = {
        tag:           patch.tag           !== undefined ? patch.tag           : existing.tag,
        avatar:        patch.avatar        !== undefined ? patch.avatar        : existing.avatar,
        bio:           patch.bio           !== undefined ? patch.bio           : existing.bio,
        favoriteSong:  patch.favoriteSong  !== undefined ? patch.favoriteSong  : existing.favorite_song,
        color:         patch.color         !== undefined ? patch.color         : existing.color,
      };
      db.raw.prepare(`
        UPDATE social_profiles SET tag = ?, avatar = ?, bio = ?, favorite_song = ?, color = ?, updated_at = ?
        WHERE guild_id = ? AND user_id = ?
      `).run(merged.tag, merged.avatar, merged.bio, merged.favoriteSong, merged.color,
        updatedAt, guildId, userId);
      return { userId, ...merged, updatedAt };
    }
    db.raw.prepare(`
      INSERT INTO social_profiles (guild_id, user_id, tag, avatar, bio, favorite_song, color, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, userId, patch.tag || null, patch.avatar || null, patch.bio || null,
      patch.favoriteSong || null, patch.color || null, updatedAt);
    return { userId, ...patch, updatedAt };
  }
  const g = _ensureGuild(guildId);
  if (!g.profiles[userId]) g.profiles[userId] = { userId };
  Object.assign(g.profiles[userId], patch);
  g.profiles[userId].updatedAt = updatedAt;
  save();
  return g.profiles[userId];
};

const getProfile = (guildId, userId) => {
  if (db.isAvailable) {
    const r = db.raw.prepare(
      `SELECT * FROM social_profiles WHERE guild_id = ? AND user_id = ?`,
    ).get(guildId, userId);
    if (!r) return null;
    return {
      userId: r.user_id, tag: r.tag, avatar: r.avatar, bio: r.bio,
      favoriteSong: r.favorite_song, color: r.color, updatedAt: r.updated_at,
    };
  }
  return _ensureGuild(guildId).profiles[userId] || null;
};

// === Ratings ===
const rate = (guildId, userId, songName, stars, note = null) => {
  if (!guildId || !userId) throw new Error('guildId + userId required');
  if (!songName) throw new Error('songName required');
  const raw = Number(stars);
  if (!Number.isFinite(raw)) throw new Error(`Invalid stars: ${stars}`);
  const n = Math.max(1, Math.min(5, Math.round(raw)));
  const ts = Date.now();
  const safeNote = note ? String(note).slice(0, 280) : null;
  if (db.isAvailable) {
    db.raw.prepare(`
      INSERT INTO social_ratings (guild_id, song_name, user_id, stars, note, ts)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, song_name, user_id)
      DO UPDATE SET stars = excluded.stars, note = excluded.note, ts = excluded.ts
    `).run(guildId, songName, userId, n, safeNote, ts);
    return { stars: n, note: safeNote, ts };
  }
  const g = _ensureGuild(guildId);
  if (!g.ratings[songName]) g.ratings[songName] = {};
  g.ratings[songName][userId] = { stars: n, note: safeNote, ts };
  save();
  return g.ratings[songName][userId];
};

const ratingsFor = (guildId, songName) => {
  if (db.isAvailable) {
    const rows = db.raw.prepare(
      `SELECT user_id, stars, note, ts FROM social_ratings WHERE guild_id = ? AND song_name = ?`,
    ).all(guildId, songName);
    const entries = rows.map((r) => ({ userId: r.user_id, stars: r.stars, note: r.note, ts: r.ts }));
    const avg = entries.length ? entries.reduce((s, e) => s + e.stars, 0) / entries.length : null;
    return { count: entries.length, average: avg, entries };
  }
  const r = _ensureGuild(guildId).ratings[songName] || {};
  const entries = Object.entries(r).map(([userId, v]) => ({ userId, ...v }));
  const avg = entries.length ? entries.reduce((s, e) => s + e.stars, 0) / entries.length : null;
  return { count: entries.length, average: avg, entries };
};

const topRated = (guildId, limit = 20) => {
  if (db.isAvailable) {
    // Indexed group-by — orders of magnitude faster than reading all ratings.
    return db.raw.prepare(`
      SELECT song_name AS name, COUNT(*) AS count, AVG(stars) AS average
      FROM social_ratings WHERE guild_id = ?
      GROUP BY song_name
      ORDER BY average DESC, count DESC
      LIMIT ?
    `).all(guildId, limit);
  }
  const g = _ensureGuild(guildId);
  return Object.entries(g.ratings || {}).map(([name, byUser]) => {
    const entries = Object.values(byUser);
    if (!entries.length) return null;
    const avg = entries.reduce((s, e) => s + e.stars, 0) / entries.length;
    return { name, count: entries.length, average: avg };
  }).filter(Boolean)
    .sort((a, b) => b.average - a.average || b.count - a.count)
    .slice(0, limit);
};

// === Leaderboards (history-derived, unchanged) ===
const leaderboard = (history, guildId, limit = 20) => {
  const arr = history.list(guildId, 500);
  const byUser = new Map();
  for (const e of arr) {
    if (!e.user) continue;
    const prev = byUser.get(e.user) || { user: e.user, plays: 0, totalSec: 0 };
    prev.plays++;
    prev.totalSec += e.duration || 0;
    byUser.set(e.user, prev);
  }
  return [...byUser.values()]
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limit);
};

module.exports = { setProfile, getProfile, rate, ratingsFor, topRated, leaderboard };
