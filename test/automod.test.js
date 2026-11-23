'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const automod = require('../lib/automod');

test('automod.isScam: detects nitro/phishing patterns', () => {
  assert.equal(automod.isScam('free nitro here https://x.com'), true);
  assert.equal(automod.isScam('Claim your free gift now'), true);
  assert.equal(automod.isScam('check https://discordnitro.gift/abc'), true);   // look-alike domain
  assert.equal(automod.isScam('steam gift for you https://steamcommunity.ru.co'), true);
  assert.equal(automod.isScam('@everyone https://totally-legit.example'), true);
  assert.equal(automod.isScam('hey everyone how are you'), false);
  assert.equal(automod.isScam('here is the real discord.com link'), false);
  assert.equal(automod.isScam(''), false);
});

test('automod.matchesWordFilter: plain + regex (re:)', () => {
  assert.equal(automod.matchesWordFilter('this is a BadWord here', ['badword']), 'badword');
  assert.equal(automod.matchesWordFilter('totally clean', ['badword']), null);
  assert.equal(automod.matchesWordFilter('spammy spaaam', ['re:spa+m']), 're:spa+m');
  assert.equal(automod.matchesWordFilter('nope', ['re:spa+m']), null);
  assert.equal(automod.matchesWordFilter('x', ['re:[invalid(']), null); // bad regex → ignored, no throw
  assert.equal(automod.matchesWordFilter('anything', []), null);
});

test('automod.escalationActionFor: fires at exact rungs', () => {
  const ladder = { 3: 'timeout', 5: 'kick', 7: 'ban' };
  assert.equal(automod.escalationActionFor(ladder, 3), 'timeout');
  assert.equal(automod.escalationActionFor(ladder, 5), 'kick');
  assert.equal(automod.escalationActionFor(ladder, 7), 'ban');
  assert.equal(automod.escalationActionFor(ladder, 4), null);
  assert.equal(automod.escalationActionFor(ladder, 1), null);
  assert.equal(automod.escalationActionFor(null, 3), null);
});

test('automod.accountTooYoung: account-age gate', () => {
  const now = 1_000_000_000_000;
  const DAY = 86_400_000;
  assert.equal(automod.accountTooYoung(now - 2 * DAY, 7, now), true);
  assert.equal(automod.accountTooYoung(now - 10 * DAY, 7, now), false);
  assert.equal(automod.accountTooYoung(now - DAY, 0, now), false); // gate off
});
