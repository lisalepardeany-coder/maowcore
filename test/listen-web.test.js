// Listen room with the bot NOT in a voice call: add a song, see it playing,
// and really get audio for it (lib/panel-features.js + web-queue + listen-stream).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('no voice call: a song added in the listen room plays in the browser', { timeout: 30000 }, async () => {
  const ffmpeg = process.env.FFMPEG_PATH || require('ffmpeg-static');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-lw-'));
  const wav = path.join(dir, 'tone.wav');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-y', wav]);
  // Stands in for YouTube: serves the audio file.
  const media = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'audio/wav' }); fs.createReadStream(wav).pipe(res); });
  await new Promise((r) => media.listen(0, '127.0.0.1', r));
  const songUrl = `http://127.0.0.1:${media.address().port}/tone.wav`;

  const guild = { id: 'g1', name: 'Test', iconURL: () => null, members: { cache: new Map(), fetch: async () => { throw new Error('x'); } } };
  const resolved = [];
  const logs = [];
  const control = {
    client: { guilds: { cache: Object.assign(new Map([['g1', guild]]), { first: () => guild }) }, users: { cache: new Map() },
      youtubePlugin: { search: async () => [] } },
    distube: {
      getQueue: () => undefined,
      voices: { get: () => undefined, collection: new Map() },
      queues: { collection: new Map() },
      handler: { resolve: async (u) => { resolved.push(u); return { name: 'Test tone', url: songUrl, duration: 3 }; } },
    },
    log: (t) => logs.push(t),
    _json: (res, body, status = 200) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body)),
    _readJsonBody: (req) => new Promise((r) => { let s = ''; req.on('data', (d) => { s += d; }); req.on('end', () => r(s ? JSON.parse(s) : {})); }),
  };
  const pf = require('../lib/panel-features');
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!(await pf.handle(req, res, u.pathname, control, u))) res.writeHead(404).end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    let s = await (await fetch(`${base}/api/listen/state`)).json();
    assert.equal(s.mode, 'web');
    assert.equal(s.canAdd, true, 'you can add songs with nobody in voice');
    assert.equal(s.nowPlaying, null);

    const add = await fetch(`${base}/api/listen/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'https://youtu.be/test' }) });
    assert.equal(add.status, 200, await add.clone().text());
    assert.deepEqual(resolved, ['https://youtu.be/test']);

    s = await (await fetch(`${base}/api/listen/state`)).json();
    assert.equal(s.nowPlaying.name, 'Test tone');
    assert.equal(s.paused, false);
    assert.equal(s.canPause, true, 'you added it, so you can pause it');

    const audio = await fetch(`${base}/api/listen/audio`);
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
    const bytes = (await audio.arrayBuffer()).byteLength;
    assert.ok(bytes > 20000, `got ${bytes} bytes of MP3; log: ${logs.join(' | ')}`);   // ~3 s at 128 kbit/s ≈ 48 KB

    const skip = await (await fetch(`${base}/api/listen/skip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    assert.match(skip.message, /Skipped — nothing left/);
    s = await (await fetch(`${base}/api/listen/state`)).json();
    assert.equal(s.nowPlaying, null);
  } finally {
    require('../lib/web-queue').clear('g1');
    srv.close(); media.close();
  }
});
