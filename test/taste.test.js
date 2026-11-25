// Smarter autoplay (lib/taste.js): what counts as a skip / finish, and that
// autoplay uses pick() instead of DisTube's first related song.
const test = require('node:test');
const assert = require('node:assert/strict');
const taste = require('../lib/taste');

test('early leave = skip, played through = finish, the middle = no opinion', () => {
  assert.equal(taste.outcome(10, 200), 'skip');
  assert.equal(taste.outcome(190, 200), 'finish');
  assert.equal(taste.outcome(100, 200), null);
  assert.notEqual(taste.outcome(20, 30), 'skip', 'a 30 s clip heard for 20 s is not a skip');
  assert.equal(taste.outcome(5, 0), null, 'live streams have no opinion');
});

test('notePlay judges the song that was on before', () => {
  taste._reset();
  const t0 = 1_000_000;
  const a = { id: 'a', duration: 200, uploader: { name: 'Neon Drive - Topic' } };
  const b = { id: 'b', duration: 200, uploader: { name: 'Other' } };
  taste.notePlay('g', a, t0);
  taste.notePlay('g', b, t0 + 5_000);         // a skipped after 5 s
  taste.noteStop('g', t0 + 5_000 + 199_000);  // b played through
  const s = taste.stats('g');
  assert.deepEqual([s.songs.a.skips, s.songs.a.finishes], [1, 0]);
  assert.deepEqual([s.songs.b.skips, s.songs.b.finishes], [0, 1]);
  assert.equal(s.artists['neon drive'].skips, 1, '" - Topic" is the same artist');
});

test('/stop does not count as a skip', () => {
  taste._reset();
  taste.notePlay('g', { id: 'x', duration: 200 }, 0);
  taste.forget('g');
  taste.notePlay('g', { id: 'y', duration: 200 }, 3_000);
  assert.equal(taste.stats('g').songs.x, undefined);
});

test('autoplay adds pick()\'s choice, skipping songs already heard', async () => {
  taste._reset();
  const related = [{ id: 'heard' }, { id: 'r1' }, { id: 'r2' }];
  const added = [];
  const q = {
    id: 'g2', songs: [{ id: 'now', metadata: { m: 1 } }], previousSongs: [{ id: 'heard' }], clientMember: 'bot',
    handler: { _getPluginFromSong: async () => ({ getRelatedSongs: async () => related }) },
    addToQueue: (s) => added.push(s),
    _addRelatedSong: async () => { throw new Error('original should not run'); },
  };
  taste.attach(q);
  const next = await q._addRelatedSong();
  assert.notEqual(next.id, 'heard');
  assert.equal(added[0], next);
  assert.deepEqual(next.metadata, { m: 1 });
});

test('no related songs: falls back to DisTube\'s own way', async () => {
  let fellBack = false;
  const q = {
    id: 'g3', songs: [{ id: 'now', stream: { playFromSource: true } }], previousSongs: [],
    handler: { _getPluginFromSong: async () => null },
    addToQueue: () => {},
    _addRelatedSong: async () => { fellBack = true; return 'x'; },
  };
  taste.attach(q);
  assert.equal(await q._addRelatedSong(), 'x');
  assert.ok(fellBack);
});
