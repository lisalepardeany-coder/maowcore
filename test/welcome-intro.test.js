// Welcome sound before the first song of a session (lib/welcome-intro.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.WELCOME_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-welcome-'));
const wi = require('../lib/welcome-intro');

const fakeDistube = (result, fail) => ({
  handler: { resolve: async (url, opts) => { if (fail) throw new Error('nope'); return typeof result === 'function' ? result(url, opts) : result; } },
});
const fakeQueue = (songs) => {
  const q = { songs: [...songs], skipped: 0, async skip() { q.skipped++; q.songs.shift(); } };
  return q;
};

test('the welcome sound plays first, then the song from the start', async () => {
  const song = { name: 'Flash FM', url: 'yt:song' };
  const q = fakeQueue([song, { name: 'next' }]);
  wi.prepare(fakeDistube((url, opts) => ({ name: 'hi', url, metadata: opts.metadata })), q, 'yt:welcome');
  assert.equal(await wi.maybeIntro(q, song), true);
  assert.equal(q.skipped, 1);
  assert.deepEqual(q.songs.map((s) => s.name), ['hi', 'Flash FM', 'next']);
  assert.ok(wi.isIntro(q.songs[0]));
  // When the welcome sound and then the song play, nothing happens again.
  assert.equal(await wi.maybeIntro(q, q.songs[0]), false);
  assert.equal(await wi.maybeIntro(q, song), false);
  assert.equal(q.skipped, 1);
});

test('only once per session, and not without a welcome sound', async () => {
  const song = { name: 'a', url: 'yt:a' };
  const q = fakeQueue([song]);
  wi.prepare(fakeDistube({ name: 'hi' }), q, '');
  assert.equal(await wi.maybeIntro(q, song), false);
  assert.equal(q.skipped, 0);
});

