// ===== Playlist downloads: a saved queue =====
// Replaces the old in-memory playlist jobs, which were lost on every restart,
// gave up at YouTube's rate limit, and only knew counts.
//
//   - Jobs and every song's status are saved (data/download-jobs.json, via
//     safe-json), so after a restart the unfinished songs simply continue.
//   - One queue for all jobs, with a small number of downloads at once
//     (YouTube rate-limits bursts from one server).
//   - YouTube rate limit: the whole queue waits (the block is per server, not
//     per playlist), then continues by itself. The song is not counted as failed.
//   - Each song: pending → downloading → done / skipped (already in the
//     library) / failed (with the reason) / excluded (not picked) / cancelled.
//     Failed ones can be retried.
//   - Spotify playlists, albums and tracks: the song list comes from Spotify's
//     public embed page (no account), and each song is found on YouTube.
const path = require('node:path');
const { readJson, writeJson } = require('./safe-json');

const FILE = process.env.NODE_TEST_CONTEXT
  ? path.join(require('node:os').tmpdir(), `maow-dl-jobs-${process.pid}.json`)
  : path.join(__dirname, '..', 'data', 'download-jobs.json');
const RATE_LIMIT_WAIT_MS = 60 * 60 * 1000;
const KEEP_FINISHED = 30;
const PROBE_CACHE_MS = 10 * 60 * 1000;

const lib = () => require('./library'); // lazy: library loads yt-dlp settings at require time

let state = { jobs: [], pausedUntil: 0 };
let hooks = { onUpdate: () => {}, onLog: () => {} };
const finishListeners = []; // (job summary, job) => {} — e.g. /download posts "done" in Discord
const onFinish = (fn) => { finishListeners.push(fn); };
// owner DMs (lib/health-alerts); harmless before Discord is ready
const healthAlert = (kind, title, text, opts) => { try { require('./health-alerts').alert(kind, title, text, opts); } catch { /* */ } };
let active = 0;
let wakeTimer = null;
const running = new Map(); // `${jobId}:${index}` -> AbortController
const probeCache = new Map(); // url -> { at, result }

const save = () => { try { writeJson(FILE, state); } catch (e) { console.warn('[downloads] save failed:', e.message); } };
const short = (msg) => String(msg || 'unknown error').split('\n')[0].replace(/^yt-dlp exited \d+:\s*/, '').slice(0, 300);
const newId = () => `dl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const isActive = (job) => job.status === 'queued' || job.status === 'running';

// ---------------------------------------------------------------- sources

// Spotify: playlist | album | track, read from the public embed page.
const spotifyId = (url) => {
  const m = String(url || '').match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([A-Za-z0-9]{10,30})/i);
  return m ? { type: m[1].toLowerCase(), id: m[2] } : null;
};
const fetchSpotify = async ({ type, id }) => {
  const r = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Spotify answered ${r.status}. Is the ${type} public?`);
  const html = await r.text();
  const data = require('./spotify-embed').parseEmbed(html);
  if (data?.tracks?.length) return data;
  // a single track's embed has no trackList: read the entity itself
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const e = m ? JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity : null;
  if (type === 'track' && e?.name) {
    const artists = (e.artists || []).map((a) => a.name).join(', ');
    return { name: e.name, tracks: [{ id, name: e.name, artists, duration: Math.round((e.duration || 0) / 1000) }] };
  }
  throw new Error(`This Spotify ${type} is private, empty or not available.`);
};

// Pure (tested): a Spotify track → the YouTube search that finds it.
const searchFor = (t) => `ytsearch1:${[t.artists, t.name].filter(Boolean).join(' - ')} audio`;

// Pure (tested): is this a link to several songs (playlist, album, set, any Spotify link)?
const isCollectionUrl = (url) => {
  try {
    const u = new URL(url);
    if (/open\.spotify\.com$/i.test(u.hostname)) return true;
    if (u.searchParams.has('list')) return true;
    return /\/(playlist|sets|album)(\/|$)/.test(u.pathname);
  } catch { return false; }
};

const sourceOf = (url) => {
  if (spotifyId(url)) return 'spotify';
  if (/youtu\.?be/i.test(url)) return 'youtube';
  if (/soundcloud\.com/i.test(url)) return 'soundcloud';
  if (/bandcamp\.com/i.test(url)) return 'bandcamp';
  return 'other';
};

