// Batch 4: warn rules, appeals cooldown, birthdays, automod shouting, mod log.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-b4-'));
process.env.DB_PATH = path.join(tmpDir, 'b4.db');

const tools = require('../lib/mod-tools');

test('warn rules: parse, match exactly, format', () => {
  assert.deepEqual(tools.parseRules('3=10m, 5=1h,7=1d'), [{ at: 3, minutes: 10 }, { at: 5, minutes: 60 }, { at: 7, minutes: 1440 }]);
  assert.throws(() => tools.parseRules('three=10m'), /Couldn't read/);
  assert.throws(() => tools.parseRules('3=30d'), /28 days/);
  assert.equal(tools.ruleFor(tools.DEFAULT_RULES, 5).minutes, 60);
  assert.equal(tools.ruleFor(tools.DEFAULT_RULES, 4), null);
  assert.equal(tools.fmtMin(10), '10 min');
  assert.equal(tools.fmtMin(120), '2 h');
  assert.equal(tools.fmtMin(2880), '2 days');
});

test('appeals: one per day', () => {
  const now = Date.now();
  assert.equal(tools.canAppeal(undefined, now), true);
  assert.equal(tools.canAppeal(now - 3600e3, now), false);
  assert.equal(tools.canAppeal(now - 25 * 3600e3, now), true);
});

test('birthdays: valid dates and who is celebrating (incl. 29 Feb)', () => {
  assert.equal(tools.validDay(29, 2), true);
  assert.equal(tools.validDay(31, 4), false);
  assert.equal(tools.validDay(0, 1), false);
  const people = { a: { d: 10, m: 11 }, b: { d: 29, m: 2 }, c: { d: 1, m: 1 } };
  assert.deepEqual(tools.birthdaysOn(people, new Date(2026, 10, 10)), ['a']);
  assert.deepEqual(tools.birthdaysOn(people, new Date(2027, 1, 28)), ['b'], 'leap-day birthday on 28 Feb in non-leap years');
  assert.deepEqual(tools.birthdaysOn(people, new Date(2028, 1, 28)), [], 'but not in leap years');
  assert.deepEqual(tools.birthdaysOn(people, new Date(2028, 1, 29)), ['b']);
});

test('automod: shouting detector', () => {
  const { isShouting } = require('../lib/automod');
  assert.equal(isShouting('WHY IS EVERYONE SO LOUD IN HERE'), true);
  assert.equal(isShouting('OK'), false, 'short messages are fine');
  assert.equal(isShouting('I love the NEW theme so much, thank you'), false);
  assert.equal(isShouting('check https://EXAMPLE.COM/ABCDEFGHIJKLMNOP thanks friend'), false, 'links do not count');
});

test('mod log: saved and filtered', () => {
  const modlog = require('../lib/modlog');
  modlog.record('g1', { action: 'warn', target: { id: '111', tag: 'Sam' }, mod: { tag: 'Hazel' }, reason: 'spam' });
  modlog.record('g1', { action: 'ban', target: '<@222222222222222222>', mod: 'Dashboard', reason: 'raid' });
  modlog.record('g2', { action: 'warn', target: { id: '111', tag: 'Sam' }, mod: 'x' });
  const all = modlog.list('g1');
  assert.equal(all.length, 2);
  assert.equal(all[0].action, 'ban');
  assert.equal(all[0].targetId, '222222222222222222');
  assert.equal(modlog.list('g1', { action: 'warn' })[0].target, 'Sam');
  assert.equal(modlog.list('g1', { targetId: '111' }).length, 1);
});

test('panel ranks for batch 4 routes', () => {
  const x = require('../lib/panel-extras');
  assert.equal(x.requiredRank('GET', '/api/mod/log'), 'moderator');
  assert.equal(x.requiredRank('POST', '/api/mod/warn-rules'), 'admin');
});