test('a welcome sound that can\'t load just lets the song play', async () => {
  const song = { name: 'a', url: 'yt:a' };
  const q = fakeQueue([song]);
  const logs = [];
  wi.prepare(fakeDistube(null, true), q, 'yt:broken', (t) => logs.push(t));
  assert.equal(await wi.maybeIntro(q, song), false);
  assert.equal(q.skipped, 0);
  assert.match(logs[0], /couldn't be loaded/);
});

// The normal case: the welcome sound is already downloaded.
const cacheIt = (url, duration = 3) => {
  const key = wi.keyOf(url);
  const file = path.join(wi.CACHE_DIR, `${key}.webm`);
  fs.writeFileSync(file, 'audio');
  fs.writeFileSync(path.join(wi.CACHE_DIR, `${key}.json`), JSON.stringify({ url, duration }));
  return file;
};

test('cached: the welcome sound is first and starts at once, before the song has loaded', async () => {
  const url = 'https://www.youtube.com/shorts/cached1';
  const file = cacheIt(url, 4);
  let played = 0;
  const q = { id: 'g1', songs: [], play: async () => { played++; } };
  const lookups = [];
  wi.prepare({ handler: { resolve: async (u) => { lookups.push(u); return null; } } }, q, url);
  assert.equal(q.songs.length, 1, 'in the queue right away');
  const intro = q.songs[0];
  assert.ok(wi.isIntro(intro));
  assert.equal(intro.stream.url, require('node:url').pathToFileURL(file).href, 'plays the saved file: nothing to look up');
  assert.equal(intro.stream.playFromSource, true);
  assert.equal(intro.duration, 4);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(played, 1, 'started without waiting for the song');
  assert.deepEqual(lookups, [], 'no online lookup');
  // The requested song then arrives and plays after it; no second intro.
  const song = { name: 'Flash FM' };
  q.songs.push(song);
  assert.equal(await wi.maybeIntro(q, song), false);
});

test('idle join (/join, 24/7): the cached sound plays once, not twice', () => {
  const url = 'https://www.youtube.com/shorts/cached2';
  cacheIt(url);
  const what = wi.forIdleJoin('g2', url);
  assert.ok(wi.isIntro(what), 'a ready song, not a link to look up');
  const q = { id: 'g2', songs: [], play: async () => {} };
  wi.prepare({ handler: { resolve: async () => null } }, q, url);
  assert.equal(q.songs.length, 0, 'the queue for that sound doesn\'t get a second copy');
  // Next session in that server works normally again.
  const q2 = { id: 'g2', songs: [], play: async () => {} };
  wi.prepare({ handler: { resolve: async () => null } }, q2, url);
  assert.equal(q2.songs.length, 1);
});

test('only when the bot just joined voice, not for every new queue while it stays', () => {
  const url = 'https://www.youtube.com/shorts/cached3';
  cacheIt(url);
  const dt = { handler: { resolve: async () => null } };
  const newQ = () => ({ id: 'g3', songs: [], play: async () => {} });
  // Bot has been in the channel for a minute (last song ended, new /play): no welcome.
  wi.noteJoin('g3', Date.now() - 60000);
  const sitting = newQ();
  wi.prepare(dt, sitting, url);
  assert.equal(sitting.songs.length, 0);
  // Bot just joined: welcome.
  wi.noteJoin('g3');
  const fresh = newQ();
  wi.prepare(dt, fresh, url);
  assert.equal(fresh.songs.length, 1);
  // Bot left and comes back later: welcome again.
  wi.noteJoin('g3', Date.now() - 60000);
  wi.noteLeave('g3');
  const back = newQ();
  wi.prepare(dt, back, url);
  assert.equal(back.songs.length, 1);
  assert.equal(wi.justJoined('never-seen'), true, 'Discord reporting the join late still counts as new');
});

// The real thing: DisTube's own stream class must accept the address and
// ffmpeg must get audio out of it (v3.11.2 crashed here with "Invalid URL").
test('the cached welcome sound really plays through DisTube\'s stream (via the bot\'s own server)', { timeout: 30000 }, async () => {
  const http = require('node:http');
  const { execFileSync } = require('node:child_process');
  const { DisTubeStream } = require('distube');
  const { ControlServer } = require('../lib/control-server');
  const ffmpeg = process.env.FFMPEG_PATH || require('ffmpeg-static');
  const url = 'https://www.youtube.com/shorts/real1';
  const key = wi.keyOf(url);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=2', '-y', path.join(wi.CACHE_DIR, `${key}.wav`)]);
  fs.writeFileSync(path.join(wi.CACHE_DIR, `${key}.json`), JSON.stringify({ url, duration: 2 }));

  const cs = Object.create(ControlServer.prototype);
  const srv = http.createServer((req, res) => cs._serveWelcomeFile(new URL(req.url, 'http://x').pathname, req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  wi.setUrlMaker((file) => `http://127.0.0.1:${srv.address().port}/welcome-cache/${encodeURIComponent(path.basename(file))}`);
  try {
    const song = wi.songFor(url, wi.cached(url));
    assert.match(song.stream.url, /^http:\/\/127\.0\.0\.1:\d+\/welcome-cache\//);
    // 1) DisTube's stream accepts the address (3.11.2 threw "Invalid URL" here).
    let st;
    assert.doesNotThrow(() => { st = new DisTubeStream(song.stream.url, { ffmpeg: { path: ffmpeg, args: { global: {}, input: {}, output: {} } } }); });
    st.kill();
    // 2) ffmpeg, with the input settings DisTube uses, reads the whole sound from that address.
    const { spawn } = require('node:child_process');
    const ff = spawn(ffmpeg, ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-analyzeduration', '0',
      '-hide_banner', '-loglevel', 'error', '-i', song.stream.url, '-ar', '48000', '-ac', '2', '-f', 's16le', 'pipe:1'], { windowsHide: true });
    let bytes = 0;
    ff.stdout.on('data', (d) => { bytes += d.length; });
    ff.stderr.resume();
    const code = await new Promise((r) => ff.on('close', r));
    assert.equal(code, 0, 'ffmpeg read the welcome sound');
    assert.ok(bytes > 350000, `got ${bytes} bytes of audio`);   // 2 s of 48 kHz stereo PCM = 384 000
    // The .json next to it isn't served.
    const meta = await fetch(`http://127.0.0.1:${srv.address().port}/welcome-cache/${key}.json`);
    assert.equal(meta.status, 403);
  } finally {
    wi.setUrlMaker(null);
    srv.close();
  }
});

test('without the bot\'s server, the address is still a valid URL for DisTube', () => {
  wi.setUrlMaker(null);
  const url = 'https://www.youtube.com/shorts/real2';
  cacheIt(url);
  const song = wi.songFor(url, wi.cached(url));
  assert.doesNotThrow(() => new URL(song.stream.url));
  assert.match(song.stream.url, /^file:/);
});

test('a playlist link uses its first song; a skipped-away song is left alone', async () => {
  const song = { name: 'a', url: 'yt:a' };
  const q = fakeQueue([song]);
  wi.prepare(fakeDistube({ songs: [{ name: 'first' }, { name: 'second' }] }), q, 'yt:list');
  assert.equal(await wi.maybeIntro(q, song), true);
  assert.equal(q.songs[0].name, 'first');

  const s2 = { name: 'b' };
  const q2 = fakeQueue([s2]);
  wi.prepare(fakeDistube({ name: 'hi' }), q2, 'yt:w');
  q2.songs.shift();                       // song was skipped before the lookup finished
  assert.equal(await wi.maybeIntro(q2, s2), false);
});
