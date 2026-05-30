// Per-server economy + leveling for v2.6.0.
// State at data/economy.json. Currency earned by listening (1 coin per minute
// in voice while music plays), level from XP (10 XP per coin, 100 XP per level).

const fs = require('node:fs');
const path = require('node:path');

const PATH = path.join(__dirname, '..', 'data', 'economy.json');
let state = { guilds: {} };

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(PATH, 'utf8'));
    state = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : { guilds: {} };
    if (!state.guilds || typeof state.guilds !== 'object') state.guilds = {};
  } catch (e) { if (e.code !== 'ENOENT') console.warn('[economy] load failed:', e.message); }
};
const save = () => {
  try {
    fs.mkdirSync(path.dirname(PATH), { recursive: true });
    const tmp = `${PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, PATH);
  } catch (e) { console.warn('[economy] save failed:', e.message); }
};

const getUser = (guildId, userId) => {
  if (!state.guilds[guildId]) state.guilds[guildId] = { users: {}, shop: [] };
  if (!state.guilds[guildId].users[userId]) {
    state.guilds[guildId].users[userId] = { userId, coins: 0, xp: 0, level: 1, achievements: [], lastEarnedAt: 0 };
  }
  return state.guilds[guildId].users[userId];
};

const xpForLevel = (lvl) => lvl * lvl * 100;   // quadratic curve

const award = (guildId, userId, coins, source) => {
  // Validate: coins must be a finite positive number. NaN/negative/strings
  // would silently corrupt the user record (NaN coins, negative refunds).
  const n = Number(coins);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`award: invalid coins value: ${coins}`);
  if (!guildId || !userId) throw new Error('award: guildId + userId required');
  const u = getUser(guildId, userId);
  u.coins += n;
  u.xp += n * 10;
  u.lastEarnedAt = Date.now();
  let leveledUp = false;
  while (u.xp >= xpForLevel(u.level)) {
    u.xp -= xpForLevel(u.level);
    u.level++;
    leveledUp = true;
  }
  save();
  return { user: u, leveledUp, source };
};

const spend = (guildId, userId, coins, label) => {
  // Validate: coins must be a finite positive number. Allowing 0 or negative
  // would let a malicious caller "spend" -50 and refund themselves.
  const n = Number(coins);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`spend: invalid coins value: ${coins}`);
  if (!guildId || !userId) throw new Error('spend: guildId + userId required');
  const u = getUser(guildId, userId);
  if (u.coins < n) throw new Error(`Insufficient coins (${u.coins} / ${n})`);
  u.coins -= n;
  save();
  return { user: u, spent: n, label };
};

const leaderboard = (guildId, limit = 20) => {
  const g = state.guilds[guildId];
  if (!g) return [];
  return Object.values(g.users)
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, limit);
};

// === Shop items ===
const getShop = (guildId) => {
  if (!state.guilds[guildId]) state.guilds[guildId] = { users: {}, shop: [] };
  return state.guilds[guildId].shop || [];
};
const addShopItem = (guildId, { name, cost, description }) => {
  const g = state.guilds[guildId] = state.guilds[guildId] || { users: {}, shop: [] };
  g.shop = g.shop || [];
  const item = { id: `i-${Date.now().toString(36)}`, name: String(name || 'item').slice(0, 60), cost: Math.max(1, Number(cost) || 1), description: String(description || '').slice(0, 200) };
  g.shop.push(item); save();
  return item;
};
const removeShopItem = (guildId, id) => {
  const g = state.guilds[guildId];
  if (!g?.shop) return false;
  const n = g.shop.length;
  g.shop = g.shop.filter((i) => i.id !== id);
  if (g.shop.length !== n) { save(); return true; }
  return false;
};

const grant = (guildId, userId, achievement) => {
  const u = getUser(guildId, userId);
  if (!u.achievements.includes(achievement)) {
    u.achievements.push(achievement);
    save();
    return true;
  }
  return false;
};

load();
module.exports = { award, spend, getUser, leaderboard, getShop, addShopItem, removeShopItem, grant, xpForLevel };
