const test = require('node:test');
const assert = require('node:assert/strict');
const vs = require('../lib/vote-skip');

test('vote-skip: votes needed never exceed the people in voice', () => {
  assert.equal(vs.needed(1, 0.5), 1);   // alone: you can always skip
  assert.equal(vs.needed(2, 0.5), 1);
  assert.equal(vs.needed(3, 0.5), 2);
  assert.equal(vs.needed(4, 0.5), 2);
  assert.equal(vs.needed(4, 1), 4);
  assert.equal(vs.needed(0, 0.5), 1);
});

test('vote-skip: only people in voice can vote, and it passes at the threshold', () => {
  const g = 'g1';
  vs.clear(g);
  const listenerIds = ['a', 'b', 'c'];
  assert.deepEqual(vs.vote(g, { userId: 'z', songKey: 's1', listenerIds, ratio: 0.5 }), { ok: false, reason: 'not-in-voice' });
  const one = vs.vote(g, { userId: 'a', songKey: 's1', listenerIds, ratio: 0.5 });
  assert.equal(one.passed, false);
  assert.equal(one.count, 1);
  assert.equal(one.needed, 2);
  const again = vs.vote(g, { userId: 'a', songKey: 's1', listenerIds, ratio: 0.5 });
  assert.equal(again.count, 1, 'voting twice counts once');
  const two = vs.vote(g, { userId: 'b', songKey: 's1', listenerIds, ratio: 0.5 });
  assert.equal(two.passed, true);
  vs.clear(g);
});

test('vote-skip: votes are per song and drop people who left', () => {
  const g = 'g2';
  vs.clear(g);
  vs.vote(g, { userId: 'a', songKey: 's1', listenerIds: ['a', 'b', 'c', 'd'], ratio: 0.75 });
  const next = vs.vote(g, { userId: 'b', songKey: 's2', listenerIds: ['a', 'b', 'c', 'd'], ratio: 0.75 });
  assert.equal(next.count, 1, 'a new song starts a new vote');
  vs.vote(g, { userId: 'c', songKey: 's2', listenerIds: ['a', 'b', 'c', 'd'], ratio: 0.75 });
  const left = vs.vote(g, { userId: 'a', songKey: 's2', listenerIds: ['a', 'c', 'd'], ratio: 0.75 });
  assert.equal(left.count, 2, 'b left the channel, so their vote is gone');
  vs.clear(g);
});

test('vote-skip: who skips right away', () => {
  assert.equal(vs.canSkipNow({ djRoleSet: false }), true, 'no DJ role: everyone');
  assert.equal(vs.canSkipNow({ djRoleSet: true }), false);
  assert.equal(vs.canSkipNow({ djRoleSet: true, isDJ: true }), true);
  assert.equal(vs.canSkipNow({ djRoleSet: true, isRequester: true }), true);
  assert.equal(vs.canSkipNow({ djRoleSet: true, isAdmin: true }), true);
  assert.equal(vs.canSkipNow({ djRoleSet: true, isOwner: true }), true);
});
