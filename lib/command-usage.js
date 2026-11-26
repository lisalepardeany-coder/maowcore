'use strict';
// lib/command-usage.js — how often each slash command (and subcommand) is used,
// per server, kept across restarts in data/command-usage.json. The dashboard's
// Command usage page reads it to show what is never used, so slots under
// Discord's 100-commands-per-server limit can be freed.
//
// Shape: { [guildId | 'dm']: { [path]: { runs, errors, lastAt } } }
// where path is "play" or "mod kick" or "mod tools warn".

const path = require('node:path');
const { readJson, writeJson } = require('./safe-json');

const FILE = path.join(__dirname, '..', 'data', 'command-usage.json');
const DAY = 86_400_000;
const SAVE_DELAY = 5000;

let state = null;
let timer = null;

function load() {
  if (!state) state = readJson(FILE, {}, { valid: (d) => d && typeof d === 'object' && !Array.isArray(d), label: 'command usage' });
  return state;
}

function flush() {
  clearTimeout(timer); timer = null;
  if (!state) return;
  try { writeJson(FILE, state); } catch (e) { console.warn('[command-usage] save failed:', e.message); }
}

function scheduleSave() {
  if (process.env.NODE_TEST_CONTEXT) return;          // tests never touch data/
  if (!timer) { timer = setTimeout(flush, SAVE_DELAY); timer.unref?.(); }
}

/** "mod tools warn" from an interaction (name + group + subcommand). */
function pathOf(interaction, name = interaction.commandName) {
  const o = interaction.options;
  const group = o?.getSubcommandGroup?.(false);
  const sub = o?.getSubcommand?.(false);
  return [name, group, sub].filter(Boolean).join(' ');
}

function record(guildId, cmdPath, ok, now = Date.now()) {
  if (!cmdPath) return;
  const s = load();
  const g = (s[guildId || 'dm'] ||= {});
  const e = (g[cmdPath] ||= { runs: 0, errors: 0, lastAt: 0 });
  e.runs++;
  if (!ok) e.errors++;
  e.lastAt = now;
  scheduleSave();
}

/** Every command path the bot offers, from the loaded command builders. */
function knownPaths(commands) {
  const out = [];
  for (const cmd of commands.values()) {
    const json = typeof cmd.data?.toJSON === 'function' ? cmd.data.toJSON() : cmd.data;
    if (!json?.name) continue;
    const subs = (json.options || []).filter((o) => o.type === 1 || o.type === 2);
    if (!subs.length) { out.push(json.name); continue; }
    for (const s of subs) {
      if (s.type === 1) out.push(`${json.name} ${s.name}`);
      else for (const ss of s.options || []) if (ss.type === 1) out.push(`${json.name} ${s.name} ${ss.name}`);
    }
  }
  return out.sort();
}

/**
 * Should this top-level command be offered for removal or merging?
 * @param {object} c   { name, runs, errors, lastAt, subs, usedSubs }
 *                     runs/errors/lastAt summed over all its subcommands in this server;
 *                     subs = how many subcommands it has, usedSubs = how many were used.
 * @param {number} now Date.now()
 * @param {number} trackedSince  when counting started (ms), so a brand-new install
 *                               doesn't call everything unused.
 * @returns {string|null} a short reason shown on the dashboard, or null to keep it.
 */
const MIN_DAYS = 14;      // too little data before this to call anything unused
const STALE_DAYS = 60;
function removalReason(c, now, trackedSince) {
  const counted = Math.floor((now - trackedSince) / DAY);
  if (c.runs >= 5 && c.errors / c.runs >= 0.5) return `Fails often (${Math.round((c.errors / c.runs) * 100)}%)`;
  if (counted < MIN_DAYS) return null;
  if (!c.runs) return `Never used in ${counted} days`;
  const idle = Math.floor((now - c.lastAt) / DAY);
  if (idle >= STALE_DAYS) return `Not used for ${idle} days`;
  return null;
}

/** Report for one server: every top-level command with its subcommands. */
function report(guildId, commands, now = Date.now()) {
  const s = load();
  const g = s[guildId || 'dm'] || {};
  const trackedSince = Number(s._since) || now;
  const byTop = new Map();
  const empty = () => ({ runs: 0, errors: 0, lastAt: 0 });
  for (const p of knownPaths(commands)) {
    const top = p.split(' ')[0];
    if (!byTop.has(top)) byTop.set(top, { name: top, runs: 0, errors: 0, lastAt: 0, subs: 0, usedSubs: 0, paths: [] });
    const t = byTop.get(top);
    const e = g[p] || empty();
    t.paths.push({ path: p, ...e });
    if (p !== top) t.subs++;
    if (e.runs) { if (p !== top) t.usedSubs++; t.runs += e.runs; t.errors += e.errors; t.lastAt = Math.max(t.lastAt, e.lastAt); }
  }
  const list = [...byTop.values()].map((t) => ({ ...t, reason: removalReason(t, now, trackedSince) }));
  list.sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
  return { trackedSince, days: Math.floor((now - trackedSince) / DAY), commands: list };
}

/** First run: remember when counting began. */
function start(now = Date.now()) {
  const s = load();
  if (!s._since) { s._since = now; scheduleSave(); }
}

function _reset(next = {}) { state = next; }

module.exports = { pathOf, record, knownPaths, removalReason, report, start, flush, _reset, DAY };
