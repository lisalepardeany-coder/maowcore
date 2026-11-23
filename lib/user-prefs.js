'use strict';
// lib/user-prefs.js — server-side storage of dashboard preferences per user,
// so settings can sync across devices. JSON-backed (data/user-prefs.json).

const path = require('node:path');

const FILE = path.join(__dirname, '..', 'data', 'user-prefs.json');
let store = {}; // userId → { prefs, theme, updatedAt }

const { readJson, writeJson } = require('./safe-json');
function load() {
  store = readJson(FILE, {}, { valid: (d) => d && typeof d === 'object' && !Array.isArray(d), label: 'user-prefs' });
}
function save() {
  try { writeJson(FILE, store); }
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
