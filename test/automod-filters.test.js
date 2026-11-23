// Automod filter fixes: real domain matching, whole-word bans, raid alert cooldown.
const test = require('node:test');
const assert = require('node:assert/strict');
const automod = require('../lib/automod');

test('link filter: allowed domain must be the real host', () => {
  const ok = ['youtube.com'];
  assert.equal(automod.hostAllowed('https://youtube.com/watch?v=1', ok), true);
  assert.equal(automod.hostAllowed('https://www.youtube.com/watch?v=1', ok), true);
  assert.equal(automod.hostAllowed('https://music.youtube.com/', ok), true);
  assert.equal(automod.hostAllowed('https://evil.com/?youtube.com', ok), false);
  assert.equal(automod.hostAllowed('https://youtube.com.evil.com/', ok), false);
  assert.equal(automod.hostAllowed('https://notyoutube.com/', ok), false);
  assert.equal(automod.hostAllowed('https://youtube.com/', ['https://youtube.com/']), true, 'tolerates pasted URLs');
  assert.equal(automod.hostAllowed('https://a.example.org/', ['*.example.org']), true);
});

test('word filter: whole words only, case-insensitive', () => {
  const words = ['ass', 'bad phrase'];
  assert.equal(automod.findBannedWord('this class is great', words), undefined);
  assert.equal(automod.findBannedWord('pass the salt', words), undefined);
  assert.equal(automod.findBannedWord('you ASS!', words), 'ass');
  assert.equal(automod.findBannedWord('a Bad Phrase here', words), 'bad phrase');
  assert.equal(automod.findBannedWord('no (regex) [chars] break it', ['(regex)']), '(regex)');
});

test('anti-raid: alerts once, not on every join after the 5th', () => {
  const config = require('../lib/config');
  const guild = { id: `raid-${Date.now()}` };
  automod.setAutomod(guild.id, { antiRaid: true });
  const results = Array.from({ length: 9 }, () => automod.checkRaid(guild));
  assert.deepEqual(results, [false, false, false, false, true, false, false, false, false]);
  config.updateGuild(guild.id, { automod: null });
});
