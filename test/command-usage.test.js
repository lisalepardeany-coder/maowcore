const test = require('node:test');
const assert = require('node:assert/strict');
const usage = require('../lib/command-usage');

const cmd = (json) => ({ data: { toJSON: () => json } });
const commands = new Map([
  ['play', cmd({ name: 'play', options: [{ type: 3, name: 'query' }] })],
  ['mod', cmd({ name: 'mod', options: [
    { type: 1, name: 'kick' }, { type: 1, name: 'ban' },
    { type: 2, name: 'tools', options: [{ type: 1, name: 'warn' }] },
  ] })],
  ['pet', cmd({ name: 'pet', options: [] })],
]);

test('knownPaths expands subcommands and groups', () => {
  assert.deepEqual(usage.knownPaths(commands), ['mod ban', 'mod kick', 'mod tools warn', 'pet', 'play']);
});

test('pathOf reads group and subcommand', () => {
  const i = { commandName: 'mod', options: { getSubcommandGroup: () => 'tools', getSubcommand: () => 'warn' } };
  assert.equal(usage.pathOf(i), 'mod tools warn');
  assert.equal(usage.pathOf({ commandName: 'play', options: { getSubcommandGroup: () => null, getSubcommand: () => null } }), 'play');
});

test('report sums subcommands per top-level command, per server', () => {
  const now = Date.UTC(2026, 10, 26);
  usage._reset({ _since: now - 40 * usage.DAY });
  usage.record('g1', 'play', true, now);
  usage.record('g1', 'play', false, now);
  usage.record('g1', 'mod kick', true, now - usage.DAY);
  usage.record('g2', 'pet', true, now);
  const r = usage.report('g1', commands, now);
  assert.equal(r.days, 40);
  const by = Object.fromEntries(r.commands.map((c) => [c.name, c]));
  assert.equal(r.commands[0].name, 'play');
  assert.equal(by.play.runs, 2);
  assert.equal(by.play.errors, 1);
  assert.equal(by.mod.runs, 1);
  assert.equal(by.mod.subs, 3);
  assert.equal(by.mod.usedSubs, 1);
  assert.equal(by.pet.runs, 0);                       // used in g2 only
  assert.equal(by.pet.reason, 'Never used in 40 days');
  assert.equal(by.play.reason, null);
});

test('removalReason waits for enough data, flags stale and failing commands', () => {
  const now = Date.UTC(2026, 10, 26); const D = usage.DAY;
  const c = (runs, errors, lastAt) => ({ runs, errors, lastAt });
  assert.equal(usage.removalReason(c(0, 0, 0), now, now - 3 * D), null);
  assert.equal(usage.removalReason(c(0, 0, 0), now, now - 20 * D), 'Never used in 20 days');
  assert.equal(usage.removalReason(c(4, 0, now - 70 * D), now, now - 90 * D), 'Not used for 70 days');
  assert.equal(usage.removalReason(c(10, 6, now), now, now - D), 'Fails often (60%)');
});
