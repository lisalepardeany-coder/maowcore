'use strict';
// lib/integrations-config.js — runtime-editable integration credentials
// (currently Last.fm). Persisted to data/integrations.json and injected into
// process.env on load, so integrations.js (which reads process.env) picks them
// up without code changes. Env vars still win if the file is absent.

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'data', 'integrations.json');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; }
  catch { return {}; }
}

// Apply stored creds to process.env (called once on boot, and after a save).
function load() {
  const cfg = read();
  if (cfg.lastfm) {
    if (cfg.lastfm.apiKey) process.env.LASTFM_API_KEY = cfg.lastfm.apiKey;
    if (cfg.lastfm.apiSecret) process.env.LASTFM_API_SECRET = cfg.lastfm.apiSecret;
    if (cfg.lastfm.sessionKey) process.env.LASTFM_SESSION_KEY = cfg.lastfm.sessionKey;
  }
}

function getLastfm() {
  const cfg = read();
  const l = cfg.lastfm || {};
  // Report presence (masked) without leaking secrets.
  return {
    enabled: !!(process.env.LASTFM_API_KEY && process.env.LASTFM_API_SECRET && process.env.LASTFM_SESSION_KEY),
    hasApiKey: !!(l.apiKey || process.env.LASTFM_API_KEY),
    hasApiSecret: !!(l.apiSecret || process.env.LASTFM_API_SECRET),
    hasSessionKey: !!(l.sessionKey || process.env.LASTFM_SESSION_KEY),
    apiKeyPreview: (l.apiKey || process.env.LASTFM_API_KEY || '').slice(0, 6) + '…',
  };
}

function setLastfm({ apiKey, apiSecret, sessionKey }) {
  const cfg = read();
  cfg.lastfm = {
    apiKey: apiKey != null ? String(apiKey).trim() : cfg.lastfm?.apiKey || '',
    apiSecret: apiSecret != null ? String(apiSecret).trim() : cfg.lastfm?.apiSecret || '',
    sessionKey: sessionKey != null ? String(sessionKey).trim() : cfg.lastfm?.sessionKey || '',
  };
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(cfg)); }
  catch (e) { console.warn('[integrations-config] save failed:', e.message); }
  load(); // push into process.env immediately
  return getLastfm();
}

module.exports = { load, getLastfm, setLastfm };
