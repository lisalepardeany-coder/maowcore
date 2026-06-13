'use strict';
// lib/api-tokens.js — personal API tokens for scripting against the bot's API.
// JSON-backed (data/api-tokens.json). Each token maps to the owning userId.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = path.join(__dirname, '..', 'data', 'api-tokens.json');
let tokens = []; // { token, userId, name, createdAt, lastUsedAt }

function load() {
  try { tokens = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (!Array.isArray(tokens)) tokens = []; }
  catch { tokens = []; }
}
function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(tokens)); }
  catch (e) { console.warn('[api-tokens] save failed:', e.message); }
}
load();

// Public, never returns the full token (only a prefix) for listing.
function listForUser(userId) {
  return tokens
    .filter((t) => t.userId === userId)
    .map((t) => ({ name: t.name, prefix: `${t.token.slice(0, 10)}…`, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt || null, id: t.token.slice(0, 16) }));
}

function create(userId, name) {
  const token = 'mk_' + crypto.randomBytes(24).toString('hex');
  tokens.push({ token, userId, name: String(name || 'token').slice(0, 60), createdAt: Date.now(), lastUsedAt: 0 });
  save();
  return { token, name }; // full token returned ONCE on creation
}

function revoke(userId, idPrefix) {
  const before = tokens.length;
  tokens = tokens.filter((t) => !(t.userId === userId && t.token.slice(0, 16) === idPrefix));
  if (tokens.length !== before) { save(); return true; }
  return false;
}

// Resolve a full token → { userId } (for API auth). Bumps lastUsedAt.
function lookup(token) {
  if (!token || !token.startsWith('mk_')) return null;
  const t = tokens.find((x) => x.token === token);
  if (!t) return null;
  t.lastUsedAt = Date.now();
  return { userId: t.userId, tag: t.name, viaApiToken: true };
}

module.exports = { listForUser, create, revoke, lookup };
