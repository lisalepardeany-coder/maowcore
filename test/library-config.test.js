// Tests for the download config (concurrency + per-stream rate cap) and the
// playlist-related behavior added in v1.6.0.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Point LIBRARY_DIR at a fresh temp dir BEFORE requiring lib/library so the
// module-load `load()` picks it up.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-libcfg-'));
process.env.LIBRARY_DIR = tmpRoot;
const library = require('../lib/library');

test('library.loadConfig: returns defaults when no _config.json exists', () => {
  const cfg = library.loadConfig();
  assert.equal(cfg.concurrency, 5);
  assert.equal(cfg.limitRate, null);
});

test('library.saveConfig: clamps concurrency to [1, 50]', () => {
  const saved1 = library.saveConfig({ concurrency: 999, limitRate: '10M' });
  assert.equal(saved1.concurrency, 50);
  const saved2 = library.saveConfig({ concurrency: 0, limitRate: null });
  assert.equal(saved2.concurrency, 1);
});

test('library.saveConfig: rejects unknown limitRate values', () => {
  const saved = library.saveConfig({ concurrency: 5, limitRate: '999G' });
  assert.equal(saved.limitRate, null, 'unknown rate should be coerced to null');
});

test('library.saveConfig: round-trips a valid config to disk', () => {
  library.saveConfig({ concurrency: 12, limitRate: '5M' });
  const reloaded = library.loadConfig();
  assert.equal(reloaded.concurrency, 12);
  assert.equal(reloaded.limitRate, '5M');
  // And persisted file actually exists.
  assert.ok(fs.existsSync(library.CONFIG_PATH));
});

test('library.installPlaylistFromUrl: is exported and is a function', () => {
  assert.equal(typeof library.installPlaylistFromUrl, 'function');
});

test('library.probePlaylist: is exported and is a function', () => {
  assert.equal(typeof library.probePlaylist, 'function');
});

// --- playlists module sanitize: reject "undefined" / "null" names ---

const playlistsLib = require('../lib/playlists');

test('playlists.sanitize: empty / null / "undefined" all become empty string', () => {
  // Sanitize is internal but reachable indirectly: save() throws on empty name.
  assert.throws(() => playlistsLib.save('g', 'u', undefined, ['http://a']),
    /Playlist name is empty/);
  assert.throws(() => playlistsLib.save('g', 'u', null, ['http://a']),
    /Playlist name is empty/);
  assert.throws(() => playlistsLib.save('g', 'u', 'undefined', ['http://a']),
    /Playlist name is empty/);
  assert.throws(() => playlistsLib.save('g', 'u', 'null', ['http://a']),
    /Playlist name is empty/);
});

// Cleanup
test('cleanup', () => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});
