// The saved download queue, with a fake yt-dlp (no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

process.env.LIBRARY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-dq-lib-'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-dq-bin-'));
const script = path.join(dir, 'fake.js');
const modeFile = path.join(dir, 'mode.json');
// mode: { rate: bool, fail: ['v1'] }
fs.writeFileSync(script, `
  const fs = require('fs'); const path = require('path');
  const mode = JSON.parse(fs.readFileSync(${JSON.stringify(modeFile)}, 'utf8'));
  const args = process.argv.slice(2); const url = args[args.length - 1];
  const id = (url.match(/v=([\\w-]+)/) || [])[1] || 'x';
  if (args.includes('--flat-playlist') && url.startsWith('ytsearch1:')) { console.log('https://www.youtube.com/watch?v=s' + url.length); process.exit(0); }
  if (args.includes('--flat-playlist')) {
    process.stdout.write(JSON.stringify({ id: 'PL', title: 'Test list', entries: ['v1', 'v2', 'v3'].map((v) => ({ url: 'https://www.youtube.com/watch?v=' + v, title: 'Song ' + v })) }));
    process.exit(0);
  }
  if (mode.rate) { process.stderr.write('ERROR: [youtube] ' + id + ': The current session has been rate-limited by YouTube for up to an hour.\\n'); process.exit(1); }
  if ((mode.fail || []).includes(id)) { process.stderr.write('ERROR: [youtube] ' + id + ': Video unavailable\\n'); process.exit(1); }
  if (args.includes('--dump-single-json')) { process.stdout.write(JSON.stringify({ title: 'Song ' + id, duration: 10 })); process.exit(0); }
  const out = args[args.indexOf('-o') + 1].replace('%(ext)s', 'webm');
  fs.writeFileSync(out, 'audio'); console.log(out);`);
fs.writeFileSync(path.join(dir, 'yt-dlp'), '');
process.env.YTDLP_DIR = dir;
process.env.YTDLP_FILENAME = 'yt-dlp';
const setMode = (m) => fs.writeFileSync(modeFile, JSON.stringify(m));
setMode({});
const realSpawn = cp.spawn;
cp.spawn = (_bin, args, opts) => realSpawn(process.execPath, [script, ...args], opts);

const q = require('../lib/download-queue');
const until = async (fn, ms = 8000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 25)); } };
const fresh = () => { q._reset(); fs.rmSync(q.FILE, { force: true }); for (const f of fs.readdirSync(process.env.LIBRARY_DIR)) fs.rmSync(path.join(process.env.LIBRARY_DIR, f), { force: true, recursive: true }); delete require.cache[require.resolve('../lib/library')]; };

test('downloads: picked songs only, finishes as done, saved to disk', async () => {
  fresh(); setMode({});
  q.start({});
  const job = await q.create('https://www.youtube.com/playlist?list=PL', { pick: [0, 2] });
  await until(() => q.get(job.id).status === 'done');
  const j = q.get(job.id);
  assert.deepEqual(j.items.map((i) => i.status), ['done', 'excluded', 'done']);
  assert.equal(j.counts.total, 2);
  assert.ok(JSON.parse(fs.readFileSync(q.FILE, 'utf8')).jobs.length === 1, 'saved');
});

test('downloads: a failed song has its reason, and retry downloads only that one', async () => {
  fresh(); setMode({ fail: ['v2'] });
  q.start({});
  const job = await q.create('https://www.youtube.com/playlist?list=PL');
  await until(() => q.get(job.id).status === 'done');
  let j = q.get(job.id);
  assert.equal(j.counts.failed, 1);
  assert.match(j.items[1].error, /Video unavailable/);
  setMode({});
  q.retry(job.id);
  await until(() => q.get(job.id).status === 'done' && q.get(job.id).counts.failed === 0);
  j = q.get(job.id);
  assert.equal(j.items[1].status, 'done');   // the failed one downloaded on retry
  assert.equal(j.items[1].error, null);
  assert.deepEqual([j.items[0].status, j.items[2].status], ['done', 'done']); // the others weren't touched
});

test('downloads: YouTube rate limit → the queue waits (songs not failed), continues after', async () => {
  fresh(); setMode({ rate: true });
  q.start({});
  const job = await q.create('https://www.youtube.com/playlist?list=PL');
  await until(() => q.get(job.id).status === 'waiting');
  const j = q.get(job.id);
  assert.equal(j.counts.failed, 0);
  assert.ok(j.resumeAt > Date.now() + 30 * 60 * 1000, 'waits about an hour');
  setMode({});
  q.continueNow(); // "Try now" in the panel; the timer does the same after the wait
  await until(() => q.get(job.id).status === 'done');
  assert.equal(q.get(job.id).counts.done, 3);
});

test('downloads: after a restart, songs that were downloading continue', async () => {
  fresh(); setMode({});
  const saved = { pausedUntil: 0, jobs: [{ id: 'dl-old', url: 'u', name: 'Old', source: 'youtube', format: 'original', status: 'running', createdAt: 1, items: [
    { i: 0, title: 'A', url: 'https://www.youtube.com/watch?v=v1', status: 'done' },
    { i: 1, title: 'B', url: 'https://www.youtube.com/watch?v=v2', status: 'downloading' },
    { i: 2, title: 'C', url: 'https://www.youtube.com/watch?v=v3', status: 'pending' },
  ] }] };
  fs.writeFileSync(q.FILE, JSON.stringify(saved));
  const logs = [];
  q.start({ onLog: (t) => logs.push(t) });
  assert.ok(logs.some((l) => /Continuing 1 unfinished download/.test(l)));
  await until(() => q.get('dl-old').status === 'done', 12000);
  assert.deepEqual(q.get('dl-old').items.map((i) => i.status), ['done', 'done', 'done']);
});

test('downloads: pause keeps songs in line, cancel stops them', async () => {
  fresh(); setMode({ rate: true }); // nothing completes, so we can act mid-way
  q.start({});
  const job = await q.create('https://www.youtube.com/playlist?list=PL');
  q.pause(job.id);
  assert.equal(q.get(job.id).status, 'paused');
  q.cancel(job.id);
  const j = q.get(job.id);
  assert.equal(j.status, 'cancelled');
  assert.ok(j.items.every((i) => i.status === 'cancelled'));
  q.remove(job.id);
  assert.equal(q.get(job.id), null);
});

test('downloads: Spotify songs become YouTube searches', () => {
  assert.equal(q.searchFor({ artists: 'Daft Punk', name: 'One More Time' }), 'ytsearch1:Daft Punk - One More Time audio');
  assert.deepEqual(q.spotifyId('https://open.spotify.com/intl-de/album/4m2880jivSbbyEGAKfITCa?si=x'), { type: 'album', id: '4m2880jivSbbyEGAKfITCa' });
  assert.equal(q.sourceOf('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'), 'spotify');
});

test.after(() => { q._reset(); cp.spawn = realSpawn; });
