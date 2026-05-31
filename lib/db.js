// SQLite layer for v3.1.0.
//
// Provides a single shared database connection used by economy, social,
// sessions, history, automation, custom-commands, and playlist-subs.
//
// Design principles:
//   - SYNCHRONOUS API (better-sqlite3) — matches our existing sync code
//     style so module refactors are minimal.
//   - Optional dependency: if better-sqlite3 fails to compile, `isAvailable`
//     is false and every module falls back to its legacy JSON path.
//   - One file at data/maow.db (configurable via DB_PATH env var).
//   - WAL mode for concurrent readers, single writer.
//   - Versioned schema migrations stored in `_meta.schema_version`.
//   - Auto-migrate JSON → SQLite on first boot (scripts/migrate-to-sqlite.js).

const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'maow.db');

let Database;
let db = null;
let available = false;
let loadError = null;

try {
  Database = require('better-sqlite3');
} catch (e) {
  loadError = e.message;
}

if (Database) {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');   // WAL + NORMAL is the durability sweet spot
    runMigrations(db);
    available = true;
    // Auto-migrate legacy JSON files on first boot. Idempotent — skips
    // tables that already have data, so safe across restarts.
    //
    // NOTE: we pass a small shim object instead of `module.exports`, because
    // module.exports is still the default {} at this point in module load
    // (the const assignment at the bottom hasn't executed yet). The migrator
    // only reads .raw and .isAvailable, so a shim is enough.
    try {
      const migrator = require('../scripts/migrate-to-sqlite');
      const result = migrator.run({ raw: db, isAvailable: true });
      const counts = result?.report || {};
      const total = Object.values(counts).reduce((sum, v) =>
        sum + (typeof v === 'number' ? v : Object.values(v || {}).reduce((s, n) => s + n, 0)),
      0);
      if (total > 0) {
        console.log(`[db] auto-migrated ${total} rows from JSON to SQLite. Old files renamed to *.json.pre-v3.1`);
      }
    } catch (e) {
      console.warn('[db] auto-migration failed:', e.message);
    }
  } catch (e) {
    loadError = `SQLite init failed: ${e.message}`;
    db = null;
  }
}

// === Schema migrations ===
// Each migration is { version, sql }. The runner applies them in order,
// recording the latest version in _meta.schema_version. New versions append
// here — existing migrations are immutable.
function runMigrations(d) {
  d.exec(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const currentRow = d.prepare(`SELECT value FROM _meta WHERE key = 'schema_version'`).get();
  let current = currentRow ? Number(currentRow.value) : 0;

  const migrations = [
    {
      version: 1,
      sql: `
        -- Per-guild config (JSON blob keyed by guild_id)
        CREATE TABLE guild_config (guild_id TEXT PRIMARY KEY, data TEXT NOT NULL);

        -- Listening history (proper rows, queryable)
        CREATE TABLE history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL, ts INTEGER NOT NULL,
          name TEXT, url TEXT, artist TEXT, user_name TEXT,
          duration INTEGER, thumbnail TEXT
        );
        CREATE INDEX idx_history_guild_ts ON history(guild_id, ts DESC);
        CREATE INDEX idx_history_guild_name ON history(guild_id, name);
        CREATE INDEX idx_history_ts ON history(ts);

        -- OAuth sessions
        CREATE TABLE sessions (
          token TEXT PRIMARY KEY, user_id TEXT NOT NULL, tag TEXT,
          discriminator TEXT, avatar TEXT,
          created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE INDEX idx_sessions_expires ON sessions(expires_at);

        -- Economy
        CREATE TABLE economy_users (
          guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
          coins INTEGER NOT NULL DEFAULT 0,
          xp INTEGER NOT NULL DEFAULT 0,
          level INTEGER NOT NULL DEFAULT 1,
          last_earned_at INTEGER,
          achievements TEXT NOT NULL DEFAULT '[]',
          PRIMARY KEY (guild_id, user_id)
        );
        CREATE INDEX idx_economy_lb ON economy_users(guild_id, level DESC, xp DESC);

        CREATE TABLE economy_shop (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          name TEXT NOT NULL,
          cost INTEGER NOT NULL,
          description TEXT
        );
        CREATE INDEX idx_shop_guild ON economy_shop(guild_id);

        -- Social profiles + ratings
        CREATE TABLE social_profiles (
          guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
          tag TEXT, avatar TEXT, bio TEXT, favorite_song TEXT, color TEXT,
          updated_at INTEGER,
          PRIMARY KEY (guild_id, user_id)
        );
        CREATE TABLE social_ratings (
          guild_id TEXT NOT NULL, song_name TEXT NOT NULL,
          user_id TEXT NOT NULL,
          stars INTEGER NOT NULL, note TEXT, ts INTEGER,
          PRIMARY KEY (guild_id, song_name, user_id)
        );
        CREATE INDEX idx_ratings_song ON social_ratings(guild_id, song_name);

        -- Automation
        CREATE TABLE crons (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE webhooks (
          id TEXT PRIMARY KEY,
          secret TEXT NOT NULL UNIQUE,
          data TEXT NOT NULL
        );
        CREATE INDEX idx_webhooks_secret ON webhooks(secret);
        CREATE TABLE rules (
          id TEXT PRIMARY KEY,
          event TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX idx_rules_event ON rules(event);

        -- Custom commands
        CREATE TABLE custom_commands (
          guild_id TEXT NOT NULL, name TEXT NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (guild_id, name)
        );

        -- Playlist subscriptions
        CREATE TABLE playlist_subs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      `,
    },
    // Future migrations append here.
  ];

  for (const m of migrations) {
    if (m.version <= current) continue;
    const apply = d.transaction(() => {
      d.exec(m.sql);
      d.prepare(
        `INSERT INTO _meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(String(m.version));
    });
    apply();
    current = m.version;
    console.log(`[db] applied schema migration v${m.version}`);
  }
}

// Wrap a function in a transaction. Throws if SQLite isn't available.
const tx = (fn) => {
  if (!db) throw new Error('SQLite not available');
  return db.transaction(fn)();
};

// Online backup — used by lib/backup.js. Returns a Buffer of the .db file.
const backup = async () => {
  if (!db) throw new Error('SQLite not available');
  const tmp = `${DB_PATH}.backup-${Date.now()}`;
  await db.backup(tmp);
  const buf = fs.readFileSync(tmp);
  try { fs.unlinkSync(tmp); } catch { /* */ }
  return buf;
};

const close = () => { if (db) { try { db.close(); } catch { /* */ } db = null; available = false; } };

module.exports = {
  get raw() { return db; },        // direct access for prepared statements
  get isAvailable() { return available; },
  get loadError() { return loadError; },
  get path() { return DB_PATH; },
  tx,
  backup,
  close,
};
