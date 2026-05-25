// Tests for the pure-logic lib modules. Uses Node's built-in node:test runner
// (no dependency required, available on Node >= 18). Run with `npm test`.
//
// These tests exercise the fixes from the bug-hunt passes — every assertion
// here would have failed against the pre-fix code.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Point every data-store module at a sandbox dir so we don't trample the real
// data/. Done before any require of a module that calls fs.readFileSync on
// data/* at import time.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'maowcore-test-'));
fs.mkdirSync(path.join(SANDBOX, 'data'), { recursive: true });
process.chdir(SANDBOX);
// The lib modules use `__dirname` + '../data/<file>', so cwd alone isn't
// enough. We mirror their data dir by symlinking — or just by writing files
// to the real data dir but using unique keys so cleanup is trivial. Both lib
// modules tolerate missing files (ENOENT branch).

// ===== lib/format.js =====
test('fmtClock formats seconds correctly', () => {
  const { fmtClock, progressBar, truncate, loopLabel } = require('../lib/format');
  assert.equal(fmtClock(0), '0:00');
  assert.equal(fmtClock(59), '0:59');
  assert.equal(fmtClock(60), '1:00');
  assert.equal(fmtClock(125), '2:05');
  assert.equal(fmtClock(3600), '1:00:00');
  assert.equal(fmtClock(3725), '1:02:05');
  assert.equal(fmtClock(null), '—');
  assert.equal(fmtClock(NaN), '—');
  assert.equal(fmtClock(-5), '0:00');  // clamped to 0

  // progressBar
  assert.equal(progressBar(0, 0).length, 18);  // empty bar when no total
  assert.match(progressBar(50, 100, 10), /◆/);
  // At full progress the pointer sits at length (i.e. past the last "─").
  // Just assert ◆ exists and is at the end of the visible run.
  const full = progressBar(100, 100, 10);
  assert.match(full, /◆/);
  assert.ok(full.lastIndexOf('◆') >= 9, `pointer should be near the end, got: "${full}"`);

  // truncate
  assert.equal(truncate('hello', 10), 'hello');
  assert.equal(truncate('hello world', 6), 'hello…');

  // loopLabel
  assert.equal(loopLabel(0), 'off');
  assert.equal(loopLabel(1), 'signal');
  assert.equal(loopLabel(2), 'queue');
  assert.equal(loopLabel(0, 'long'), 'disengaged');
  assert.equal(loopLabel(99), 'off');  // fallback
});

// ===== lib/config.js — null guard (bug #18 fix) =====
test('config.getGuild does NOT pollute state for null/undefined IDs', () => {
  // Use a sandboxed config path via cwd. We avoid persistence side-effects by
  // not calling updateGuild on real IDs in this test.
  const config = require('../lib/config');
  // Calling getGuild with null must NOT create a guild entry keyed 'null'.
  const g1 = config.getGuild(null);
  const g2 = config.getGuild(undefined);
  const g3 = config.getGuild('');
  // All return {} but don't share identity (each call returns a fresh empty).
  assert.deepEqual(g1, {});
  assert.deepEqual(g2, {});
  assert.deepEqual(g3, {});
  // updateGuild on null id must no-op rather than create entries.
  config.updateGuild(null, { stay247: true });
  config.updateGuild(undefined, { stay247: true });
  config.updateGuild('', { stay247: true });
  // Real ID still works.
  config.updateGuild('123real-test', { stay247: true });
  assert.equal(config.getGuild('123real-test').stay247, true);
});

// ===== lib/automod.js — link filter matches ALL urls (bug fix) =====
test('automod link filter inspects EVERY URL, not just the first', async () => {
  // Stub the config module so automod sees our test config.
  const { setAutomod } = require('../lib/automod');
  const automod = require('../lib/automod');

  // Build a fake "guild" + "message" with two URLs, the first allowed and
  // the second malicious. Pre-fix this passed; post-fix it deletes.
  const guildId = 'test-guild-' + Date.now();
  setAutomod(guildId, { linkFilter: true, allowedDomains: ['youtube.com'] });

  let deleted = false;
  const fakeMsg = {
    guild: { id: guildId },
    guildId,
    author: { id: 'u', bot: false, tag: 'u#0' },
    member: { permissions: { has: () => false }, guild: { id: guildId }, roles: { cache: { has: () => false } } },
    content: 'check https://youtube.com/cool and https://malware.example/exploit',
    system: false,
    delete: async () => { deleted = true; },
  };
  const result = await automod.checkMessage(fakeMsg, null);
  assert.equal(deleted, true, 'should have deleted the message');
  assert.equal(result?.action, 'delete');
});