// The song list for a link, without downloading anything.
const probe = async (url) => {
  const hit = probeCache.get(url);
  if (hit && Date.now() - hit.at < PROBE_CACHE_MS) return hit.result;
  let result;
  const sp = spotifyId(url);
  if (sp) {
    const data = await fetchSpotify(sp);
    result = {
      name: data.name, source: 'spotify', url,
      entries: data.tracks.map((t) => ({ title: [t.artists, t.name].filter(Boolean).join(' - '), query: searchFor(t), duration: t.duration || null })),
    };
  } else {
    const meta = await lib().probePlaylist(url);
    result = {
      name: meta.playlistName, source: sourceOf(url), url,
      entries: meta.entries.map((e) => ({ title: e.title, url: e.url, duration: null })),
    };
  }
  if (!result.entries.length) throw new Error('No songs found at that link.');
  probeCache.set(url, { at: Date.now(), result });
  return result;
};

// ---------------------------------------------------------------- views

const counts = (job) => {
  const c = { total: 0, pending: 0, downloading: 0, done: 0, skipped: 0, failed: 0, excluded: 0, cancelled: 0 };
  for (const it of job.items) { c[it.status] = (c[it.status] || 0) + 1; if (it.status !== 'excluded') c.total++; }
  return c;
};
// Summary of a job. Also carries the fields the older dashboard code reads
// (playlistName, total, done, skipped, failed, currentTitles).
const summary = (job) => {
  const c = counts(job);
  const waiting = isActive(job) && state.pausedUntil > Date.now();
  return {
    id: job.id, url: job.url, name: job.name, playlistName: job.name, source: job.source, format: job.format,
    status: waiting ? 'waiting' : job.status, resumeAt: waiting ? state.pausedUntil : null,
    createdAt: job.createdAt, finishedAt: job.finishedAt || null, subId: job.subId || null,
    counts: c, total: c.total, done: c.done, skipped: c.skipped, failed: c.failed,
    currentTitles: job.items.filter((it) => it.status === 'downloading').map((it) => it.title),
  };
};
const list = () => state.jobs.map(summary).reverse(); // newest first
const get = (id) => {
  const job = state.jobs.find((j) => j.id === id);
  return job ? { ...summary(job), items: job.items.map(({ i, title, status, error, file, entryId }) => ({ i, title, status, error: error || null, file: file || null, entryId: entryId || null })) } : null;
};

const emit = (job) => { try { hooks.onUpdate(summary(job)); } catch { /* */ } };

// ---------------------------------------------------------------- the worker

const maxParallel = () => Math.max(1, Math.min(3, Number(lib().loadConfig().concurrency) || 2));

const nextItem = () => {
  for (const job of state.jobs) {
    if (!isActive(job)) continue;
    const item = job.items.find((it) => it.status === 'pending');
    if (item) return { job, item };
  }
  return null;
};

const finishIfDone = (job) => {
  if (!isActive(job)) return;
  if (job.items.some((it) => it.status === 'pending' || it.status === 'downloading')) return;
  job.status = 'done';
  job.finishedAt = Date.now();
  const c = counts(job);
  const failed = job.items.filter((it) => it.status === 'failed');
  let why = '';
  if (failed.length) {
    const tally = new Map();
    for (const f of failed) tally.set(f.error, (tally.get(f.error) || 0) + 1);
    const [top, n] = [...tally].sort((a, b) => b[1] - a[1])[0];
    why = `\n  Most failures (${n}/${failed.length}): ${top}`;
  }
  const line = `${job.name} (${c.done} new, ${c.skipped} already had, ${c.failed} failed)`;
  hooks.onLog(`${failed.length && !c.done && !c.skipped ? '✕' : '✓'} Download finished: ${line}${why}`,
    failed.length ? (c.done || c.skipped ? 'warn' : 'error') : 'success');
  // a big download: tell the owner (unique kind per job, so each one gets through)
  if (c.total >= 10) {
    healthAlert(`download:${job.id}`, `Download finished: ${job.name}`,
      `${c.done} new song${c.done === 1 ? '' : 's'}, ${c.skipped} already in the library, ${c.failed} failed.${why ? `\n${why.trim()}` : ''}`,
      { color: failed.length ? 0xf59e0b : 0x23a55a, icon: '⬇' });
  }
  for (const fn of finishListeners) { try { fn(summary(job), job); } catch (e) { console.warn('[downloads] finish listener:', e.message); } }
  // keep the newest finished jobs only
  const finished = state.jobs.filter((j) => !isActive(j) && j.status !== 'paused');
  while (finished.length > KEEP_FINISHED) {
    const old = finished.shift();
    state.jobs.splice(state.jobs.indexOf(old), 1);
  }
};

