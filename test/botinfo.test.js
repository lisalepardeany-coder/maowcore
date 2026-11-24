const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSpecs, fmtBytes, fmtDuration } = require('../commands/botinfo');

test('botinfo: byte and duration formatting', () => {
  assert.equal(fmtBytes(0), '0 B');
  assert.equal(fmtBytes(1536), '1.5 KB');
  assert.equal(fmtBytes(5 * 1024 ** 3), '5.0 GB');
  assert.equal(fmtDuration(5000), '5s');
  assert.equal(fmtDuration((86400 + 3600 + 61) * 1000), '1d 1h 1m 1s');
});

test('botinfo: spec sheet builds from a fake client, panel only for the owner', async () => {
  const guilds = new Map([['g1', { memberCount: 12, channels: { cache: { size: 9 } } }]]);
  guilds.reduce = (fn, init) => [...guilds.values()].reduce(fn, init);
  const client = {
    user: { username: 'MaowCore', tag: 'MaowCore#0001', id: '1', createdTimestamp: 0, displayAvatarURL: () => 'https://example.invalid/a.png' },
    guilds: { cache: guilds },
    ws: { ping: 42 },
    commands: new Map([['a', { everywhere: true }], ['b', {}]]),
    distube: { queues: { collection: new Map([['g1', { songs: [1, 2, 3], playing: true, paused: false }]]) } },
  };
  // ping comes from lib/latency.js now (real round trip + heartbeat), not client.ws.ping
  const latency = require('../lib/latency');
  latency._reset();
  latency._state.network.push(9, 10, 11);
  latency._state.heartbeat.push(42);
  const pub = (await buildSpecs(client)).toJSON();
  latency._reset();
  const text = JSON.stringify(pub);
  assert.match(text, /Servers\*\* 1/);
  assert.match(text, /Members\*\* 12/);
  assert.match(text, /Commands\*\* 2 \(1 portable\)/);
  assert.match(text, /Songs queued\*\* 3/);
  assert.match(text, /\*\*Ping\*\* 10 ms/);
  assert.match(text, /\*\*Heartbeat\*\* 42 ms/);
  assert.ok(!pub.fields.some((f) => f.name.includes('Panel')));
  const own = (await buildSpecs(client, { isOwner: true })).toJSON();
  assert.ok(own.fields.some((f) => f.name.includes('You') && /owner/i.test(f.value)), 'owners are told they are');
  const panelOf = (e) => e.fields.find((f) => f.name.includes('Panel')).value;
  assert.ok(!/http/.test(panelOf(own)), 'no address in a public reply');
  assert.ok(own.fields.every((f) => f.value.length <= 1024), 'every field fits Discord limits');

  const before = process.env.PANEL_PUBLIC_URL;
  process.env.PANEL_PUBLIC_URL = 'http://example.test:25570/';
  try {
    const priv = (await buildSpecs(client, { isOwner: true, isPrivate: true })).toJSON();
    assert.strictEqual(panelOf(priv), 'http://example.test:25570/');
  } finally { if (before === undefined) delete process.env.PANEL_PUBLIC_URL; else process.env.PANEL_PUBLIC_URL = before; }
});
