const test = require('node:test');
const assert = require('node:assert/strict');

test('starboard: author and bots don\'t count unless allowed; threshold', () => {
  const sb = require('../lib/starboard');
  const users = [{ id: 'a' }, { id: 'b' }, { id: 'bot', bot: true }, { id: 'author' }];
  assert.equal(sb.countStars(users, 'author'), 2);
  assert.equal(sb.countStars(users, 'author', true), 3);
  assert.equal(sb.qualifies(2), false);
  assert.equal(sb.qualifies(3), true);
  assert.equal(sb.qualifies(1, 1), true);
});

test('tidy-up: the same song under different titles is grouped', () => {
  const { simplifyTitle, scan } = require('../lib/library-cleanup');
  assert.equal(simplifyTitle('Daft Punk - Get Lucky (Official Audio)'), simplifyTitle('daft punk - get lucky [Lyrics]'));
  assert.equal(simplifyTitle('Song ft. Someone'), simplifyTitle('Song'));
  assert.notEqual(simplifyTitle('Get Lucky'), simplifyTitle('Get Lucky Remix'));
  const songs = [
    { id: '1', name: 'Get Lucky (Official Audio)', durationSec: 248, addedAt: 1, size: 5 },
    { id: '2', name: 'GET LUCKY [Lyrics]', durationSec: 249, addedAt: 2, size: 6 },
    { id: '3', name: 'Get Lucky', durationSec: 369, addedAt: 3, size: 7 }, // the 6-min album version: not a duplicate
  ];
  const report = scan({ list: () => songs }, { allGuilds: () => [] });
  const g = report.dupes.find((d) => d.kind === 'similar');
  assert.deepEqual(g.songs.map((s) => s.id).sort(), ['1', '2']);
  assert.equal(g.keep, '1'); // the first one you got
});

test('cookies: login expiry is read from the sign-in cookies', () => {
  const yc = require('../lib/yt-cookies');
  const now = Date.parse('2026-11-23T00:00:00Z');
  const exp = Math.floor((now + 2.5 * 86400000) / 1000);
  const text = `${yc.HEADER}\n.youtube.com\tTRUE\t/\tTRUE\t${exp}\tLOGIN_INFO\tx\n.youtube.com\tTRUE\t/\tTRUE\t${exp + 999999}\tPREF\ty\n`;
  assert.deepEqual(yc.loginExpiry(text, now), { at: exp * 1000, daysLeft: 2 });
  assert.equal(yc.loginExpiry(`${yc.HEADER}\n.youtube.com\tTRUE\t/\tTRUE\t${exp}\tPREF\ty\n`, now), null);
});

test('backups: never cookies, logins, API keys or leftovers', () => {
  const { include } = require('../lib/offsite-backup');
  for (const f of ['youtube-cookies.txt', 'youtube-cookies.txt.bak', 'sessions.json', 'api-tokens.json', 'config.json.bak',
    'giveaways.json.corrupt-2026-11-23', 'history.json.pre-v3.1', 'package-lock.before-update.json', 'maow.db-wal', '.supervisor.json']) {
    assert.equal(include(f), false, f);
  }
  for (const f of ['config.json', 'giveaways.json', 'download-jobs.json', 'starboard.json', 'status.json']) assert.equal(include(f), true, f);
});

test('backups: a pack has no cookie or login files in it', async () => {
  const { pack } = require('../lib/offsite-backup');
  const zlib = require('node:zlib');
  const { buffer } = await pack();
  const bundle = JSON.parse(zlib.gunzipSync(buffer).toString('utf8'));
  assert.equal(bundle.kind, 'maowcore-backup');
  assert.ok(!Object.keys(bundle.files).some((k) => /cookies|sessions\.json|api-tokens/.test(k)));
});

test('downloads: which links are playlists', () => {
  const { isCollectionUrl } = require('../lib/download-queue');
  assert.equal(isCollectionUrl('https://www.youtube.com/watch?v=abc'), false);
  assert.equal(isCollectionUrl('https://www.youtube.com/watch?v=abc&list=PL1'), true);
  assert.equal(isCollectionUrl('https://www.youtube.com/playlist?list=PL1'), true);
  assert.equal(isCollectionUrl('https://soundcloud.com/x/sets/y'), true);
  assert.equal(isCollectionUrl('https://open.spotify.com/track/abc'), true);
  assert.equal(isCollectionUrl('not a link'), false);
});
