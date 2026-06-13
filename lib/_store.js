'use strict';
// lib/_store.js — tiny guild-keyed JSON store factory used by the dashboard
// feature modules (suggestions, polls, giveaways, tickets, appeals).

const fs = require('node:fs');
const path = require('node:path');

function makeStore(filename) {
  const FILE = path.join(__dirname, '..', 'data', filename);
  let state = {};
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { state = {}; }

  const save = () => {
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state)); }
    catch (e) { console.warn(`[${filename}] save failed:`, e.message); }
  };
  const forGuild = (gid) => (state[gid] = state[gid] || []);
  const id = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  return { state, save, forGuild, id };
}

module.exports = { makeStore };
