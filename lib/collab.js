'use strict';
// lib/collab.js — pure step functions for the channel collab games (counting &
// one-word-story). The index.js listeners read/persist state; this stays pure
// and unit-testable. Returns { handled, ok?, state?, ... }.

// Counting: messages must be the next integer, and not the same person twice.
function countStep(state, userId, content) {
  const cur = state && typeof state.count === 'number' ? state : { count: 0, lastUser: null, best: 0 };
  const trimmed = String(content || '').trim();
  if (!/^\d+$/.test(trimmed)) return { handled: false };           // ignore non-numbers (chatter)
  const num = parseInt(trimmed, 10);
  const expected = cur.count + 1;
  const fail = (reason) => ({ handled: true, ok: false, reason, expected, ruinedAt: cur.count, state: { count: 0, lastUser: null, best: cur.best || 0 } });
  if (num !== expected) return fail('wrong');
  if (cur.lastUser === userId) return fail('double');
  const count = expected;
  const best = Math.max(cur.best || 0, count);
  return { handled: true, ok: true, count, best, newBest: count > (cur.best || 0), state: { count, lastUser: userId, best } };
}

// One-word-story: exactly one word per message, not the same person twice.
function storyStep(state, userId, content) {
  const cur = state && Array.isArray(state.words) ? state : { words: [], lastUser: null };
  const text = String(content || '').trim();
  if (!text || /\s/.test(text)) return { handled: false };          // not a single word → ignore
  if (text.length > 32) return { handled: true, ok: false, reason: 'toolong' };
  if (cur.lastUser === userId) return { handled: true, ok: false, reason: 'double' };
  const words = [...cur.words, text].slice(-1000);
  return { handled: true, ok: true, count: words.length, word: text, state: { words, lastUser: userId } };
}

const storyText = (state) => (state?.words || []).join(' ');

module.exports = { countStep, storyStep, storyText };
