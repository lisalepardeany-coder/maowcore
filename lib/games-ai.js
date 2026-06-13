'use strict';
// lib/games-ai.js — pure game logic + AI opponents (so a quiet server can still
// play and win coins). Tic-tac-toe uses perfect minimax; RPS + trivia are here
// too. No Discord deps → unit-testable.

// ── Tic-tac-toe ──────────────────────────────────────────────────────────────
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function tttWinner(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every((x) => x) ? 'draw' : null;
}

// AI = 'O' (maximizer), human = 'X'. Returns { score, move }.
function minimax(b, player) {
  const w = tttWinner(b);
  if (w === 'O') return { score: 1 };
  if (w === 'X') return { score: -1 };
  if (w === 'draw') return { score: 0 };
  let best = player === 'O' ? { score: -2 } : { score: 2 };
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = player;
    const score = minimax(b, player === 'O' ? 'X' : 'O').score;
    b[i] = null;
    if (player === 'O' ? score > best.score : score < best.score) best = { score, move: i };
  }
  return best;
}
// Best move for the AI ('O'). Returns a cell index 0–8 (or -1 if board full).
function tttAiMove(board) {
  const b = board.slice();
  const r = minimax(b, 'O');
  return r.move != null ? r.move : b.findIndex((x) => !x);
}

// ── Rock-paper-scissors ──────────────────────────────────────────────────────
const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
function rpsOutcome(user, ai) {
  if (user === ai) return 'tie';
  return RPS_BEATS[user] === ai ? 'win' : 'lose';
}
const rpsAiPick = () => ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];

// ── Trivia bank ──────────────────────────────────────────────────────────────
const TRIVIA = [
  { q: 'What does CPU stand for?', a: ['Central Processing Unit', 'Computer Personal Unit', 'Central Power Unit', 'Core Processing Util'], i: 0 },
  { q: 'Which planet is the Red Planet?', a: ['Venus', 'Mars', 'Jupiter', 'Mercury'], i: 1 },
  { q: 'How many strings on a standard guitar?', a: ['4', '5', '6', '7'], i: 2 },
  { q: 'What year did the first Discord launch?', a: ['2013', '2015', '2017', '2011'], i: 1 },
  { q: 'What is the largest ocean?', a: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], i: 3 },
  { q: 'Which language runs in a web browser?', a: ['Python', 'JavaScript', 'C++', 'Rust'], i: 1 },
  { q: 'What does "GG" mean in gaming?', a: ['Good Game', 'Great Goal', 'Go Get', 'Gold Grade'], i: 0 },
  { q: 'How many continents are there?', a: ['5', '6', '7', '8'], i: 2 },
  { q: 'What gas do plants mainly absorb?', a: ['Oxygen', 'Nitrogen', 'CO₂', 'Hydrogen'], i: 2 },
  { q: 'Which company makes the PlayStation?', a: ['Microsoft', 'Nintendo', 'Sega', 'Sony'], i: 3 },
  { q: 'What is 7 × 8?', a: ['54', '56', '48', '64'], i: 1 },
  { q: 'Twitch is primarily used for…', a: ['Shopping', 'Live streaming', 'Email', 'Maps'], i: 1 },
  { q: 'What does "RAM" stand for?', a: ['Random Access Memory', 'Rapid Access Module', 'Read Access Memory', 'Run All Memory'], i: 0 },
  { q: 'Which is a prime number?', a: ['9', '15', '17', '21'], i: 2 },
  { q: 'The Mona Lisa was painted by…', a: ['Picasso', 'Da Vinci', 'Van Gogh', 'Monet'], i: 1 },
  { q: 'What animal is the MaowCore mascot vibe?', a: ['Dog', 'Cat', 'Fox', 'Owl'], i: 1 },
  { q: 'How many bits in a byte?', a: ['4', '8', '16', '32'], i: 1 },
  { q: 'Which key copies in most apps?', a: ['Ctrl+V', 'Ctrl+C', 'Ctrl+X', 'Ctrl+Z'], i: 1 },
  { q: 'What does HTTP stand for? (first word)', a: ['Hyper', 'High', 'Host', 'Hybrid'], i: 0 },
  { q: 'A regular hexagon has how many sides?', a: ['5', '6', '7', '8'], i: 1 },
];
const randomTrivia = () => TRIVIA[Math.floor(Math.random() * TRIVIA.length)];

module.exports = { tttWinner, tttAiMove, minimax, rpsOutcome, rpsAiPick, TRIVIA, randomTrivia };
