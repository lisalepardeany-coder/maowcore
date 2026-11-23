// Local YouTube stream proxy: only this PC, only with the key, only YouTube.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const ys = require('../lib/yt-stream');

test('yt-stream: recognises YouTube links only', () => {
  assert.equal(ys.isYouTube('https://www.youtube.com/watch?v=x'), true);
  assert.equal(ys.isYouTube('https://youtu.be/x'), true);
  assert.equal(ys.isYouTube('https://music.youtube.com/watch?v=x'), true);
  assert.equal(ys.isYouTube('https://youtube.com.evil.example/x'), false);
  assert.equal(ys.isYouTube('https://soundcloud.com/a/b'), false);
  assert.equal(ys.isYouTube('file:///C:/secret'), false);
});

test('yt-stream: refuses a wrong key or a non-YouTube target', async () => {
  const srv = http.createServer((req, res) => ys.handle(req, res, new URL(req.url, 'http://x'))).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const port = srv.address().port;
  const status = (u) => new Promise((r) => http.get(u, (res) => { res.resume(); r(res.statusCode); }));
  try {
    const good = ys.urlFor(port, 'https://www.youtube.com/watch?v=x');
    assert.match(good, /^http:\/\/127\.0\.0\.1:\d+\/yt-stream\?k=[0-9a-f]{32}&u=/);
    assert.equal(await status(good.replace(/k=[0-9a-f]+/, 'k=wrong')), 403);
    assert.equal(await status(ys.urlFor(port, 'https://example.com/a.mp3')), 403);
    assert.equal(ys.activeCount(), 0);
  } finally { srv.close(); }
});
