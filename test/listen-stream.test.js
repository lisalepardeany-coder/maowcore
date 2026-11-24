// Listen-room audio: a real ffmpeg run on a generated library song.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

process.env.LIBRARY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-listen-'));
const ls = require('../lib/listen-stream');
const ffmpeg = process.env.FFMPEG_PATH || require('ffmpeg-static');

const serve = (song, at) => new Promise((resolve) => {
  const srv = http.createServer((req, res) => ls.stream(req, res, { song, at }));
  srv.listen(0, '127.0.0.1', () => resolve(srv));
});
const fetchBytes = (port, max = 4096) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
    const chunks = []; let n = 0;
    res.on('data', (c) => { chunks.push(c); n += c.length; if (n >= max) { res.destroy(); resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }); } });
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }));
  }).on('error', reject);
});

test('streams a library song as MP3 from a given second', { timeout: 30000 }, async () => {
  const file = 'abc-tone.wav';
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-y', path.join(process.env.LIBRARY_DIR, file)]);
  const song = { url: `http://127.0.0.1:8765/library/${file}`, duration: 8, stream: { playFromSource: true } };
  const srv = await serve(song, 3);
  try {
    const r = await fetchBytes(srv.address().port);
    assert.equal(r.status, 200);
    assert.equal(r.type, 'audio/mpeg');
    assert.ok(r.body.length > 1000, `got ${r.body.length} bytes`);
    // MP3 frame sync (0xFFEx/0xFFFx) somewhere at the start.
    const sync = r.body.findIndex((b, i) => b === 0xff && (r.body[i + 1] & 0xe0) === 0xe0);
    assert.ok(sync >= 0 && sync < 600, 'MP3 frames');
  } finally { srv.close(); }
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(ls._count(), 0, 'ffmpeg stopped when the listener left');
});

test('a deleted library song answers with an error, not silence', async () => {
  const song = { url: 'http://127.0.0.1:8765/library/gone.mp3', duration: 10, stream: { playFromSource: true } };
  const srv = await serve(song, 0);
  try {
    const r = await fetchBytes(srv.address().port);
    assert.equal(r.status, 502);
    assert.match(r.body.toString(), /deleted/);
  } finally { srv.close(); }
});

test('Spotify songs stream their YouTube match; seek only when asked', () => {
  const yt = { url: 'https://www.youtube.com/watch?v=x', stream: { playFromSource: true } };
  const sp = { url: 'https://open.spotify.com/track/abc', stream: { playFromSource: false, song: yt } };
  assert.equal(ls.playedSong(sp), yt);
  assert.equal(ls.playedSong(yt), yt);
  const a = ls.ffmpegArgs({ input: 'x', remote: true }, 42.7);
  assert.deepEqual(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 2), ['-ss', '42']);
  assert.ok(a.includes('-reconnect'));
  assert.ok(!ls.ffmpegArgs({ input: 'x', remote: false }, 0).includes('-ss'));
});
