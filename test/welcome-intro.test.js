// Welcome sound before the first song of a session (lib/welcome-intro.js).
const test = require('node:test');
const assert = require('node:assert/strict');
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
