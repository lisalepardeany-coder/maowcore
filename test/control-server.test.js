// Tests for the dashboard's WebSocket command handler in lib/control-server.js.
// Focus on the validation fixes from the deep bug-hunt pass:
//   - safeNum rejects NaN
//   - set_config rejects keys outside the allowlist
//   - queue_move clamps + rejects NaN inputs

const test = require('node:test');
const assert = require('node:assert/strict');

// We need to build a ControlServer without an HTTP listener interfering.
const buildServer = ({ queues = new Map(), voices = new Map() } = {}) => {
  const { ControlServer } = require('../lib/control-server');
  const distube = {
    queues: { collection: queues },
    voices: { collection: voices, get: (id) => voices.get(id) || null },
    getQueue: (id) => queues.get(id) || null,
    // hookDisTube chains .on(...). Return self for fluent style.
    on(_ev, _fn) { return this; },
  };
  // Discord.js's Collection extends Map and adds .map(). Plain Map doesn't
  // have it — patch in just enough for _collectServers() to not blow up.
  const guildCache = new Map();
  guildCache.map = (fn) => [...guildCache.values()].map(fn);
  const client = {
    ws: { ping: 1, status: 0, shards: { size: 1 } },
    user: { tag: 'TestBot' },
    guilds: { cache: guildCache },
    users: { cache: new Map() },
    channels: { cache: new Map() },
    readyTimestamp: Date.now(),
  };
  const cs = new ControlServer({ port: 0, host: '127.0.0.1', distube, client });
  cs.httpServer.close();
  clearInterval(cs.ticker);
  clearInterval(cs.pingTimer);
  return cs;
};

// Helper to drive a command. handleCommand normally takes (ws, raw); we pass
// a fake-no-op ws and the raw JSON.
const send = (cs, payload) => cs.handleCommand(null, JSON.stringify(payload));

test('volume: rejects NaN without touching the queue', async () => {
  const queue = {
    songs: [{ url: 'https://yt/x', name: 'x' }],
    volume: 50, setVolume(v) { this.volume = v; },
    setRepeatMode() {}, paused: false,
    filters: { names: [] },
    pause() {}, resume() {},
  };
  const queues = new Map([['g1', queue]]);
  const cs = buildServer({ queues });
  // NaN-trigger
  await send(cs, { type: 'cmd', action: 'volume', value: 'banana', guildId: 'g1' });
  assert.equal(queue.volume, 50, 'volume must not change on NaN input');
  // Valid value
  await send(cs, { type: 'cmd', action: 'volume', value: 80, guildId: 'g1' });
  assert.equal(queue.volume, 80);
  // Clamped at 150 (max)
  await send(cs, { type: 'cmd', action: 'volume', value: 9999, guildId: 'g1' });
  assert.equal(queue.volume, 150);
  // Clamped at 0 (min)
  await send(cs, { type: 'cmd', action: 'volume', value: -50, guildId: 'g1' });
  assert.equal(queue.volume, 0);
});

test('seek: rejects NaN', async () => {
  let lastSeek = null;
  const queue = {
    songs: [{ url: 'https://yt/x', name: 'x' }],
    volume: 100, setVolume() {},
    seek: async (s) => { lastSeek = s; },
    paused: false,
    filters: { names: [] },
  };
  const queues = new Map([['g1', queue]]);
  const cs = buildServer({ queues });
  await send(cs, { type: 'cmd', action: 'seek', value: 'nope', guildId: 'g1' });
  assert.equal(lastSeek, null);
  await send(cs, { type: 'cmd', action: 'seek', value: 42, guildId: 'g1' });
  assert.equal(lastSeek, 42);
  // Negative clamped to 0
  await send(cs, { type: 'cmd', action: 'seek', value: -5, guildId: 'g1' });
  assert.equal(lastSeek, 0);
});

test('loop: rejects NaN, clamps to 0..2 range', async () => {
  let lastMode = null;
  const queue = {
    songs: [{ url: 'https://yt/x', name: 'x' }],
    volume: 100, setVolume() {},
    setRepeatMode: (m) => { lastMode = m; },
    paused: false,
    filters: { names: [] },
  };
  const queues = new Map([['g1', queue]]);
  const cs = buildServer({ queues });
  await send(cs, { type: 'cmd', action: 'loop', value: 'xyz', guildId: 'g1' });
  assert.equal(lastMode, null);
  await send(cs, { type: 'cmd', action: 'loop', value: 1, guildId: 'g1' });
  assert.equal(lastMode, 1);
  await send(cs, { type: 'cmd', action: 'loop', value: 5, guildId: 'g1' });
  assert.equal(lastMode, 2);  // clamped to max
});

test('set_config: rejects keys outside the allowlist', async () => {
  const cs = buildServer();
  const config = require('../lib/config');
  const guildId = 'g-allow-' + Date.now();
  // Disallowed key — must not be persisted.
  await send(cs, { type: 'cmd', action: 'set_config', key: 'automod', value: { antiSpam: true }, guildId });
  assert.equal(config.getGuild(guildId).automod, undefined);
  // Allowed key — should persist.
  await send(cs, { type: 'cmd', action: 'set_config', key: 'stay247', value: true, guildId });
  assert.equal(config.getGuild(guildId).stay247, true);
  // Another disallowed key
  await send(cs, { type: 'cmd', action: 'set_config', key: 'playlists', value: { x: ['hack'] }, guildId });
  assert.equal(config.getGuild(guildId).playlists, undefined);
});

test('queue_move: rejects NaN inputs (no accidental splice(0, 1))', async () => {
  const queue = {
    songs: [
      { url: 'https://yt/playing' },
      { url: 'https://yt/a' },
      { url: 'https://yt/b' },
      { url: 'https://yt/c' },
    ],
    volume: 100, setVolume() {}, paused: false,
    filters: { names: [] },
  };
  const queues = new Map([['g1', queue]]);
  const cs = buildServer({ queues });
  const before = [...queue.songs];
  // NaN from/to — songs must be untouched. Pre-fix this would splice the
  // currently-playing song.
  await send(cs, { type: 'cmd', action: 'queue_move', from: 'banana', to: 'apple', guildId: 'g1' });
  assert.deepEqual(queue.songs.map((s) => s.url), before.map((s) => s.url));
  // Valid swap: position 1 -> position 3
  await send(cs, { type: 'cmd', action: 'queue_move', from: 1, to: 3, guildId: 'g1' });
  assert.equal(queue.songs[0].url, 'https://yt/playing');
  assert.equal(queue.songs[3].url, 'https://yt/a');
});
