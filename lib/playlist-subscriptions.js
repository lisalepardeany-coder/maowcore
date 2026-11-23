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

const path = require('node:path');

const LIB_DIR = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'data', 'library');
const SUBS_PATH = path.join(LIB_DIR, '_subs.json');
const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 24 * 7;
const DEFAULT_INTERVAL_HOURS = 24;

let state = { subs: [] };

const { readJson, writeJson } = require('./safe-json');
// a damaged file is restored from its backup, never silently replaced by "no subscriptions"
const load = () => {
  state = readJson(SUBS_PATH, { subs: [] }, { valid: (d) => d && Array.isArray(d.subs), label: 'playlist-subs' });
};

const save = () => {
  try { writeJson(SUBS_PATH, state); }
  catch (e) { console.warn('[playlist-subs] save failed:', e.message); }
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

// Sync one subscription: read the playlist (YouTube, SoundCloud, Bandcamp or
// Spotify), and hand the songs it doesn't have yet to the download queue
// (lib/download-queue.js). The queue survives restarts, waits out YouTube's
// rate limit, and reports each finished song back (noteInstalled), so a song
// that failed is simply tried again on the next sync.
//
// `library` is kept as a parameter for older callers; the queue does the work.
const sync = async (id, library, { onProgress } = {}) => {
  const sub = get(id);
  if (!sub) throw new Error('Subscription not found.');
  const noop = onProgress || (() => {});
  const queue = require('./download-queue');
  noop(`Polling ${sub.name}…`);
  try {
    if (queue.activeForSub(sub.id)) {
      noop('The previous sync is still downloading; checking again next time.');
      return { queued: 0, skipped: 0, total: 0, busy: true };
    }
    const p = await queue.probe(sub.url);
    const seen = new Set(sub.installedUrls || []);
    const pick = p.entries.map((e, i) => (seen.has(e.url || e.query) ? -1 : i)).filter((i) => i >= 0);
    noop(`${pick.length} new of ${p.entries.length} total`);
    sub.lastSyncAt = Date.now();
    sub.lastError = null;
    if (p.name && sub.name === 'Subscribed playlist') sub.name = String(p.name).slice(0, 120);
    save();
    if (pick.length) await queue.create(sub.url, { format: sub.format, pick, name: `↺ ${sub.name}`, subId: sub.id, probed: p });
    return { queued: pick.length, skipped: p.entries.length - pick.length, total: p.entries.length };
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
        if (result.queued > 0) {
          noop(`✓ Auto-sync "${sub.name}": ${result.queued} new song${result.queued === 1 ? '' : 's'} queued (⬇ Downloads)`, 'success');
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

// Called by the download queue when a subscription's song is in the library
// (new or already there): remember it so the next sync skips it.
const noteInstalled = (subId, key) => {
  const sub = get(subId);
  if (!sub || !key) return;
  sub.installedUrls = sub.installedUrls || [];
  if (sub.installedUrls.includes(key)) return;
  sub.installedUrls.push(key);
  sub.totalInstalled = (sub.totalInstalled || 0) + 1;
  save();
};

module.exports = {
  list, get, add, remove, update, sync, startScheduler, noteInstalled,
  SUBS_PATH, MIN_INTERVAL_HOURS, MAX_INTERVAL_HOURS, DEFAULT_INTERVAL_HOURS,
};
