'use strict';
// lib/econ-games.js — cooldowns, daily streaks, rob, and the lottery.
// Coins live in lib/economy.js; this stores timers/streaks/lottery in the
// guild config under `econ`.

const { getGuild, updateGuild } = require('./config');
const economy = require('./economy');

const econ = (gid) => getGuild(gid).econ || {};
const setEcon = (gid, patch) => updateGuild(gid, { econ: { ...econ(gid), ...patch } });
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// ── cooldowns ────────────────────────────────────────────────────────────────
function cooldown(gid, uid, key, ms) {
  const last = (econ(gid).cd || {})[`${uid}:${key}`] || 0;
  const remaining = ms - (Date.now() - last);
  return { ok: remaining <= 0, remaining: Math.max(0, remaining) };
}
function setCooldown(gid, uid, key) {
  const cd = { ...(econ(gid).cd || {}) };
  const now = Date.now();
  cd[`${uid}:${key}`] = now;
  // Prune long-expired entries so the map can't grow unbounded — every cooldown
  // is ≤22h, so anything older than 48h is definitely stale.
  const cutoff = now - 48 * 3600_000;
  for (const k of Object.keys(cd)) if (cd[k] < cutoff) delete cd[k];
  setEcon(gid, { cd });
}

// ── earners ──────────────────────────────────────────────────────────────────
const DAILY_WINDOW = 22 * 3600_000;
function claimDaily(gid, uid) {
  const c = cooldown(gid, uid, 'daily', DAILY_WINDOW);
  if (!c.ok) return { ok: false, remaining: c.remaining };
  const streaks = { ...(econ(gid).streak || {}) };
  const s = streaks[uid] || { count: 0, last: 0 };
  const streak = (Date.now() - s.last < 48 * 3600_000) ? s.count + 1 : 1;
  streaks[uid] = { count: streak, last: Date.now() };
  const amount = 250 + Math.min(streak, 30) * 50; // 300 → 1750
  economy.award(gid, uid, amount, 'daily');
  setEcon(gid, { streak: streaks });
  setCooldown(gid, uid, 'daily');
  return { ok: true, amount, streak };
}

const WORK_JOBS = [
  ['streamed for 6 hours', 1], ['edited a montage', 1], ['fixed the bot', 1.4], ['moderated chat', 0.8],
  ['delivered pizzas', 0.9], ['DJ\'d a set', 1.1], ['walked some cats', 0.7], ['sold merch', 1.2],
];
function work(gid, uid) {
  const c = cooldown(gid, uid, 'work', 60 * 60_000);
  if (!c.ok) return { ok: false, remaining: c.remaining };
  const [job, mult] = WORK_JOBS[rnd(0, WORK_JOBS.length - 1)];
  const amount = Math.round(rnd(180, 420) * mult);
  economy.award(gid, uid, amount, 'work');
  setCooldown(gid, uid, 'work');
  return { ok: true, amount, job };
}

const BEG_LINES = [
  ['a kind stranger', 1], ['Errox himself', 1], ['a sleepy cat', 1], ['the void', 0],
  ['a generous mod', 1], ['nobody — they ignored you', 0], ['a passing streamer', 1],
];
function beg(gid, uid) {
  const c = cooldown(gid, uid, 'beg', 5 * 60_000);
  if (!c.ok) return { ok: false, remaining: c.remaining };
  setCooldown(gid, uid, 'beg');
  const [who, give] = BEG_LINES[rnd(0, BEG_LINES.length - 1)];
  const amount = give ? rnd(20, 120) : 0;
  if (amount) economy.award(gid, uid, amount, 'beg');
  return { ok: true, amount, who };
}

// ── rob ──────────────────────────────────────────────────────────────────────
function rob(gid, robberId, victimId) {
  if (robberId === victimId) return { ok: false, reason: 'self' };
  const c = cooldown(gid, robberId, 'rob', 2 * 3600_000);
  if (!c.ok) return { ok: false, reason: 'cooldown', remaining: c.remaining };
  const victim = economy.getUser(gid, victimId);
  const robber = economy.getUser(gid, robberId);
  if (victim.coins < 200) return { ok: false, reason: 'poor' };
  if (robber.coins < 100) return { ok: false, reason: 'broke' };
  setCooldown(gid, robberId, 'rob');
  if (Math.random() < 0.5) {
    const stolen = Math.max(1, Math.floor(victim.coins * (0.1 + Math.random() * 0.3)));
    economy.spend(gid, victimId, stolen, 'robbed');
    economy.award(gid, robberId, stolen, 'rob');
    return { ok: true, success: true, amount: stolen };
  }
  const fine = Math.max(1, Math.floor(robber.coins * (0.1 + Math.random() * 0.2)));
  economy.spend(gid, robberId, fine, 'rob-fine');
  return { ok: true, success: false, fine };
}

// ── lottery ──────────────────────────────────────────────────────────────────
const lotteryInfo = (gid) => ({ pot: 0, tickets: {}, ...(econ(gid).lottery || {}) });
function buyTickets(gid, uid, count, price) {
  const cost = count * price;
  economy.spend(gid, uid, cost, 'lottery'); // throws if broke
  const l = lotteryInfo(gid);
  l.tickets[uid] = (l.tickets[uid] || 0) + count;
  l.pot = (l.pot || 0) + cost;
  setEcon(gid, { lottery: l });
  return { tickets: l.tickets[uid], pot: l.pot, cost };
}
function drawLottery(gid) {
  const l = lotteryInfo(gid);
  const entries = [];
  for (const [uid, n] of Object.entries(l.tickets || {})) for (let i = 0; i < n; i++) entries.push(uid);
  if (!entries.length) return { ok: false };
  const winner = entries[Math.floor(Math.random() * entries.length)];
  const pot = l.pot || 0;
  if (pot > 0) economy.award(gid, winner, pot, 'lottery-win');
  setEcon(gid, { lottery: { pot: 0, tickets: {} } });
  return { ok: true, winner, pot, entries: entries.length };
}

function fmtRemaining(ms) {
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

module.exports = { cooldown, setCooldown, claimDaily, work, beg, rob, lotteryInfo, buyTickets, drawLottery, fmtRemaining };