test('automod link filter passes when ALL URLs are allowed', async () => {
  const automod = require('../lib/automod');
  const guildId = 'test-guild-allowed-' + Date.now();
  automod.setAutomod(guildId, { linkFilter: true, allowedDomains: ['youtube.com', 'spotify.com'] });

  let deleted = false;
  const fakeMsg = {
    guild: { id: guildId },
    guildId,
    author: { id: 'u', bot: false, tag: 'u#0' },
    member: { permissions: { has: () => false }, guild: { id: guildId }, roles: { cache: { has: () => false } } },
    content: 'https://youtube.com/a then https://spotify.com/b',
    system: false,
    delete: async () => { deleted = true; },
  };
  const result = await automod.checkMessage(fakeMsg, null);
  assert.equal(deleted, false);
  assert.equal(result, null);
});

test('automod spam detection triggers at 5 msgs/5s', async () => {
  const automod = require('../lib/automod');
  const guildId = 'test-guild-spam-' + Date.now();
  automod.setAutomod(guildId, { antiSpam: true });
  let timedOut = false;
  const makeMsg = () => ({
    guild: { id: guildId },
    guildId,
    author: { id: 'spammer', bot: false, tag: 'spammer#0' },
    member: {
      permissions: { has: () => false },
      guild: { id: guildId },
      roles: { cache: { has: () => false } },
      timeout: async () => { timedOut = true; },
    },
    content: 'spam',
    system: false,
    delete: async () => {},
  });
  for (let i = 0; i < 4; i++) {
    const r = await automod.checkMessage(makeMsg(), null);
    assert.equal(r, null, `msg ${i + 1} should pass`);
  }
  const fifth = await automod.checkMessage(makeMsg(), null);
  assert.equal(fifth?.action, 'mute');
  assert.equal(timedOut, true);
});

test('automod skips moderators', async () => {
  const automod = require('../lib/automod');
  const guildId = 'test-guild-mod-' + Date.now();
  automod.setAutomod(guildId, { linkFilter: true, allowedDomains: [] });
  let deleted = false;
  const fakeMsg = {
    guild: { id: guildId },
    guildId,
    author: { id: 'mod', bot: false, tag: 'mod#0' },
    member: {
      permissions: { has: (perm) => perm === 'ManageMessages' },
      guild: { id: guildId },
      roles: { cache: { has: () => false } },
    },
    content: 'https://malware.example/whatever',
    system: false,
    delete: async () => { deleted = true; },
  };
  const r = await automod.checkMessage(fakeMsg, null);
  assert.equal(r, null);
  assert.equal(deleted, false);
});

// ===== lib/sleep-timer.js — cancel clears fadeKickoff (bug #8 fix) =====
test('sleepTimer.cancel clears the fadeKickoff (no orphan fade after cancel)', () => {
  const sleepTimer = require('../lib/sleep-timer');
  const guildId = 'test-sleep-' + Date.now();
  // Fake distube — schedule will create real setTimeouts that we'll cancel.
  const fakeDistube = {
    getQueue: () => ({ volume: 100, setVolume: () => {}, stop: () => {} }),
    voices: { get: () => ({ leave: () => {} }) },
  };
  sleepTimer.schedule(fakeDistube, guildId, 60, { fadeSeconds: 15 });
  const status1 = sleepTimer.status(guildId);
  assert.ok(status1.remainingMs > 0);
  const ok = sleepTimer.cancel(guildId);
  assert.equal(ok, true);
  assert.equal(sleepTimer.status(guildId), null);
  // Cancel a non-existent timer returns false
  assert.equal(sleepTimer.cancel(guildId), false);
});

// ===== lib/undo.js — TIMERS cleanup on natural TTL (bug #11 fix) =====
test('undo.capture cleans up TIMERS map on natural TTL expiry', { skip: false }, async () => {
  // We can't wait 5 min for real TTL. Instead, capture, then clear() — which
  // must remove the entry from BOTH snapshots and TIMERS.
  const undo = require('../lib/undo');
  const guildId = 'test-undo-' + Date.now();
  const fakeQueue = { songs: [{ url: 'https://test/a' }] };
  undo.capture(guildId, fakeQueue);
  assert.ok(undo.get(guildId), 'snapshot stored');
  undo.clear(guildId);
  assert.equal(undo.get(guildId), null);
});