const scheduleWake = (ms) => {
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => { wakeTimer = null; pump(); }, Math.max(1000, ms));
  wakeTimer.unref?.();
};

const run = async (job, item) => {
  active++;
  const key = `${job.id}:${item.i}`;
  const ctrl = new AbortController();
  running.set(key, ctrl);
  item.status = 'downloading';
  item.error = null;
  if (job.status === 'queued') job.status = 'running';
  save(); emit(job);
  try {
    if (!item.url && item.query) {
      item.url = await lib().resolveSearch(item.query, { signal: ctrl.signal });
    }
    const { entry, alreadyInstalled } = await lib().installFromUrl(item.url, {
      format: job.format, polite: true, signal: ctrl.signal,
      playlist: { id: job.id, name: job.name, index: item.i },
    });
    item.status = alreadyInstalled ? 'skipped' : 'done';
    item.file = entry?.name || null;
    item.entryId = entry?.id || null; // for "Play" on a finished download
    // subscriptions remember what they already have (by the link they listed)
    if (job.subId) { try { require('./playlist-subscriptions').noteInstalled(job.subId, item.key || item.url); } catch { /* */ } }
  } catch (e) {
    if (ctrl.signal.aborted) {
      // paused → back in line; cancelled → stays cancelled (set by cancel())
      if (item.status === 'downloading') item.status = job.status === 'cancelled' ? 'cancelled' : 'pending';
    } else if (lib().isRateLimited(e.message)) {
      item.status = 'pending'; // not its fault: try it again after the wait
      if (state.pausedUntil < Date.now()) {
        state.pausedUntil = Date.now() + RATE_LIMIT_WAIT_MS;
        hooks.onLog(`⏸ YouTube rate limit: downloads wait until ${new Date(state.pausedUntil).toLocaleTimeString()}, then continue by themselves.`, 'warn');
        healthAlert('ratelimit', 'YouTube rate-limited the server',
          `Downloads are paused and continue by themselves <t:${Math.floor(state.pausedUntil / 1000)}:R>. Playing YouTube songs may fail until then.`,
          { color: 0xf59e0b, icon: '⏸' });
      }
    } else {
      item.status = 'failed';
      item.error = short(e.message);
    }
  } finally {
    running.delete(key);
    active--;
    finishIfDone(job);
    save(); emit(job);
    pump();
  }
};

const pump = () => {
  const wait = state.pausedUntil - Date.now();
  if (wait > 0) {
    scheduleWake(wait);
    for (const job of state.jobs) if (isActive(job)) emit(job); // shows "waiting"
    return;
  }
  while (active < maxParallel()) {
    const next = nextItem();
    if (!next) break;
    run(next.job, next.item);
  }
};

// ---------------------------------------------------------------- actions

// opts: format, pick (song indexes; default all), name (override), subId (a
// playlist subscription), notify ({ channelId } to post in when finished),
// probed (an already-probed song list, so it isn't fetched twice).
const create = async (url, { format = 'original', pick = null, name = null, subId = null, notify = null, probed = null } = {}) => {
  const p = probed || await probe(url);
  const picked = Array.isArray(pick) ? new Set(pick.map(Number)) : null;
  const job = {
    id: newId(), url, name: name || p.name, source: p.source,
    format: lib().INSTALL_FORMATS[format] ? format : 'original',
    status: 'queued', createdAt: Date.now(), finishedAt: null,
    subId: subId || null, notify: notify || null,
    items: p.entries.map((e, i) => ({
      i, title: e.title, url: e.url || null, query: e.query || null, key: e.url || e.query || null,
      status: picked && !picked.has(i) ? 'excluded' : 'pending', error: null, file: null, entryId: null,
    })),
  };
  if (!job.items.some((it) => it.status === 'pending')) throw new Error('No songs selected.');
  state.jobs.push(job);
  save(); emit(job);
  hooks.onLog(`⬇ Download queued: ${job.name} (${counts(job).total} songs, ${job.format})`, 'info');
  pump();
  return summary(job);
};

