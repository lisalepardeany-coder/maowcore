// Song request channel: which messages count as a request (lib/song-requests.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, MAX_LEN } = require('../lib/song-requests');

test('a song name is searched, a link is played as is', () => {
  assert.deepEqual(parse('  flash   fm  '), { query: 'flash fm', isUrl: false });
  assert.deepEqual(parse('https://youtu.be/abc123'), { query: 'https://youtu.be/abc123', isUrl: true });
  assert.deepEqual(parse('play this <https://youtu.be/abc123>'), { query: 'https://youtu.be/abc123', isUrl: true });
});

test('chat, empty and huge messages are left alone', () => {
  assert.equal(parse('# lol this song slaps').skip, true);
  assert.equal(parse('> quoting someone').skip, true);
  assert.equal(parse('   ').skip, true);
  assert.equal(parse('x'.repeat(MAX_LEN + 1)).skip, true);
});
