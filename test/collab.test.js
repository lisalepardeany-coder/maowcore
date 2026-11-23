'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const collab = require('../lib/collab');
const mini = require('../lib/minigames');

test('countStep: correct sequence by alternating users', () => {
  let r = collab.countStep({ count: 0, lastUser: null, best: 0 }, 'A', '1');
  assert.equal(r.ok, true); assert.equal(r.count, 1); assert.equal(r.newBest, true);
  r = collab.countStep(r.state, 'B', '2');
  assert.equal(r.ok, true); assert.equal(r.count, 2);
});

test('countStep: rejects wrong number and double-post, preserving best', () => {
  const wrong = collab.countStep({ count: 5, lastUser: 'A', best: 5 }, 'B', '9');
  assert.equal(wrong.ok, false); assert.equal(wrong.reason, 'wrong'); assert.equal(wrong.ruinedAt, 5);
  assert.deepEqual(wrong.state, { count: 0, lastUser: null, best: 5 });
  const dbl = collab.countStep({ count: 3, lastUser: 'A', best: 7 }, 'A', '4');
  assert.equal(dbl.ok, false); assert.equal(dbl.reason, 'double'); assert.equal(dbl.state.best, 7);
});

test('countStep: ignores non-numbers', () => {
  assert.equal(collab.countStep({ count: 1, lastUser: 'A', best: 1 }, 'B', 'hello').handled, false);
});

test('storyStep: one word, alternating users; rejects multi-word/double/long', () => {
  let r = collab.storyStep({ words: [], lastUser: null }, 'A', 'Once');
  assert.equal(r.ok, true); assert.deepEqual(r.state.words, ['Once']);
  r = collab.storyStep(r.state, 'A', 'upon');
  assert.equal(r.ok, false); assert.equal(r.reason, 'double');
  r = collab.storyStep({ words: ['Once'], lastUser: 'A' }, 'B', 'upon');
  assert.equal(r.ok, true); assert.deepEqual(r.state.words, ['Once', 'upon']);
  assert.equal(collab.storyStep({ words: [], lastUser: null }, 'A', 'two words').handled, false);
  assert.equal(collab.storyStep({ words: [], lastUser: null }, 'A', 'x'.repeat(40)).reason, 'toolong');
});

test('storyText joins words', () => {
  assert.equal(collab.storyText({ words: ['Once', 'upon', 'a'] }), 'Once upon a');
  assert.equal(collab.storyText(null), '');
});

test('minigames: banks are well-formed', () => {
  for (const s of mini.SONG_EMOJI) { assert.equal(s.a.length, 4); assert.ok(s.i >= 0 && s.i < 4); assert.ok(s.e.length > 0); }
  assert.ok(mini.DAILY_QUESTIONS.length >= 10);
  assert.equal(typeof mini.dailyQuestion(new Date()), 'string');
});
