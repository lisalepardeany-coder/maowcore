'use strict';
// lib/_store.js — tiny guild-keyed JSON store factory used by the dashboard
// feature modules (suggestions, polls, giveaways, tickets, appeals).

const path = require('node:path');
const { readJson, writeJson } = require('./safe-json');

// Every store made here, so data of servers the bot left can be removed
// from all of them at once (lib/guild-cleanup.js).
const stores = [];

function makeStore(filename) {
  const FILE = path.join(__dirname, '..', 'data', filename);
  // a damaged file is restored from its backup, never silently replaced by {}
  const state = readJson(FILE, {}, { valid: (d) => d && typeof d === 'object' && !Array.isArray(d), label: filename });

  const save = () => {
    try { writeJson(FILE, state); }
    catch (e) { console.warn(`[${filename}] save failed:`, e.message); }
  };
  const forGuild = (gid) => (state[gid] = state[gid] || []);
  const id = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  const store = { state, save, forGuild, id, filename };
  stores.push(store);
  return store;
}

/** Remove one server from every store; returns the file names it was in. */
function forgetGuild(gid) {
  const hit = [];
  for (const s of stores) {
    if (s.state[gid]) { delete s.state[gid]; s.save(); hit.push(s.filename); }
  }
  return hit;
}

module.exports = { makeStore, forgetGuild };
