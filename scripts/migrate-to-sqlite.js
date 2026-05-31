// One-shot JSON → SQLite migration for v3.1.0.
//
// Runs automatically from lib/db.js on first boot when SQLite is available
// AND the legacy JSON files exist AND the matching tables are empty.
// Idempotent: safe to re-run; it skips tables that already have data.
//
// Old files are renamed to *.json.pre-v3.1 (NOT deleted) so the operator
// can roll back by `mv data/*.json.pre-v3.1 data/*.json && rm data/maow.db`.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const dataDir = (file) => path.join(ROOT, 'data', file);

const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.warn(`[migrate] read ${p} failed:`, e.message); return null; }
};

const renameLegacy = (src) => {
  try { fs.renameSync(src, `${src}.pre-v3.1`); } catch { /* best-effort */ }
};

const run = (db) => {
  if (!db || !db.isAvailable) return { skipped: true, reason: 'SQLite not available' };
  const raw = db.raw;
  const report = {};

  // --- guild_config (from data/config.json) ---
  if (raw.prepare(`SELECT COUNT(*) AS n FROM guild_config`).get().n === 0) {
    const cfg = readJson(dataDir('config.json'));
    if (cfg && cfg.guilds && typeof cfg.guilds === 'object') {
      const ins = raw.prepare(`INSERT INTO guild_config (guild_id, data) VALUES (?, ?)`);
      const apply = raw.transaction(() => {
        let n = 0;
        for (const [gid, data] of Object.entries(cfg.guilds)) {
          ins.run(gid, JSON.stringify(data));
          n++;
        }
        return n;
      });
      report.guild_config = apply();
      if (report.guild_config > 0) renameLegacy(dataDir('config.json'));
    }
  }

  // --- history ---
  if (raw.prepare(`SELECT COUNT(*) AS n FROM history`).get().n === 0) {
    const hist = readJson(dataDir('history.json'));
    if (hist && hist.guilds) {
      const ins = raw.prepare(`
        INSERT INTO history (guild_id, ts, name, url, artist, user_name, duration, thumbnail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const apply = raw.transaction(() => {
        let n = 0;
        for (const [gid, arr] of Object.entries(hist.guilds)) {
          if (!Array.isArray(arr)) continue;
          for (const e of arr) {
            ins.run(gid, e.ts || Date.now(), e.name || '', e.url || null, e.artist || null,
              e.user || null, e.duration || null, e.thumbnail || null);
            n++;
          }
        }
        return n;
      });
      report.history = apply();
      if (report.history > 0) renameLegacy(dataDir('history.json'));
    }
  }

  // --- sessions ---
  if (raw.prepare(`SELECT COUNT(*) AS n FROM sessions`).get().n === 0) {
    const s = readJson(dataDir('sessions.json'));
    if (s && s.sessions) {
      const ins = raw.prepare(`
        INSERT INTO sessions (token, user_id, tag, discriminator, avatar, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const apply = raw.transaction(() => {
        let n = 0;
        for (const [token, v] of Object.entries(s.sessions)) {
          ins.run(token, v.userId || '', v.tag || null, v.discriminator || null,
            v.avatar || null, v.createdAt || Date.now(), v.expiresAt || (Date.now() + 30 * 86400000));
          n++;
        }
        return n;
      });
      report.sessions = apply();
      if (report.sessions > 0) renameLegacy(dataDir('sessions.json'));
    }
  }

  // --- economy ---
  if (raw.prepare(`SELECT COUNT(*) AS n FROM economy_users`).get().n === 0) {
    const e = readJson(dataDir('economy.json'));
    if (e && e.guilds) {
      const insUser = raw.prepare(`
        INSERT INTO economy_users (guild_id, user_id, coins, xp, level, last_earned_at, achievements)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insShop = raw.prepare(`
        INSERT INTO economy_shop (id, guild_id, name, cost, description) VALUES (?, ?, ?, ?, ?)
      `);
      const apply = raw.transaction(() => {
        let users = 0, items = 0;
        for (const [gid, g] of Object.entries(e.guilds)) {
          for (const [uid, u] of Object.entries(g.users || {})) {
            insUser.run(gid, uid, u.coins || 0, u.xp || 0, u.level || 1,
              u.lastEarnedAt || null, JSON.stringify(u.achievements || []));
            users++;
          }
          for (const item of g.shop || []) {
            insShop.run(item.id, gid, item.name, item.cost, item.description || null);
            items++;
          }
        }
        return { users, items };
      });
      report.economy = apply();
      if (report.economy.users + report.economy.items > 0) renameLegacy(dataDir('economy.json'));
    }
  }

  // --- social ---
  if (raw.prepare(`SELECT COUNT(*) AS n FROM social_ratings`).get().n === 0 &&
      raw.prepare(`SELECT COUNT(*) AS n FROM social_profiles`).get().n === 0) {
    const s = readJson(dataDir('social.json'));
    if (s && s.guilds) {
      const insProfile = raw.prepare(`
        INSERT INTO social_profiles (guild_id, user_id, tag, avatar, bio, favorite_song, color, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insRating = raw.prepare(`
        INSERT INTO social_ratings (guild_id, song_name, user_id, stars, note, ts)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const apply = raw.transaction(() => {
        let p = 0, r = 0;
        for (const [gid, g] of Object.entries(s.guilds)) {
          for (const [uid, prof] of Object.entries(g.profiles || {})) {
            insProfile.run(gid, uid, prof.tag || null, prof.avatar || null, prof.bio || null,
              prof.favoriteSong || null, prof.color || null, prof.updatedAt || null);
            p++;
          }
          for (const [songName, byUser] of Object.entries(g.ratings || {})) {
            for (const [uid, v] of Object.entries(byUser)) {
              insRating.run(gid, songName, uid, v.stars || 0, v.note || null, v.ts || null);
              r++;
            }
          }
        }
        return { profiles: p, ratings: r };
      });
      report.social = apply();
      if (report.social.profiles + report.social.ratings > 0) renameLegacy(dataDir('social.json'));
    }
  }

  // NOTE: automation, custom-commands, playlist-subs are NOT migrated in
  // v3.1.0 — their lib/*.js modules still read from JSON. The empty SQLite
  // tables exist for future v3.2+ refactors. Migrating data without a
  // matching runtime would create two sources of truth.

  return { ok: true, report };
};

module.exports = { run };

// CLI mode: node scripts/migrate-to-sqlite.js
if (require.main === module) {
  const db = require('../lib/db');
  if (!db.isAvailable) {
    console.error('▲ SQLite not available:', db.loadError);
    process.exit(1);
  }
  const result = run(db);
  console.log('═══ Migration result ═══');
  console.log(JSON.stringify(result, null, 2));
}
