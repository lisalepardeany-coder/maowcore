// The bot fetches its own uploads/sounds over HTTP (yt-dlp), without a token.
// With CONTROL_TOKEN set (automatic on panel servers) those fetches must
// still work, while outside visitors keep needing the token.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ControlServer } = require('../lib/control-server');

const req = (ip, headers = {}) => ({ socket: { remoteAddress: ip }, headers });
const fakeRes = () => { const r = { code: 0, writeHead(c) { r.code = c; return r; }, end() { return r; } }; return r; };
const server = Object.create(ControlServer.prototype);
server.authToken = 'secret';

test('self requests: only this machine, never through a proxy', () => {
  assert.equal(ControlServer.isSelfRequest(req('127.0.0.1')), true);
  assert.equal(ControlServer.isSelfRequest(req('::1')), true);
  assert.equal(ControlServer.isSelfRequest(req('::ffff:127.0.0.1')), true);
  assert.equal(ControlServer.isSelfRequest(req('172.18.0.1')), false);   // Docker gateway = outside
  assert.equal(ControlServer.isSelfRequest(req('203.0.113.9')), false);
  assert.equal(ControlServer.isSelfRequest(req('127.0.0.1', { 'x-forwarded-for': '203.0.113.9' })), false);
  assert.equal(ControlServer.isSelfRequest(req('127.0.0.1', { forwarded: 'for=203.0.113.9' })), false);
});

test('the bot can fetch its own library, sounds and ambience with a token set', () => {
  for (const p of ['/library/abc-song.mp3', '/sounds/airhorn.mp3', '/ambience/rain.wav']) {
    assert.equal(server._checkAuth(req('127.0.0.1'), fakeRes(), p), true, p);
  }
});

test('outside visitors still need the token for media and the API', () => {
  for (const p of ['/library/abc-song.mp3', '/sounds/airhorn.mp3', '/api/stats']) {
    const res = fakeRes();
    assert.equal(server._checkAuth(req('203.0.113.9'), res, p), false, p);
    assert.equal(res.code, 401);
  }
  // Local, but the API is not media: still needs the token.
  assert.equal(server._checkAuth(req('127.0.0.1'), fakeRes(), '/api/stats'), false);
  assert.equal(server._checkAuth(req('203.0.113.9', { authorization: 'Bearer secret' }), fakeRes(), '/library/x.mp3'), true);
});

test('a deleted library song leaves the queue (and is skipped if it\'s playing)', async () => {
  const u = (f) => `http://127.0.0.1:8765/library/${f}`;
  let skipped = 0;
  const queue = { songs: [{ url: u('gone.mp3') }, { url: u('keep.mp3') }, { url: u('gone.mp3') }, { url: 'https://youtu.be/x' }],
    skip: async () => { skipped++; queue.songs.shift(); } };
  const s = Object.create(ControlServer.prototype);
  s.distube = { queues: { collection: new Map([['g', queue]]) } };
  s.log = () => {};
  const n = await s._dropFromQueues('gone.mp3');
  assert.equal(n, 2);
  assert.equal(skipped, 1, 'the playing copy was skipped');
  assert.deepEqual(queue.songs.map((x) => x.url), [u('keep.mp3'), 'https://youtu.be/x']);
});

test('the dashboard\'s new files load before sign-in', () => {
  for (const p of ['/neon.css', '/neon.js']) assert.equal(server._checkAuth(req('203.0.113.9'), fakeRes(), p), true, p);
});
