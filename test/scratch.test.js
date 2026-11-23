'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const scratch = require('../lib/scratch');
const theme = scratch.getTheme('sevens'); // 🍒=0.5 🍋=1 🔔=2 ⭐=4 💎=8 7️⃣=20 🎰=100

test('scratch: 3-of-a-kind pays mult × bet', () => {
  const r = scratch.evaluate(theme, ['🍒', '🍒', '🍒', '🍋', '🔔', '⭐', '💎', '7️⃣', '🎰'], 100);
  assert.equal(r.best.symbol, '🍒');
  assert.equal(r.best.count, 3);
  assert.equal(r.win, 50);       // 0.5 × 100
  assert.equal(r.profit, -50);
});

test('scratch: highest-mult match wins when several hit', () => {
  const r = scratch.evaluate(theme, ['🍒', '🍒', '🍒', '💎', '💎', '💎', '🔔', '⭐', '🍋'], 100);
  assert.equal(r.best.symbol, '💎');
  assert.equal(r.win, 800);      // 8 × 100
});

test('scratch: no 3-match loses the bet', () => {
  const r = scratch.evaluate(theme, ['🍒', '🍒', '🍋', '🔔', '⭐', '💎', '7️⃣', '🎰', '🍋'], 100);
  assert.equal(r.best, null);
  assert.equal(r.win, 0);
  assert.equal(r.profit, -100);
});

test('scratch: 5-of-a-kind triples the multiplier', () => {
  const r = scratch.evaluate(theme, ['🍋', '🍋', '🍋', '🍋', '🍋', '💎', '⭐', '🔔', '🍒'], 100);
  assert.equal(r.best.count, 5);
  assert.equal(r.win, 300);      // 1 × bonus 3 × 100
});