const find = (id) => {
  const job = state.jobs.find((j) => j.id === id);
  if (!job) throw new Error('No such download.');
  return job;
};
const abortJob = (job) => { for (const [key, ctrl] of running) if (key.startsWith(`${job.id}:`)) ctrl.abort(); };

const cancel = (id) => {
  const job = find(id);
  if (!isActive(job) && job.status !== 'paused') return summary(job);
  job.status = 'cancelled';
  job.finishedAt = Date.now();
  for (const it of job.items) if (it.status === 'pending' || it.status === 'downloading') it.status = 'cancelled';
  abortJob(job);
  save(); emit(job);
  return summary(job);
};
const pause = (id) => {
  const job = find(id);
  if (!isActive(job)) return summary(job);
  job.status = 'paused';
  abortJob(job); // the songs in progress go back in line
  save(); emit(job);
  return summary(job);
};
const resume = (id) => {
  const job = find(id);
  if (job.status !== 'paused') return summary(job);
  job.status = 'queued';
  save(); emit(job); pump();
  return summary(job);
};
const retry = (id) => {
  const job = find(id);
  let n = 0;
  for (const it of job.items) if (it.status === 'failed' || it.status === 'cancelled') { it.status = 'pending'; it.error = null; n++; }
  if (!n) return summary(job);
  job.status = 'queued';
  job.finishedAt = null;
  save(); emit(job); pump();
  return summary(job);
};
const remove = (id) => {
  const job = find(id);
  if (isActive(job)) cancel(id);
  state.jobs.splice(state.jobs.indexOf(job), 1);
  save();
  hooks.onUpdate({ id, removed: true });
  return true;
};
// Stop waiting for a rate limit now (when you know it's over).
const continueNow = () => { state.pausedUntil = 0; save(); pump(); return true; };

// Library song ids of a download's finished songs, in playlist order (for "Play").
const entryIds = (id) => find(id).items.filter((it) => (it.status === 'done' || it.status === 'skipped') && it.entryId).map((it) => it.entryId);
// Is a subscription's download still running? (so a sync doesn't start a second one)
const activeForSub = (subId) => state.jobs.some((j) => j.subId === subId && (isActive(j) || j.status === 'paused'));

// ---------------------------------------------------------------- start

let started = false;
const start = ({ onUpdate, onLog } = {}) => {
  hooks = { onUpdate: onUpdate || hooks.onUpdate, onLog: onLog || hooks.onLog };
  if (started) return;
  started = true;
  state = readJson(FILE, { jobs: [], pausedUntil: 0 }, {
    valid: (d) => d && Array.isArray(d.jobs), label: 'download-jobs',
  });
  // songs that were downloading when the bot stopped: back in line
  let resumed = 0;
  for (const job of state.jobs) {
    for (const it of job.items) if (it.status === 'downloading') { it.status = 'pending'; }
    if (isActive(job) && job.items.some((it) => it.status === 'pending')) resumed++;
  }
  if (resumed) {
    save();
    hooks.onLog(`↻ Continuing ${resumed} unfinished download${resumed === 1 ? '' : 's'} from before the restart.`, 'info');
  }
  scheduleWake(5000); // let the bot finish starting first
};

const _reset = () => {
  clearTimeout(wakeTimer); wakeTimer = null;
  for (const c of running.values()) c.abort();
  running.clear(); probeCache.clear();
  state = { jobs: [], pausedUntil: 0 }; active = 0; started = false;
  hooks = { onUpdate: () => {}, onLog: () => {} };
};

module.exports = {
  start, probe, create, list, get, cancel, pause, resume, retry, remove, continueNow,
  entryIds, activeForSub, onFinish, isCollectionUrl,
  searchFor, spotifyId, sourceOf, FILE, RATE_LIMIT_WAIT_MS, _state: () => state, _reset,
};
