'use strict';
// lib/_store.js — tiny guild-keyed JSON store factory used by the dashboard
// feature modules (suggestions, polls, giveaways, tickets, appeals).

const path = require('node:path');
const { readJson, writeJson } = require('./safe-json');

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

  return { state, save, forGuild, id };
}

module.exports = { makeStore };
