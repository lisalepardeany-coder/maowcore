// Per-server economy + leveling.
//
// v3.1.0: dual-path. If SQLite is available, uses it (proper transactions,
// indexed leaderboard). Otherwise falls back to the v2.x JSON file.

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

// === Shared ===
const xpForLevel = (lvl) => lvl * lvl * 100;

// =============================================================================
// SQLite path
// =============================================================================
const sqlitePath = {
  getUser(guildId, userId) {
    const row = db.raw.prepare(
      `SELECT * FROM economy_users WHERE guild_id = ? AND user_id = ?`,
    ).get(guildId, userId);
    if (row) return rowToUser(row);
    // Insert blank row + return it
    db.raw.prepare(
      `INSERT INTO economy_users (guild_id, user_id) VALUES (?, ?)`,
    ).run(guildId, userId);
    return { userId, coins: 0, xp: 0, level: 1, achievements: [], lastEarnedAt: 0 };
  },
  award(guildId, userId, coins, source) {
    return db.tx(() => {
      const u = sqlitePath.getUser(guildId, userId);
      u.coins += coins;
      u.xp += coins * 10;
      u.lastEarnedAt = Date.now();
      let leveledUp = false;
      while (u.xp >= xpForLevel(u.level)) {
        u.xp -= xpForLevel(u.level);
        u.level++;
        leveledUp = true;
      }
      db.raw.prepare(
        `UPDATE economy_users SET coins = ?, xp = ?, level = ?, last_earned_at = ?
         WHERE guild_id = ? AND user_id = ?`,
      ).run(u.coins, u.xp, u.level, u.lastEarnedAt, guildId, userId);
      return { user: u, leveledUp, source };
    });
  },
  spend(guildId, userId, coins, label) {
    return db.tx(() => {
      const u = sqlitePath.getUser(guildId, userId);
      if (u.coins < coins) throw new Error(`Insufficient coins (${u.coins} / ${coins})`);
      u.coins -= coins;
      db.raw.prepare(
        `UPDATE economy_users SET coins = ? WHERE guild_id = ? AND user_id = ?`,
      ).run(u.coins, guildId, userId);
      return { user: u, spent: coins, label };
    });
  },
  leaderboard(guildId, limit) {
    return db.raw.prepare(
      `SELECT * FROM economy_users WHERE guild_id = ? ORDER BY level DESC, xp DESC LIMIT ?`,
    ).all(guildId, limit).map(rowToUser);
  },
  getShop(guildId) {
    return db.raw.prepare(
      `SELECT id, name, cost, description FROM economy_shop WHERE guild_id = ?`,
    ).all(guildId);
  },
  addShopItem(guildId, { name, cost, description }) {
    const id = `i-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
    const item = {
      id,
      name: String(name || 'item').slice(0, 60),
      cost: Math.max(1, Number(cost) || 1),
      description: String(description || '').slice(0, 200),
    };
    db.raw.prepare(
      `INSERT INTO economy_shop (id, guild_id, name, cost, description) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, guildId, item.name, item.cost, item.description);
    return item;
  },
  removeShopItem(guildId, id) {
    const result = db.raw.prepare(
      `DELETE FROM economy_shop WHERE guild_id = ? AND id = ?`,
    ).run(guildId, id);
    return result.changes > 0;
  },
  grant(guildId, userId, achievement) {
    return db.tx(() => {
      const u = sqlitePath.getUser(guildId, userId);
      if (u.achievements.includes(achievement)) return false;
      u.achievements.push(achievement);
      db.raw.prepare(
        `UPDATE economy_users SET achievements = ? WHERE guild_id = ? AND user_id = ?`,
      ).run(JSON.stringify(u.achievements), guildId, userId);
      return true;
    });
  },
};

const rowToUser = (r) => ({
  userId: r.user_id,
  coins: r.coins,
  xp: r.xp,
  level: r.level,
  achievements: parseJsonSafe(r.achievements, []),
  lastEarnedAt: r.last_earned_at || 0,
});
const parseJsonSafe = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

// =============================================================================
// JSON fallback path (the original v2.x implementation)
// =============================================================================
const PATH = path.join(__dirname, '..', 'data', 'economy.json');
let state = { guilds: {} };

