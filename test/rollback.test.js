// lib/rollback.js decisions and the error digest's 7-day history.
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, afterCheck, MAX_ATTEMPTS } = require('../lib/rollback');

const GOOD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);
const good = { commit: GOOD, version: '3.16.0' };

test('a passing start check makes this version the last good one', () => {
  const r = afterCheck({ bad: [NEW] }, NEW, '3.17.0', true);
  assert.deepEqual(r.state.good, { commit: NEW, version: '3.17.0' });
  assert.deepEqual(r.state.bad, []);
  assert.equal(r.markedBad, false);
});

test('a new version that fails is marked bad; the last good one failing is not', () => {
  const r = afterCheck({ good }, NEW, '3.17.0', false, '✕ Database');
  assert.equal(r.markedBad, true);
  assert.deepEqual(r.state.bad, [NEW]);
  assert.match(r.state.badReasons[NEW], /Database/);
  assert.equal(afterCheck({ good }, GOOD, '3.16.0', false).markedBad, false);   // the server, not the code
  assert.equal(afterCheck({}, NEW, '3.17.0', false).markedBad, false);          // nothing to go back to
});

test('pre-start goes back from a bad version, and only when there is a good one', () => {
  const d = decide({ good, bad: [NEW], badReasons: { [NEW]: 'its start check failed: x' } }, NEW, '3.17.0', 1000);
  assert.equal(d.action, 'rollback');
  assert.deepEqual(d.event.to, good);
  assert.equal(d.event.from.version, '3.17.0');
  assert.equal(d.event.reported, false);
  assert.equal(d.state.last, d.event);
  assert.equal(decide({ bad: [NEW] }, NEW, '3.17.0').action, 'start');
  assert.equal(decide({ good, bad: [] }, NEW, '3.17.0').action, 'start');
});

test('pre-start goes back when a new version keeps failing to start', () => {
  let s = { good };
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const d = decide(s, NEW, '3.17.0');
    assert.equal(d.action, 'start', `attempt ${i + 1}`);
    s = d.state;
  }
  const d = decide(s, NEW, '3.17.0');
  assert.equal(d.action, 'rollback');
  assert.match(d.event.reason, /started 3 times/);
  assert.ok(d.state.bad.includes(NEW));
  // A passing check resets the count, so normal restarts never add up.
  const ok = afterCheck(s, NEW, '3.17.0', true).state;
  assert.equal(decide(ok, NEW, '3.17.0').state.attempts.count, 1);
});

test('error digest keeps a 7-day history for the health card', async () => {
  const d = require('../lib/error-digest');
  const D = 86_400_000;
  const now = new Date(2026, 10, 26, 12).getTime();
  d._reset();
  d.note({ text: 'boom A' }, now - 2 * D);
  d.note({ text: 'boom A' }, now - 2 * D);
  d.note({ text: 'boom B' }, now);
  const prev = process.env.ERROR_DIGEST;
  process.env.ERROR_DIGEST = '0';                         // archive without sending
  try { await d.sendDue({ isReady: () => true }, now); } finally { if (prev === undefined) delete process.env.ERROR_DIGEST; else process.env.ERROR_DIGEST = prev; }
  const w = d.week(now);
  assert.equal(w.length, 7);
  assert.equal(w[4].total, 2);
  assert.equal(w[4].top[0].count, 2);
  assert.equal(w[6].total, 1);                            // today, live
  assert.equal(w[0].total, 0);
});
