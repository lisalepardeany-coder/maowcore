// Batch 6: checklists, routines, reminders per profile.
const test = require('node:test');
const assert = require('node:assert/strict');

test('checklists: create, tick, streak, validation', () => {
  const cl = require('../lib/checklists');
  cl._reset();
  const l = cl.create({ userId: 'u1', name: 'Morning meds', items: 'Vitamin D, Water , ,Breakfast', at: '09:00' });
  assert.deepEqual(l.items, ['Vitamin D', 'Water', 'Breakfast']);
  assert.throws(() => cl.create({ userId: 'u1', name: 'morning MEDS', items: 'x' }), /already/);
  assert.throws(() => cl.create({ userId: 'u1', name: 'X', items: '' }), /at least one/);
  assert.throws(() => cl.create({ userId: 'u1', name: 'Y', items: 'a', at: '9am' }), /09:00/);
  assert.throws(() => cl.toggle('someone-else', l.id, 0), /not found/);
  const d = (off) => cl.dayKey(new Date(Date.now() - off * 86400e3));
  for (const day of [d(2), d(1)]) for (let i = 0; i < 3; i++) cl.toggle('u1', l.id, i, day);
  assert.equal(cl.streak(cl.get(l.id)), 2, 'two full days before today');
  for (let i = 0; i < 3; i++) cl.toggle('u1', l.id, i);
  assert.equal(cl.streak(cl.get(l.id)), 3, 'today counts once it is done');
  cl.toggle('u1', l.id, 0);
  assert.deepEqual(cl.ticked(cl.get(l.id)), [1, 2], 'ticking again un-ticks');
  assert.equal(cl.remove('u1', l.id), true);
});

test('checklists: daily send window and one nudge', () => {
  const cl = require('../lib/checklists');
  const now = new Date(2026, 10, 10, 9, 5);
  const today = cl.dayKey(now);
  const base = { at: '09:00', items: ['a', 'b'], done: {} };
  assert.equal(cl.due([{ ...base, sentOn: null }], now).send.length, 1);
  assert.equal(cl.due([{ ...base, sentOn: today }], now).send.length, 0, 'once a day');
  assert.equal(cl.due([{ ...base, sentOn: null }], new Date(2026, 10, 10, 8, 59)).send.length, 0, 'not before the time');
  const later = new Date(2026, 10, 10, 11, 10);
  assert.equal(cl.due([{ ...base, sentOn: today }], later).nudge.length, 1, 'nudge after 2 h if unfinished');
  assert.equal(cl.due([{ ...base, sentOn: today, done: { [today]: [0, 1] } }], later).nudge.length, 0, 'no nudge when done');
  assert.equal(cl.due([{ ...base, sentOn: today, nudgedOn: today }], later).nudge.length, 0, 'only one nudge');
});

test('routines: starters, cleaning steps, save', () => {
  const rt = require('../lib/routines');
  rt._reset();
  const mine = rt.list('u1');
  assert.deepEqual(mine.map((r) => r.name), ['Morning', 'Wind down', 'Gaming']);
  const clean = rt.cleanSteps([{ type: 'theme', id: 'paper' }, { type: 'theme', id: '../bad' }, { type: 'volume', value: 999 }, { type: 'evil' }, { type: 'gentle', on: 1 }]);
  assert.deepEqual(clean, [{ type: 'theme', id: 'paper' }, { type: 'volume', value: 150 }, { type: 'gentle', on: true }]);
  const r = rt.saveRoutine('u1', { name: 'Study', emoji: '📚', steps: [{ type: 'ambience', preset: 'rain' }] });
  assert.equal(rt.find('u1', 'study').id, r.id);
  assert.throws(() => rt.saveRoutine('u1', { name: 'Empty', steps: [] }), /at least one/);
  assert.equal(rt.remove('u1', r.id), true);
});

test('reminders: remember which profile they belong to (and keep it on snooze)', () => {
  const reminders = require('../lib/reminders');
  reminders._reset();
  const now = Date.now();
  const r = reminders.add({ userId: 'u1', what: 'meds', fireAt: now - 1, profile: { id: 'p1', name: 'Sam', emoji: '🌙' } });
  assert.deepEqual(r.profile, { id: 'p1', name: 'Sam', emoji: '🌙' });
  reminders.markFired(r, now);
  const back = reminders.snooze(r.id, 'u1', 60000, now);
  assert.equal(back.profile.name, 'Sam');
  assert.equal(reminders.add({ userId: 'u1', what: 'x', fireAt: now + 1, profile: {} }).profile, null);
});

test('panel ranks for batch 6 routes', () => {
  const x = require('../lib/panel-extras');
  assert.equal(x.requiredRank('POST', '/api/checklists/toggle'), 'member');
  assert.equal(x.requiredRank('POST', '/api/routines/run'), 'moderator');
  assert.equal(x.requiredRank('POST', '/api/routines/save'), 'member');
});
