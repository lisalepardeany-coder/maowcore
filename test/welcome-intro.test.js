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
  assert.equal(intro.stream.url, file, 'plays the local file: nothing to look up');
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