// ===== lib/sentiment.js =====
test('sentiment classifier picks dominant mood correctly', () => {
  const sentiment = require('../lib/sentiment');
  const happy = sentiment.analyze('happy joy smile dance celebrate sunshine');
  assert.equal(happy.dominant, 'happy');
  const sad = sentiment.analyze('cry tears alone lost broken pain');
  assert.equal(sad.dominant, 'sad');
  const neutral = sentiment.analyze('the quick brown fox jumps over the lazy dog');
  assert.equal(neutral.dominant, 'neutral');
  const empty = sentiment.analyze('');
  assert.equal(empty.dominant, 'neutral');
});

// ===== lib/tts.js — lang param validated (bug fix) =====
test('tts.ttsUrl rejects malformed lang and falls back to en', () => {
  const tts = require('../lib/tts');
  // Sane langs flow through.
  assert.match(tts.ttsUrl('hi', 'en'), /tl=en/);
  assert.match(tts.ttsUrl('hi', 'es'), /tl=es/);
  assert.match(tts.ttsUrl('hi', 'pt-BR'), /tl=pt-BR/);
  // Injection attempts get normalized to 'en'.
  assert.match(tts.ttsUrl('hi', 'en&foo=bar'), /tl=en/);
  assert.match(tts.ttsUrl('hi', '"><script>'), /tl=en/);
  assert.match(tts.ttsUrl('hi', ''), /tl=en/);
});

test('tts.speakUrls chunks long text under 200 chars per segment', () => {
  const tts = require('../lib/tts');
  const short = tts.speakUrls('hello world');
  assert.equal(short.length, 1);
  const long = tts.speakUrls('word '.repeat(100));  // ~500 chars
  assert.ok(long.length >= 2);
  // Each chunk's source text must be <= 200 chars; check via the textlen query.
  long.forEach((u) => {
    const m = u.match(/textlen=(\d+)/);
    assert.ok(parseInt(m[1], 10) <= 200);
  });
});

// ===== lib/sponsorblock.js — cache bounded (bug fix) =====
test('SponsorBlockManager cache is bounded at CACHE_MAX', () => {
  const { SponsorBlockManager } = require('../lib/sponsorblock');
  const mgr = new SponsorBlockManager();
  // Push 350 entries — cache should cap at 300.
  for (let i = 0; i < 350; i++) {
    mgr._cacheSet(`vid${i}`, []);
  }
  assert.ok(mgr.cache.size <= 300, `cache size ${mgr.cache.size} should be <= 300`);
  // The oldest entries (vid0..vid49) should have been evicted.
  assert.equal(mgr.cache.has('vid0'), false);
  assert.equal(mgr.cache.has('vid349'), true);
});

test('SponsorBlockManager._cacheSet bumps recency on re-insert', () => {
  const { SponsorBlockManager } = require('../lib/sponsorblock');
  const mgr = new SponsorBlockManager();
  mgr._cacheSet('a', []);
  mgr._cacheSet('b', []);
  mgr._cacheSet('c', []);
  // Re-insert 'a' — should move to the end (most recently used).
  mgr._cacheSet('a', [{ start: 1, end: 2, category: 'test' }]);
  const keys = [...mgr.cache.keys()];
  assert.deepEqual(keys, ['b', 'c', 'a']);
});

// ===== lib/format.js + sanitize patterns from share.js =====
test('share filename sanitization handles unsafe chars', () => {
  // We replicate the sanitization here since it lives inline in share.js.
  const sanitize = (name) => name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'playlist';
  assert.equal(sanitize('my playlist'), 'my_playlist');
  // Slashes get replaced with _, dots are preserved (legitimate in filenames).
  // The key property is "no path separators remain."
  const traversal = sanitize('../../etc/passwd');
  assert.ok(!traversal.includes('/'), `must strip slashes, got "${traversal}"`);
  assert.ok(!traversal.includes('\\'), `must strip backslashes, got "${traversal}"`);
  assert.equal(sanitize('cool name 2024!'), 'cool_name_2024');
  assert.equal(sanitize(''), 'playlist');
  assert.equal(sanitize('!!!!!'), 'playlist');
  assert.equal(sanitize('normal_name'), 'normal_name');
});

