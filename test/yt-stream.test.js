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

test('yt-stream: video ID from every kind of YouTube link', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [`https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?t=30`, `https://music.youtube.com/watch?v=${id}&si=x`,
    `https://m.youtube.com/watch?feature=share&v=${id}`, `https://www.youtube.com/shorts/${id}`]) assert.equal(ys.videoId(u), id, u);
  assert.equal(ys.videoId('https://www.youtube.com/playlist?list=PL123'), null);
  assert.equal(ys.videoId('https://soundcloud.com/a/b'), null);
  assert.equal(ys.videoId('not a url'), null);
});

// ===== early download, with a fake yt-dlp =====
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fakes = [];
const fakeProc = () => {
  const p = new EventEmitter();
  p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.exitCode = null;
  p.end = (code = 0) => { p.stdout.end(); p.stderr.end(); setImmediate(() => { p.exitCode = code; p.emit('close', code); }); };
  p.kill = () => { if (p.exitCode === null) p.end(null); };
  fakes.push(p);
  return p;
};
const serve = async (fn) => {
  ys._setSpawn(fakeProc);
  fakes.length = 0;
  const srv = http.createServer((req, res) => ys.handle(req, res, new URL(req.url, 'http://x'))).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const get = (video) => new Promise((r) => http.get(ys.urlFor(srv.address().port, video), (res) => {
    const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => r({ status: res.statusCode, body: Buffer.concat(c).toString() }));
  }));
  try { await fn(get); } finally { srv.close(); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('yt-stream: ffmpeg joins a download that is still starting (no second yt-dlp)', () => serve(async (get) => {
  assert.equal(ys.prefetch('https://www.youtube.com/watch?v=AAAAAAAAAAA'), true);
  const req = get('https://youtu.be/AAAAAAAAAAA');   // same song, other link form
  await wait(30);
  fakes[0].stdout.write('first-'); fakes[0].stdout.write('second'); fakes[0].end();
  const r = await req;
  assert.equal(r.status, 200);
  assert.equal(r.body, 'first-second');
  assert.equal(fakes.length, 1, 'only one yt-dlp ran');
  assert.equal(ys.prefetchedCount(), 0);
  await wait(10);
  assert.equal(ys.activeCount(), 0);
}));

test('yt-stream: a song that finished downloading early is handed over whole', () => serve(async (get) => {
  ys.prefetch('https://www.youtube.com/watch?v=BBBBBBBBBBB');
  fakes[0].stdout.write('whole-song'); fakes[0].end();
  await wait(30);
  const r = await get('https://www.youtube.com/watch?v=BBBBBBBBBBB');
  assert.deepEqual([r.status, r.body, fakes.length], [200, 'whole-song', 1]);
  await wait(10);
  assert.equal(ys.activeCount(), 0);
}));

test('yt-stream: an early download that fails gives ffmpeg a clear error', () => serve(async (get) => {
  ys.prefetch('https://www.youtube.com/watch?v=CCCCCCCCCCC');
  const req = get('https://www.youtube.com/watch?v=CCCCCCCCCCC');
  await wait(30);
  fakes[0].stderr.write('ERROR: [youtube] CCCCCCCCCCC: Video unavailable\n');
  await wait(10);
  fakes[0].end(1);
  const r = await req;
  assert.equal(r.status, 502);
  assert.match(r.body, /Video unavailable/);
  assert.equal(fakes.length, 1);
  await wait(10);
  assert.equal(ys.activeCount(), 0);
}));

test('yt-stream: without an early download it starts one itself', () => serve(async (get) => {
  const req = get('https://www.youtube.com/watch?v=DDDDDDDDDDD');
  await wait(30);
  assert.equal(fakes.length, 1);
  fakes[0].stdout.write('fresh'); fakes[0].end();
  assert.deepEqual(await req, { status: 200, body: 'fresh' });
}));
