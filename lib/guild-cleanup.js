'use strict';
// lib/guild-cleanup.js — forget the settings of servers the bot left more than
// 30 days ago, so data/ doesn't keep growing with servers that are gone.
//
// Removed: the server's settings (config.json), its command usage counts and
// its suggestions, polls, giveaways, tickets and appeals.
// Kept on purpose: play history, levels and coins in the database, so a
// server that adds the bot back still has them.
//
// Joining again within 30 days cancels it. GUILD_CLEANUP=0 turns it off.

const path = require('node:path');
const { readJson, writeJson } = require('./safe-json');

const FILE = path.join(__dirname, '..', 'data', 'left-guilds.json');
const DAY = 86_400_000;
const KEEP_DAYS = 30;
const STORE_MODULES = ['./suggestions', './polls', './giveaways', './tickets', './appeals'];

let state = null;
const load = () => (state ||= readJson(FILE, {}, { valid: (d) => d && typeof d === 'object' && !Array.isArray(d), label: 'left guilds' }));
const save = () => { if (!process.env.NODE_TEST_CONTEXT) { try { writeJson(FILE, state); } catch (e) { console.warn('[guild-cleanup] save failed:', e.message); } } };

function markLeft(gid, now = Date.now()) {
  const s = load();
  if (!s[gid]) { s[gid] = now; save(); }
}

function markJoined(gid) {
  const s = load();
  if (s[gid]) { delete s[gid]; save(); }
}

/**
 * Pure: which servers to clean now.
 * @param {Record<string, number>} left  gid → when the bot left (ms)
 * @param {Set<string>} present          servers the bot is in right now
 */
function due(left, present, now = Date.now(), keepDays = KEEP_DAYS) {
  return Object.entries(left)
    .filter(([gid, at]) => !present.has(gid) && now - at >= keepDays * DAY)
    .map(([gid]) => gid);
}

/**
 * Run once Discord is ready (and daily after that).
 * Servers with settings that the bot isn't in and that aren't marked yet
 * (it was removed while offline) start their 30 days now.
 */
function sweep(client, deps = {}, now = Date.now()) {
  if (process.env.GUILD_CLEANUP === '0') return [];
  const config = deps.config || require('./config');
  const usage = deps.usage || require('./command-usage');
  const stores = deps.stores || (() => { for (const m of STORE_MODULES) { try { require(m); } catch { /* */ } } return require('./_store'); })();
  const present = new Set(client.guilds.cache.keys());
  const s = load();
  for (const gid of config.guildIds()) if (/^\d{17,20}$/.test(gid) && !present.has(gid) && !s[gid]) s[gid] = now;
  for (const gid of Object.keys(s)) if (present.has(gid)) delete s[gid];
  const removed = [];
  for (const gid of due(s, present, now)) {
    const what = [];
    if (config.removeGuild(gid)) what.push('settings');
    if (usage.forget(gid)) what.push('command usage');
    what.push(...stores.forgetGuild(gid));
    delete s[gid];
    removed.push({ gid, what });
  }
  save();
  return removed;
}

function _reset(next = {}) { state = next; }

module.exports = { markLeft, markJoined, due, sweep, KEEP_DAYS, _reset };
