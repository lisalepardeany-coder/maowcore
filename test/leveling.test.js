'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const lvl = require('../lib/leveling');

test('leveling: curve round-trips (levelForXp ∘ totalXpForLevel = id)', () => {
  for (const L of [1, 5, 10, 100, 500, 1000, 2000]) {
    assert.equal(lvl.levelForXp(lvl.totalXpForLevel(L)), L, `level ${L}`);
    assert.equal(lvl.levelForXp(lvl.totalXpForLevel(L) - 1), L - 1, `just below ${L}`);
  }
});

test('leveling: thresholds', () => {
  assert.equal(lvl.totalXpForLevel(0), 0);
  assert.equal(lvl.totalXpForLevel(1), 100);
  assert.equal(lvl.totalXpForLevel(10), 5500);
  assert.equal(lvl.levelForXp(0), 0);
  assert.equal(lvl.levelForXp(99), 0);
  assert.equal(lvl.levelForXp(100), 1);
  assert.equal(lvl.levelForXp(5499), 9);
  assert.equal(lvl.levelForXp(5500), 10);
});

test('leveling: xpIntoLevel', () => {
  const r = lvl.xpIntoLevel(150);
  assert.equal(r.level, 1);
  assert.equal(r.into, 50);   // 150 - totalXpForLevel(1)=100
  assert.equal(r.need, 200);  // totalXpForLevel(2)=300 minus 100
});

test('leveling: multiplier defaults to 1 with no config', () => {
  assert.equal(lvl.multiplierFor({ id: 'nonexistent-guild-xyz' }, null), 1);
});
