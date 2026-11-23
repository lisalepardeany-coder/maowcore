'use strict';
// lib/user-prefs.js — server-side storage of dashboard preferences per user,
// so settings can sync across devices. JSON-backed (data/user-prefs.json).

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'data', 'user-prefs.json');
let store = {}; // userId → { prefs, theme, updatedAt }

function load() {
  try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (typeof store !== 'object' || !store) store = {}; }
  catch { store = {}; }
}
function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(store)); }
  catch (e) { console.warn('[user-prefs] save failed:', e.message); }
}
load();

function get(userId) {
  return store[userId] || null;
}

function set(userId, data) {
  store[userId] = {
    prefs: data.prefs ?? null,
    theme: data.theme ?? null,
    updatedAt: Date.now(),
  };
  save();
  return store[userId];
}

module.exports = { get, set };
