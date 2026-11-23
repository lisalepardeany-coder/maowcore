// Batch 2: song radio picks, Spotify embed parsing, new panel ranks.
const test = require('node:test');
const assert = require('node:assert/strict');

test('song radio: skips queued, recent, long and live songs', () => {
  const { pickFresh } = require('../lib/song-radio');
  const rel = [
    { url: 'a', duration: 200 }, { url: 'b', duration: 200 }, { url: 'c', duration: 3600 },
    { url: 'd', isLive: true }, { url: 'e', duration: 180 }, { url: 'e', duration: 180 }, { url: 'f', duration: 240 },
  ];
  const picks = pickFresh(rel, { queued: ['a'], recent: ['b'], count: 5 });
  assert.deepEqual(picks.map((s) => s.url), ['e', 'f']);
  assert.equal(pickFresh(rel, { count: 1 }).length, 1);
  assert.deepEqual(pickFresh(null), []);
});

test('spotify embed: reads playlist id and tracks', () => {
  const se = require('../lib/spotify-embed');
  assert.deepEqual(se.parseUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x'), { type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
  assert.equal(se.parseUrl('https://open.spotify.com/intl-de/album/4LH4d3cOWNNsVw41Gqt2kv').type, 'album');
  assert.equal(se.parseUrl('https://example.com'), null);
  const data = { props: { pageProps: { state: { data: { entity: {
    name: 'Mix', coverArt: { sources: [{ url: 'small', width: 60 }, { url: 'big', width: 640 }] },
    trackList: [
      { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'Song A', subtitle: 'Artist A', duration: 200000 },
      { uri: 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB', title: 'Song B', subtitle: 'Artist B', duration: 100000, isPlayable: false },
    ],
  } } } } } };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
  const e = se.parseEmbed(html);
  assert.equal(e.name, 'Mix');
  assert.equal(e.image, 'big');
  assert.equal(e.tracks.length, 1, 'unplayable tracks are skipped');
  assert.deepEqual(e.tracks[0], { id: 'AAAAAAAAAAAAAAAAAAAAAA', name: 'Song A', artists: 'Artist A', duration: 200 });
  assert.equal(se.parseEmbed('<html>nothing</html>'), null);
});

test('panel ranks for batch 2 routes', () => {
  const x = require('../lib/panel-extras');
  assert.equal(x.requiredRank('GET', '/api/playlists'), 'member');
  assert.equal(x.requiredRank('POST', '/api/playlists/play'), 'member');
  assert.equal(x.requiredRank('GET', '/api/radio/search'), 'member');
  assert.equal(x.requiredRank('POST', '/api/radio/play'), 'moderator');
  assert.equal(x.requiredRank('POST', '/api/mood/play'), 'moderator');
  assert.equal(x.requiredRank('POST', '/api/similar'), 'moderator');
});
