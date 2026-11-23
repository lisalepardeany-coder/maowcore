'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const ai = require('../lib/games-ai');
const _ = null;

test('ttt: winner detection (rows, cols, diagonals, draw)', () => {
  assert.equal(ai.tttWinner(['X', 'X', 'X', _, _, _, _, _, _]), 'X');
  assert.equal(ai.tttWinner(['O', _, _, 'O', _, _, 'O', _, _]), 'O');         // column
  assert.equal(ai.tttWinner(['X', _, _, _, 'X', _, _, _, 'X']), 'X');         // diagonal
  assert.equal(ai.tttWinner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), 'draw');
  assert.equal(ai.tttWinner([_, _, _, _, _, _, _, _, _]), null);
});

test('ttt: AI takes an immediate win', () => {
  // O at 0,1 — winning move is 2. X threatens at 5 but winning beats blocking.
  const move = ai.tttAiMove(['O', 'O', _, 'X', 'X', _, _, _, _]);
  assert.equal(move, 2);
});

test('ttt: AI blocks the human\'s winning move', () => {
  // X at 3,4 threatens 5; O can\'t win immediately → must block at 5.
  const move = ai.tttAiMove([_, _, _, 'X', 'X', _, 'O', _, _]);
  assert.equal(move, 5);
});

test('ttt: perfect AI never loses from empty board (plays a corner/center)', () => {
  const move = ai.tttAiMove([_, _, _, _, _, _, _, _, _]);
  assert.ok([0, 2, 4, 6, 8].includes(move), `optimal opener, got ${move}`);
});

test('rps: outcomes', () => {
  assert.equal(ai.rpsOutcome('rock', 'scissors'), 'win');
  assert.equal(ai.rpsOutcome('rock', 'paper'), 'lose');
  assert.equal(ai.rpsOutcome('rock', 'rock'), 'tie');
  assert.equal(ai.rpsOutcome('paper', 'rock'), 'win');
  assert.equal(ai.rpsOutcome('scissors', 'rock'), 'lose');
});

test('trivia: bank entries are well-formed', () => {
  for (const t of ai.TRIVIA) {
    assert.equal(t.a.length, 4);
    assert.ok(t.i >= 0 && t.i < 4, `answer index in range for "${t.q}"`);
  }
});
