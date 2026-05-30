// Community sharing for v2.3.0 — export/import portable bundles of
// reusable bot configuration. Local-first: bundles are just JSON files,
// no central server, share however you want (Discord file, GitHub gist,
// pastebin, anything that serves text).
//
// Bundle shape:
//   {
//     bundleVersion: 1,
//     kind: 'playlist' | 'automod' | 'welcome' | 'theme' | 'mixed',
//     name: 'Display name',
//     author: 'who made this',
//     description: '...',
//     createdAt: timestamp,
//     payload: { ...kind-specific },
//   }

const fs = require('node:fs');
const path = require('node:path');
const { getGuild, updateGuild } = require('./config');

const SHARED_DIR = path.join(__dirname, '..', 'data', 'shared');
const ensureDir = () => { try { fs.mkdirSync(SHARED_DIR, { recursive: true }); } catch { /* */ } };

// === Export builders — produce a bundle from current guild state. ===
const exportPlaylist = (guildId, userId, playlistName) => {
  const playlists = require('./playlists');
  const urls = playlists.load(guildId, userId, playlistName);
  return {
    bundleVersion: 1,
    kind: 'playlist',
    name: playlistName,
    author: userId,
    createdAt: Date.now(),
    payload: { urls },
  };
};

const exportAutomod = (guildId, label) => {
  const cfg = getGuild(guildId);
  return {
    bundleVersion: 1,
    kind: 'automod',
    name: label || `${guildId} automod`,
    createdAt: Date.now(),
    payload: cfg.automod || {},
  };
};

const exportWelcome = (guildId, label) => {
  const cfg = getGuild(guildId);
  return {
    bundleVersion: 1,
    kind: 'welcome',
    name: label || `${guildId} welcome`,
    createdAt: Date.now(),
    payload: {
      welcomeMessage: cfg.welcomeMessage || '',
      farewellMessage: cfg.farewellMessage || '',
      welcomeSoundUrl: cfg.welcomeSoundUrl || '',
      leaveSoundUrl: cfg.leaveSoundUrl || '',
    },
  };
};

// === Import — apply a bundle to a guild. Each kind has its own validator. ===
const importBundle = (guildId, userId, bundle) => {
  if (!bundle || bundle.bundleVersion !== 1) throw new Error('Invalid or unsupported bundle.');
  const kind = String(bundle.kind || '');
  if (kind === 'playlist') {
    const playlists = require('./playlists');
    const urls = Array.isArray(bundle.payload?.urls) ? bundle.payload.urls : [];
    if (!urls.length) throw new Error('Bundle has no URLs.');
    const name = String(bundle.name || 'imported').slice(0, 32);
    const n = playlists.save(guildId, userId, name, urls);
    return { kind, name, applied: n };
  }
  if (kind === 'automod') {
    const next = { ...(bundle.payload || {}) };
    updateGuild(guildId, { automod: next });
    return { kind, name: bundle.name, applied: Object.keys(next).length };
  }
  if (kind === 'welcome') {
    const p = bundle.payload || {};
    updateGuild(guildId, {
      welcomeMessage: String(p.welcomeMessage || '').slice(0, 1500),
      farewellMessage: String(p.farewellMessage || '').slice(0, 1500),
      welcomeSoundUrl: String(p.welcomeSoundUrl || '').slice(0, 500),
      leaveSoundUrl: String(p.leaveSoundUrl || '').slice(0, 500),
    });
    return { kind, name: bundle.name, applied: Object.keys(p).length };
  }
  throw new Error(`Unknown bundle kind: ${kind}`);
};

// === Local "shared with me" registry — bundles saved for re-use. ===
const list = () => {
  ensureDir();
  try {
    return fs.readdirSync(SHARED_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const full = path.join(SHARED_DIR, f);
        try {
          const data = JSON.parse(fs.readFileSync(full, 'utf8'));
          return {
            file: f,
            kind: data.kind,
            name: data.name,
            author: data.author || null,
            description: data.description || null,
            createdAt: data.createdAt,
            size: fs.statSync(full).size,
          };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch { return []; }
};

const save = (bundle) => {
  ensureDir();
  const safeName = String(bundle.name || 'bundle').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  // Random suffix to dodge same-ms collisions when two saves race.
  const rnd = Math.random().toString(36).slice(2, 6);
  const target = path.join(SHARED_DIR, `${bundle.kind}-${safeName}-${Date.now()}-${rnd}.json`);
  // Atomic: .tmp + rename.
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2));
  fs.renameSync(tmp, target);
  return path.basename(target);
};

const remove = (file) => {
  const full = path.join(SHARED_DIR, path.basename(file));
  if (!full.startsWith(SHARED_DIR)) throw new Error('Forbidden path.');
  try { fs.unlinkSync(full); return true; } catch { return false; }
};

const read = (file) => {
  const full = path.join(SHARED_DIR, path.basename(file));
  if (!full.startsWith(SHARED_DIR)) throw new Error('Forbidden path.');
  return JSON.parse(fs.readFileSync(full, 'utf8'));
};

// Import from a URL — fetches JSON, validates, returns the bundle without
// applying it (caller chooses).
//
// Uses streaming + Content-Length precheck + an AbortSignal so a malicious
// or slow server can't exhaust memory or hang the bot forever. 10s timeout,
// 5 MB cap.
const fetchBundle = async (url) => {
  if (!/^https?:\/\//.test(url)) throw new Error('URL must be http(s).');
  const MAX_BYTES = 5 * 1024 * 1024;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10000);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
  } finally { clearTimeout(timeout); }
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  // Pre-check Content-Length if the server provides it — reject huge bodies
  // before reading them.
  const cl = Number(res.headers.get('content-length'));
  if (Number.isFinite(cl) && cl > MAX_BYTES) {
    throw new Error(`Bundle too large (Content-Length: ${cl}, max ${MAX_BYTES}).`);
  }
  // Stream into a size-capped buffer to handle servers that omit Content-Length.
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Bundle too large (>5 MB).');
    return parseBundle(text);
  }
  const chunks = [];
  let received = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > MAX_BYTES) {
      try { reader.cancel(); } catch { /* */ }
      throw new Error('Bundle too large (>5 MB) — aborted mid-stream.');
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return parseBundle(text);
};

const parseBundle = (text) => {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Not valid JSON.'); }
  if (!parsed || parsed.bundleVersion !== 1) throw new Error('Not a valid bundle (bundleVersion ≠ 1).');
  return parsed;
};

module.exports = {
  exportPlaylist, exportAutomod, exportWelcome,
  importBundle, list, save, remove, read, fetchBundle,
  SHARED_DIR,
};
