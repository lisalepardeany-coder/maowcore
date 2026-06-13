'use strict';
// lib/scratch.js — scratch cards. Reveal a 3×3 grid of weighted symbols; any
// symbol appearing 3+ times pays its multiplier × bet (4/5-of-a-kind bonus).
// Multiple themes, each with its own symbols & multipliers.

const THEMES = [
  { id: 'sevens', name: 'Lucky Sevens', emoji: '🎰', symbols: [
    { e: '🍒', mult: 0.5, w: 32 }, { e: '🍋', mult: 1, w: 24 }, { e: '🔔', mult: 2, w: 17 },
    { e: '⭐', mult: 4, w: 12 }, { e: '💎', mult: 8, w: 8 }, { e: '7️⃣', mult: 20, w: 5 }, { e: '🎰', mult: 100, w: 1 } ] },
  { id: 'gems', name: 'Gem Mine', emoji: '💎', symbols: [
    { e: '🪨', mult: 0.3, w: 34 }, { e: '🥉', mult: 1, w: 24 }, { e: '🥈', mult: 2, w: 16 },
    { e: '🥇', mult: 4, w: 12 }, { e: '💠', mult: 9, w: 8 }, { e: '💎', mult: 25, w: 5 }, { e: '👑', mult: 150, w: 1 } ] },
  { id: 'fruit', name: 'Fruit Fiesta', emoji: '🍉', symbols: [
    { e: '🍇', mult: 0.5, w: 30 }, { e: '🍊', mult: 1, w: 24 }, { e: '🍉', mult: 2, w: 18 },
    { e: '🍓', mult: 3, w: 13 }, { e: '🥝', mult: 7, w: 9 }, { e: '🍍', mult: 18, w: 5 }, { e: '🌈', mult: 80, w: 1 } ] },
  { id: 'space', name: 'Space Loot', emoji: '🚀', symbols: [
    { e: '☄️', mult: 0.4, w: 32 }, { e: '🛰️', mult: 1, w: 24 }, { e: '🪐', mult: 2, w: 17 },
    { e: '🌟', mult: 5, w: 12 }, { e: '👽', mult: 10, w: 8 }, { e: '🚀', mult: 30, w: 5 }, { e: '🌌', mult: 120, w: 1 } ] },
  { id: 'neko', name: 'Neko Gold', emoji: '🐾', symbols: [
    { e: '🐟', mult: 0.5, w: 30 }, { e: '🧶', mult: 1, w: 24 }, { e: '🐾', mult: 2, w: 18 },
    { e: '🐱', mult: 4, w: 12 }, { e: '😻', mult: 9, w: 9 }, { e: '👑', mult: 22, w: 5 }, { e: '💰', mult: 100, w: 1 } ] },
  { id: 'spooky', name: 'Spooky Scratch', emoji: '🎃', symbols: [
    { e: '🕸️', mult: 0.4, w: 32 }, { e: '🦇', mult: 1, w: 23 }, { e: '🎃', mult: 2, w: 18 },
    { e: '👻', mult: 5, w: 12 }, { e: '💀', mult: 11, w: 8 }, { e: '🧛', mult: 28, w: 5 }, { e: '⚰️', mult: 130, w: 1 } ] },
];
const byId = Object.fromEntries(THEMES.map((t) => [t.id, t]));
const getTheme = (id) => byId[id] || THEMES[0];
const themeChoices = THEMES.map((t) => ({ name: `${t.emoji} ${t.name}`, value: t.id }));

function weightedPick(symbols) {
  const total = symbols.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const s of symbols) { if ((r -= s.w) < 0) return s; }
  return symbols[symbols.length - 1];
}

// Pure: evaluate a fixed grid (array of symbol emojis) for a theme + bet.
function evaluate(theme, cells, bet) {
  const counts = {};
  for (const e of cells) counts[e] = (counts[e] || 0) + 1;
  let best = null;
  for (const s of theme.symbols) {
    const n = counts[s.e] || 0;
    if (n < 3) continue;
    const bonus = n >= 5 ? 3 : n >= 4 ? 1.8 : 1;
    const payout = s.mult * bonus;
    if (!best || payout > best.payout) best = { symbol: s.e, mult: s.mult, count: n, bonus, payout };
  }
  const win = best ? Math.round(bet * best.payout) : 0;
  return { cells, best, win, bet, profit: win - bet };
}

function play(themeId, bet) {
  const theme = getTheme(themeId);
  const cells = Array.from({ length: 9 }, () => weightedPick(theme.symbols).e);
  return { theme, ...evaluate(theme, cells, bet) };
}

module.exports = { THEMES, getTheme, themeChoices, evaluate, play, weightedPick };
