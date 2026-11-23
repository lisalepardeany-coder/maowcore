const test = require('node:test');
const assert = require('node:assert/strict');
const yt = require('../lib/yt-titles');

const fakeFetch = (title) => async () => ({ ok: true, json: async () => ({ title }) });

test('yt-titles: finds the video id in common link shapes', () => {
  assert.equal(yt.videoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), 'dQw4w9WgXcQ');
  assert.equal(yt.videoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(yt.videoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(yt.videoId('https://example.com'), null);
});

test('yt-titles: fills only empty names, in songs and playlists', async () => {
  const song = { name: '', url: 'https://youtu.be/aaaaaaaaaaa' };
  assert.equal(await yt.fix(song, fakeFetch('Real Title')), 1);
  assert.equal(song.name, 'Real Title');
  const named = { name: 'Keep me', url: 'https://youtu.be/bbbbbbbbbbb' };
  assert.equal(await yt.fix(named, fakeFetch('Other')), 0);
  assert.equal(named.name, 'Keep me');
  const pl = { songs: [{ name: '', url: 'https://youtu.be/ccccccccccc' }, { name: 'ok', url: 'https://youtu.be/ddddddddddd' }] };
  assert.equal(await yt.fix(pl, fakeFetch('Filled')), 1);
  assert.equal(pl.songs[0].name, 'Filled');
});

test('yt-titles: falls back to a readable name when lookup fails', async () => {
  const s = { name: '', url: 'https://youtu.be/eeeeeeeeeee', uploader: { name: 'NEFFEX' } };
  await yt.fix(s, async () => ({ ok: false }));
  assert.equal(s.name, 'NEFFEX – untitled');
});