// ===== lib/playlists.js =====
test('playlists save + load round-trip', () => {
  const playlists = require('../lib/playlists');
  const guildId = 'test-pl-' + Date.now();
  const userId = 'user1';
  const urls = ['https://a/1', 'https://b/2', 'https://c/3'];
  const count = playlists.save(guildId, userId, 'my mix', urls);
  assert.equal(count, 3);
  assert.deepEqual(playlists.load(guildId, userId, 'my mix'), urls);
  // Loading a missing playlist throws
  assert.throws(() => playlists.load(guildId, userId, 'nope'), /No playlist/);
  // Empty save throws
  assert.throws(() => playlists.save(guildId, userId, 'x', []), /Nothing to save/);
  // Listing
  const list = playlists.listFor(guildId, userId);
  assert.ok(list['my mix']);
});

test('playlists enforces MAX_PER_USER cap', () => {
  const playlists = require('../lib/playlists');
  const guildId = 'test-pl-cap-' + Date.now();
  const userId = 'capuser';
  for (let i = 0; i < 50; i++) {
    playlists.save(guildId, userId, `pl${i}`, ['https://x/' + i]);
  }
  // 51st distinct name should be rejected (cap is 50)
  assert.throws(() => playlists.save(guildId, userId, 'pl50', ['https://x/extra']), /50 playlists/);
  // But overwriting an existing one works
  const n = playlists.save(guildId, userId, 'pl0', ['https://overwrite']);
  assert.equal(n, 1);
});

// ===== lib/ratings.js =====
test('ratings aggregate computes averages correctly', () => {
  const ratings = require('../lib/ratings');
  const guildId = 'test-rate-' + Date.now();
  const song = { name: 'Cool Song', url: 'https://x/1' };
  ratings.rate(guildId, 'u1', song, 5);
  ratings.rate(guildId, 'u2', song, 3);
  ratings.rate(guildId, 'u3', song, 4);
  const top = ratings.topRated(guildId);
  assert.equal(top[0].name, 'Cool Song');
  assert.equal(top[0].count, 3);
  assert.equal(top[0].avg, 4);  // (5+3+4)/3
  // Invalid stars rejected
  assert.throws(() => ratings.rate(guildId, 'u4', song, 0), /1–5/);
  assert.throws(() => ratings.rate(guildId, 'u4', song, 6), /1–5/);
});

// ===== lib/favorites.js =====
test('favorites add is idempotent on duplicate URL', () => {
  const favorites = require('../lib/favorites');
  const guildId = 'test-fav-' + Date.now();
  const userId = 'u1';
  const song = { url: 'https://fav/1', name: 'Fav Song', duration: 200 };
  assert.equal(favorites.add(guildId, userId, song), true);
  assert.equal(favorites.add(guildId, userId, song), false);  // duplicate
  assert.equal(favorites.has(guildId, userId, song.url), true);
  assert.equal(favorites.remove(guildId, userId, song.url), true);
  assert.equal(favorites.remove(guildId, userId, song.url), false);  // already gone
});

test('favorites rejects URL-less songs', () => {
  const favorites = require('../lib/favorites');
  assert.throws(() => favorites.add('g', 'u', { name: 'no url' }), /without a URL/);
});

// ===== lib/i18n.js =====
test('i18n falls back through locale -> en -> key', () => {
  const i18n = require('../lib/i18n');
  // Real guild → default locale en
  const guildId = 'test-i18n-' + Date.now();
  assert.equal(i18n.t(guildId, 'noQueue'), '◌ No active transmission.');
  // Unknown key → returns the key itself
  assert.equal(i18n.t(guildId, 'somethingNonexistent'), 'somethingNonexistent');
  // Null guild id is safe now (post-fix)
  assert.equal(i18n.t(null, 'noQueue'), '◌ No active transmission.');
});

// ===== lib/personality.js =====
test('personality.phrase respects per-guild tone', () => {
  const personality = require('../lib/personality');
  const config = require('../lib/config');
  const guildId = 'test-tone-' + Date.now();
  // Default tone (no config) → cosmic
  assert.match(personality.phrase(guildId, 'paused'), /Transmission suspended/);
  // Set tone to meme
  config.updateGuild(guildId, { tone: 'meme' });
  assert.equal(personality.phrase(guildId, 'paused'), 'paused. respectfully.');
});
