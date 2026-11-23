// Batch 5: pets, daily streaks, games, trivia, polls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fun = require('../lib/fun');

test('pets: stats drop over time and care actions help', () => {
  const t0 = Date.UTC(2026, 10, 10, 12);
  const p = fun.newPet('Mochi', 'cat', t0);
  const later = fun.decay(p, t0 + 10 * 3600e3);   // 10 h
  assert.equal(later.hunger, 60, '30 min per hunger point');
  assert.equal(later.happy, 65);
  assert.equal(later.energy, 68);
  const fed = fun.act(later, 'feed', t0 + 10 * 3600e3);
  assert.equal(fed.ok, true);
  assert.equal(fed.pet.hunger, 90);
  const again = fun.act(fed.pet, 'feed', t0 + 10 * 3600e3 + 60e3);
  assert.equal(again.ok, false, 'feeding has a cooldown');
  const tired = { ...fed.pet, energy: 5 };
  assert.equal(fun.act(tired, 'play', t0 + 11 * 3600e3).ok, false, 'too tired to play');
  assert.equal(fun.moodOf({ hunger: 10, happy: 10, energy: 10 }), 0);
  assert.equal(fun.moodOf({ hunger: 90, happy: 90, energy: 90 }), 3);
});

test('daily: once per day, streaks grow and reset', () => {
  const day = 86400e3;
  const t = new Date(2026, 10, 10, 12).getTime();
  const a = fun.dailyReward(null, 0, t);
  assert.deepEqual(a, { ok: true, streak: 1, coins: 50 });
  assert.equal(fun.dailyReward(t, 1, t + 3600e3).ok, false, 'same day');
  assert.deepEqual(fun.dailyReward(t, 1, t + day), { ok: true, streak: 2, coins: 60 });
  assert.deepEqual(fun.dailyReward(t, 5, t + 3 * day), { ok: true, streak: 1, coins: 50 }, 'missed days reset');
  assert.equal(fun.dailyReward(t, 30, t + day).coins, 150, 'bonus capped');
});

test('games: rock paper scissors + tic-tac-toe logic', () => {
  const { rpsResult, tttWinner, tttBotMove } = require('../commands/game')._test;
  assert.equal(rpsResult('rock', 'scissors'), 'win');
  assert.equal(rpsResult('rock', 'paper'), 'lose');
  assert.equal(rpsResult('paper', 'paper'), 'draw');
  const X = '❌'; const O = '⭕';
  assert.equal(tttWinner([X, X, X, null, O, O, null, null, null]), X);
  assert.equal(tttWinner([X, O, X, X, O, O, O, X, X]), 'draw');
  assert.equal(tttWinner([X, null, null, null, null, null, null, null, null]), null);
  assert.equal(tttBotMove([O, O, null, X, X, null, null, null, null], O, X), 2, 'bot takes the win');
  assert.equal(tttBotMove([X, X, null, null, O, null, null, null, null], O, X), 2, 'bot blocks');
  assert.equal(tttBotMove([X, null, null, null, null, null, null, null, null], O, X), 4, 'bot takes the centre');
});

test('trivia: every pack is complete and rounds keep the right answer', () => {
  const PACKS = require('../lib/trivia-packs');
  for (const [k, p] of Object.entries(PACKS)) {
    assert.ok(p.q.length >= 10, `${k} has enough questions`);
    for (const q of p.q) assert.equal(q.length, 5, `${k}: "${q[0]}" has 4 answers`);
  }
  const { buildRounds } = require('../commands/trivia')._test;
  const rounds = buildRounds('space', 5);
  assert.equal(rounds.length, 5);
  for (const r of rounds) {
    const src = PACKS.space.q.find((x) => x[0] === r.q);
    assert.equal(r.answers[r.correct], src[1]);
  }
  assert.ok(buildRounds('mix', 12).length === 12);
});

test('poll: result bars', () => {
  const { results } = require('../commands/poll')._test;
  const txt = results(['Yes', 'No'], [3, 1]);
  assert.match(txt, /75% \(3\)/);
  assert.match(txt, /25% \(1\)/);
  assert.match(results(['A', 'B'], [0, 0]), /0% \(0\)/);
});