const loadJson = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(PATH, 'utf8'));
    state = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : { guilds: {} };
    if (!state.guilds || typeof state.guilds !== 'object') state.guilds = {};
  } catch (e) { if (e.code !== 'ENOENT') console.warn('[economy] load failed:', e.message); }
};
const saveJson = () => {
  try {
    fs.mkdirSync(path.dirname(PATH), { recursive: true });
    const tmp = `${PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, PATH);
  } catch (e) { console.warn('[economy] save failed:', e.message); }
};

const jsonPath = {
  getUser(guildId, userId) {
    if (!state.guilds[guildId]) state.guilds[guildId] = { users: {}, shop: [] };
    if (!state.guilds[guildId].users[userId]) {
      state.guilds[guildId].users[userId] = {
        userId, coins: 0, xp: 0, level: 1, achievements: [], lastEarnedAt: 0,
      };
    }
    return state.guilds[guildId].users[userId];
  },
  award(guildId, userId, coins, source) {
    const u = jsonPath.getUser(guildId, userId);
    u.coins += coins; u.xp += coins * 10; u.lastEarnedAt = Date.now();
    let leveledUp = false;
    while (u.xp >= xpForLevel(u.level)) {
      u.xp -= xpForLevel(u.level); u.level++; leveledUp = true;
    }
    saveJson();
    return { user: u, leveledUp, source };
  },
  spend(guildId, userId, coins, label) {
    const u = jsonPath.getUser(guildId, userId);
    if (u.coins < coins) throw new Error(`Insufficient coins (${u.coins} / ${coins})`);
    u.coins -= coins; saveJson();
    return { user: u, spent: coins, label };
  },
  leaderboard(guildId, limit) {
    const g = state.guilds[guildId];
    if (!g) return [];
    return Object.values(g.users)
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, limit);
  },
  getShop(guildId) {
    if (!state.guilds[guildId]) state.guilds[guildId] = { users: {}, shop: [] };
    return state.guilds[guildId].shop || [];
  },
  addShopItem(guildId, { name, cost, description }) {
    const g = state.guilds[guildId] = state.guilds[guildId] || { users: {}, shop: [] };
    g.shop = g.shop || [];
    const item = {
      id: `i-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
      name: String(name || 'item').slice(0, 60),
      cost: Math.max(1, Number(cost) || 1),
      description: String(description || '').slice(0, 200),
    };
    g.shop.push(item); saveJson();
    return item;
  },
  removeShopItem(guildId, id) {
    const g = state.guilds[guildId];
    if (!g?.shop) return false;
    const n = g.shop.length;
    g.shop = g.shop.filter((i) => i.id !== id);
    if (g.shop.length !== n) { saveJson(); return true; }
    return false;
  },
  grant(guildId, userId, achievement) {
    const u = jsonPath.getUser(guildId, userId);
    if (u.achievements.includes(achievement)) return false;
    u.achievements.push(achievement); saveJson();
    return true;
  },
};

// JSON path requires loaded state. SQLite path doesn't need this.
if (!db.isAvailable) loadJson();

// =============================================================================
// Public API — dispatcher with validation
// =============================================================================
const backend = db.isAvailable ? sqlitePath : jsonPath;

const award = (guildId, userId, coins, source) => {
  const n = Number(coins);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`award: invalid coins value: ${coins}`);
  if (!guildId || !userId) throw new Error('award: guildId + userId required');
  return backend.award(guildId, userId, n, source);
};

const spend = (guildId, userId, coins, label) => {
  const n = Number(coins);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`spend: invalid coins value: ${coins}`);
  if (!guildId || !userId) throw new Error('spend: guildId + userId required');
  return backend.spend(guildId, userId, n, label);
};

module.exports = {
  award, spend, xpForLevel,
  getUser:      (g, u) => backend.getUser(g, u),
  leaderboard:  (g, limit = 20) => backend.leaderboard(g, limit),
  getShop:      (g) => backend.getShop(g),
  addShopItem:  (g, item) => backend.addShopItem(g, item),
  removeShopItem: (g, id) => backend.removeShopItem(g, id),
  grant:        (g, u, a) => backend.grant(g, u, a),
};
