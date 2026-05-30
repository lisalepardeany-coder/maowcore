// Auto-subscribed playlists — periodically polls subscribed YouTube /
// SoundCloud / Bandcamp playlist URLs and auto-installs any newly-added
// entries via the existing library.installFromUrl() pipeline.
//
// State persists alongside the library manifest (in LIBRARY_DIR/_subs.json) so
// subscriptions travel with the library when LIBRARY_DIR moves.
//
// Subscription shape:
//   {
//     id:             string                 — opaque, returned to UI
//     url:            string                 — playlist URL
//     name:           string                 — friendly display name
//     format:         INSTALL_FORMATS key    — defaults to 'original'
//     intervalHours:  number                 — how often to poll
//     lastSyncAt:     number|null            — epoch ms
//     lastError:      string|null            — most recent failure message
//     installedUrls:  string[]               — every track URL we've installed,
//                                              dedup key for "what's new"
//     totalInstalled: number                 — cumulative count
//   }

const fs = require('node:fs');
const path = require('node:path');

const LIB_DIR = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'data', 'library');
const SUBS_PATH = path.join(LIB_DIR, '_subs.json');
const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 24 * 7;
const DEFAULT_INTERVAL_HOURS = 24;

let state = { subs: [] };

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(SUBS_PATH, 'utf8'));
    state = (parsed && typeof parsed === 'object') ? parsed : { subs: [] };
    if (!Array.isArray(state.subs)) state.subs = [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[playlist-subs] load failed:', e.message);
    state = { subs: [] };
  }
};

const save = () => {
  try {
    fs.mkdirSync(LIB_DIR, { recursive: true });
    const tmp = `${SUBS_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, SUBS_PATH);
  } catch (e) { console.warn('[playlist-subs] save failed:', e.message); }
};

const newId = () => `sub-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const list = () => {
  // Return a shallow copy of each sub so the caller can't mutate state.
  // installedUrls is omitted from the dashboard payload — it can be 100s of
  // entries per sub and the UI only ever needs the count.
  return state.subs.map((s) => ({
    id: s.id,
    url: s.url,
    name: s.name,
    format: s.format,
    intervalHours: s.intervalHours,
    lastSyncAt: s.lastSyncAt,
    lastError: s.lastError,
    totalInstalled: s.totalInstalled || 0,
    installedCount: (s.installedUrls || []).length,
    nextSyncAt: s.lastSyncAt
      ? s.lastSyncAt + s.intervalHours * 3600000
      : Date.now(),
  }));
};

const get = (id) => state.subs.find((s) => s.id === id) || null;

const add = ({ url, name, format, intervalHours }) => {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Invalid URL.');
  if (state.subs.some((s) => s.url === url)) {
    throw new Error('Already subscribed to this playlist.');
  }
  const sub = {
    id: newId(),
    url,
    name: String(name || 'Subscribed playlist').slice(0, 120),
    format: format || 'original',
    intervalHours: Math.max(MIN_INTERVAL_HOURS, Math.min(MAX_INTERVAL_HOURS,
      Number(intervalHours) || DEFAULT_INTERVAL_HOURS)),
    lastSyncAt: null,
    lastError: null,
    installedUrls: [],
    totalInstalled: 0,
  };
  state.subs.push(sub);
  save();
  return sub;
};

const remove = (id) => {
  const before = state.subs.length;
  state.subs = state.subs.filter((s) => s.id !== id);
  if (state.subs.length !== before) { save(); return true; }
  return false;
};

const update = (id, patch) => {
  const sub = get(id);
  if (!sub) return null;
  if (patch.name != null) sub.name = String(patch.name).slice(0, 120);
  if (patch.format != null) sub.format = String(patch.format);
  if (patch.intervalHours != null) {
    sub.intervalHours = Math.max(MIN_INTERVAL_HOURS, Math.min(MAX_INTERVAL_HOURS,
      Number(patch.intervalHours) || DEFAULT_INTERVAL_HOURS));
  }
  save();
  return sub;
};

// Sync one subscription: probe the playlist, install entries we haven't
// installed before, mark URLs as seen, update lastSyncAt.
//
// `library` is passed in to avoid a circular import (library imports
// playlist-subs nowhere; passing keeps the dependency one-directional).
const sync = async (id, library, { onProgress } = {}) => {
  const sub = get(id);
  if (!sub) throw new Error('Subscription not found.');
  const noop = onProgress || (() => {});
  noop(`Polling ${sub.name}…`);
  try {
    const meta = await library.probePlaylist(sub.url, { onProgress: noop });
    const seen = new Set(sub.installedUrls || []);
    const newEntries = meta.entries.filter((e) => !seen.has(e.url));
    noop(`${newEntries.length} new of ${meta.entries.length} total`);

    let installed = 0;
    for (const entry of newEntries) {
      try {
        await library.installFromUrl(entry.url, {
          format: sub.format,
          playlist: { id: sub.id, name: sub.name, index: null },
          onProgress: () => { /* throttle */ },
        });
        sub.installedUrls.push(entry.url);
        installed++;
      } catch (e) {
        // Skip a failed entry but keep going — partial success is better
        // than nothing, and the failed URL stays out of installedUrls so
        // the next sync retries it.
        noop(`✕ ${entry.title}: ${e.message}`);
      }
    }
    sub.lastSyncAt = Date.now();
    sub.lastError = null;
    sub.totalInstalled = (sub.totalInstalled || 0) + installed;
    save();
    return { installed, skipped: meta.entries.length - newEntries.length, total: meta.entries.length };
  } catch (e) {
    sub.lastSyncAt = Date.now();
    sub.lastError = e.message;
    save();
    throw e;
  }
};

// Background scheduler — checks every ~5 minutes which subs are due for a
// sync (intervalHours elapsed since lastSyncAt). Single timer regardless of
// how many subs exist; returns a stop() function for graceful shutdown.
const startScheduler = (library, { tickMs = 5 * 60 * 1000, onLog } = {}) => {
  const noop = onLog || (() => {});
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const now = Date.now();
    for (const sub of state.subs) {
      if (stopped) return;
      const due = !sub.lastSyncAt || (now - sub.lastSyncAt) >= sub.intervalHours * 3600000;
      if (!due) continue;
      noop(`↺ Auto-syncing playlist "${sub.name}"`, 'info');
      try {
        const result = await sync(sub.id, library, { onProgress: (l) => noop(`  ${l}`, 'info') });
        if (result.installed > 0) {
          noop(`✓ Auto-sync "${sub.name}": +${result.installed} new tracks`, 'success');
        }
      } catch (e) {
        noop(`✕ Auto-sync "${sub.name}" failed: ${e.message}`, 'error');
      }
    }
  };
  const timer = setInterval(tick, tickMs);
  timer.unref?.();
  // Kick off a first tick after ~10s so subs added at boot get checked promptly.
  const boot = setTimeout(tick, 10000);
  boot.unref?.();
  return () => { stopped = true; clearInterval(timer); clearTimeout(boot); };
};

load();

module.exports = {
  list, get, add, remove, update, sync, startScheduler,
  SUBS_PATH, MIN_INTERVAL_HOURS, MAX_INTERVAL_HOURS, DEFAULT_INTERVAL_HOURS,
};
