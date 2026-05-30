// Social features for v2.1.0 — user profiles, song ratings, leaderboards.
// Data lives in data/social.json keyed by guildId → userId → fields.

const fs = require('node:fs');
const path = require('node:path');

const PATH = path.join(__dirname, '..', 'data', 'social.json');
let state = { guilds: {} };

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

const getGuild = (guildId) => {
  if (!state.guilds[guildId]) {
    state.guilds[guildId] = { profiles: {}, ratings: {}, favorites: {} };
  }
  return state.guilds[guildId];
};

// === Profiles ===
const setProfile = (guildId, userId, patch) => {
  const g = getGuild(guildId);
  if (!g.profiles[userId]) g.profiles[userId] = { userId };
  Object.assign(g.profiles[userId], patch);
  g.profiles[userId].updatedAt = Date.now();
  save();
  return g.profiles[userId];
};
const getProfile = (guildId, userId) => getGuild(guildId).profiles[userId] || null;

// === Ratings === Each rating is { stars: 1-5, note?: string, ts }
// Keyed by song name (since URLs vary across YouTube re-uploads).
const rate = (guildId, userId, songName, stars, note = null) => {
  if (!songName) throw new Error('songName required');
  const n = Math.max(1, Math.min(5, Math.round(Number(stars))));
  const g = getGuild(guildId);
  if (!g.ratings[songName]) g.ratings[songName] = {};
  g.ratings[songName][userId] = { stars: n, note: note ? String(note).slice(0, 280) : null, ts: Date.now() };
  save();
  return g.ratings[songName][userId];
};
const ratingsFor = (guildId, songName) => {
  const r = getGuild(guildId).ratings[songName] || {};
  const entries = Object.entries(r).map(([userId, v]) => ({ userId, ...v }));
  const avg = entries.length ? entries.reduce((s, e) => s + e.stars, 0) / entries.length : null;
  return { count: entries.length, average: avg, entries };
};
const topRated = (guildId, limit = 20) => {
  const g = getGuild(guildId);
  return Object.entries(g.ratings || {}).map(([name, byUser]) => {
    const entries = Object.values(byUser);
    if (!entries.length) return null;
    const avg = entries.reduce((s, e) => s + e.stars, 0) / entries.length;
    return { name, count: entries.length, average: avg };
  }).filter(Boolean)
    .filter((r) => r.count >= 1)
    .sort((a, b) => b.average - a.average || b.count - a.count)
    .slice(0, limit);
};

// === Leaderboards ===
// Compute from history records — read-only across modules. Returns
// the top N users by play count + total listening seconds.
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

load();
module.exports = { setProfile, getProfile, rate, ratingsFor, topRated, leaderboard };
