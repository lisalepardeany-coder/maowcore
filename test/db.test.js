// Tests for the v3.1.0 SQLite layer + migration. Skips gracefully if
// better-sqlite3 isn't installed (CI without native build tools, etc.)
// so the rest of the test suite still passes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Use a temp DB so we don't touch the operator's real data.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-db-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
// Disable LIBRARY_DIR override so migrator doesn't try to touch user files.
process.env.LIBRARY_DIR = path.join(tmpDir, 'library');

let db;
try { db = require('../lib/db'); } catch { /* */ }

const sqliteOk = db?.isAvailable;

test('db: better-sqlite3 either loads or reports a clear error', () => {
  assert.ok(db, 'lib/db.js exports something');
  if (!sqliteOk) {
    console.log('  ⓘ Skipping SQLite tests: better-sqlite3 not available');
    console.log('  ⓘ loadError:', db.loadError);
    return;
  }
  assert.ok(db.raw, 'raw db handle exposed');
});

test('db: schema is at v1 after init', { skip: !sqliteOk }, () => {
  const row = db.raw.prepare(`SELECT value FROM _meta WHERE key = 'schema_version'`).get();
  assert.ok(row, '_meta.schema_version row exists');
  assert.equal(Number(row.value), 1);
});

test('db: all expected tables exist', { skip: !sqliteOk }, () => {
  const expected = [
    'guild_config', 'history', 'sessions', 'economy_users', 'economy_shop',
    'social_profiles', 'social_ratings', 'crons', 'webhooks', 'rules',
    'custom_commands', 'playlist_subs', '_meta',
  ];
  for (const t of expected) {
    const exists = db.raw.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    ).get(t);
    assert.ok(exists, `table ${t} should exist`);
  }
});

test('db: transactions roll back on throw', { skip: !sqliteOk }, () => {
  // Try to insert a guild_config row in a tx that throws.
  const before = db.raw.prepare(`SELECT COUNT(*) AS n FROM guild_config`).get().n;
  try {
    db.tx(() => {
      db.raw.prepare(`INSERT INTO guild_config (guild_id, data) VALUES (?, ?)`).run('rollback-test', '{}');
      throw new Error('intentional');
    });
  } catch { /* expected */ }
  const after = db.raw.prepare(`SELECT COUNT(*) AS n FROM guild_config`).get().n;
  assert.equal(after, before, 'transaction should have rolled back');
});

test('economy: SQLite path round-trips award + leaderboard', { skip: !sqliteOk }, () => {
  // Use a fresh module load so it picks up the test DB.
  delete require.cache[require.resolve('../lib/economy')];
  const econ = require('../lib/economy');
  const { user, leveledUp } = econ.award('test-guild', 'user-1', 250, 'test');
  assert.ok(user.coins >= 250);
  assert.ok(typeof leveledUp === 'boolean');
  const lb = econ.leaderboard('test-guild', 10);
  assert.ok(lb.length >= 1);
  assert.equal(lb[0].userId, 'user-1');
});

test('economy: spend validation rejects negative / NaN / zero', { skip: !sqliteOk }, () => {
  delete require.cache[require.resolve('../lib/economy')];
  const econ = require('../lib/economy');
  assert.throws(() => econ.award('g', 'u', -10), /invalid coins/);
  assert.throws(() => econ.award('g', 'u', 'foo'), /invalid coins/);
  assert.throws(() => econ.award('g', 'u', 0), /invalid coins/);
  assert.throws(() => econ.spend('g', 'u', -10), /invalid coins/);
  assert.throws(() => econ.spend('g', 'u', NaN), /invalid coins/);
});

test('social: SQLite path stores + retrieves a rating', { skip: !sqliteOk }, () => {
  delete require.cache[require.resolve('../lib/social')];
  const social = require('../lib/social');
  social.rate('test-guild', 'user-1', 'Test Song', 5, 'great!');
  const r = social.ratingsFor('test-guild', 'Test Song');
  assert.equal(r.count, 1);
  assert.equal(r.average, 5);
});

test('social: top-rated query uses SQL aggregation', { skip: !sqliteOk }, () => {
  delete require.cache[require.resolve('../lib/social')];
  const social = require('../lib/social');
  social.rate('test-guild-2', 'u1', 'Bangers', 5);
  social.rate('test-guild-2', 'u2', 'Bangers', 4);
  social.rate('test-guild-2', 'u1', 'Mid Track', 2);
  const top = social.topRated('test-guild-2', 10);
  assert.equal(top[0].name, 'Bangers');
  assert.equal(top[0].count, 2);
  assert.ok(top[0].average > top[1].average);
});

test('history: list + record use SQLite when available', { skip: !sqliteOk }, () => {
  delete require.cache[require.resolve('../lib/history')];
  const hist = require('../lib/history');
  hist.record('hist-guild', { name: 'TestSong', url: 'http://x', duration: 200, uploader: { name: 'TestArtist' } }, 'tester');
  const list = hist.list('hist-guild', 10);
  assert.ok(list.length >= 1);
  assert.equal(list[0].name, 'TestSong');
  assert.equal(list[0].artist, 'TestArtist');
  assert.equal(list[0].user, 'tester');
});

test('history: byDay aggregates from SQLite', { skip: !sqliteOk }, () => {
  delete require.cache[require.resolve('../lib/history')];
  const hist = require('../lib/history');
  const map = hist.byDay('hist-guild', 30);
  // byDay uses LOCAL-time YYYY-MM-DD keys (not toISOString — that would
  // produce wrong buckets for non-UTC timezones).
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.ok(map[today] >= 1, `today (${today}) should show at least 1 play from previous test`);
});

test('cleanup', () => {
  try { db?.close?.(); } catch { /* */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
});
