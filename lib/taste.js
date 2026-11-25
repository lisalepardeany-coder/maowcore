// Smarter autoplay: remembers what each server lets play and what it skips,
// and uses that to pick the next autoplay song from YouTube's related list
// (DisTube on its own just takes the first related song).
//
// Signals, per server:
//   - a song played to (almost) the end  → a "finish" for that song and its artist
//   - a song skipped early               → a "skip"   for that song and its artist
// Saved in data/taste.json (a few hundred KB at most; old entries drop off).
const path = require('node:path');
const { readJson, writeJson } = require('./safe-json');

const FILE = process.env.NODE_TEST_CONTEXT
  ? path.join(require('node:os').tmpdir(), `maow-taste-${process.pid}.json`)
  : path.join(__dirname, '..', 'data', 'taste.json');
const MAX_SONGS = 1500;      // per server
const MAX_ARTISTS = 600;     // per server
const EARLY_SKIP_S = 45;     // left before this (and before half the song) = skipped
const FINISH_SHARE = 0.85;   // heard at least this much of it = finished

let data = null;
const load = () => { if (!data) data = readJson(FILE, {}, {}) || {}; return data; };
let saveTimer = null;
const save = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; try { writeJson(FILE, data); } catch (e) { console.warn('[taste] save failed:', e.message); } }, 5000);
  saveTimer.unref?.();
};

const guild = (id) => {
  const d = load();
  d[id] ||= { songs: {}, artists: {} };
  return d[id];
};
const songKey = (s) => String(s?.id || s?.url || s?.name || '');
const artistOf = (s) => String(s?.uploader?.name || s?.author || '').replace(/\s*-\s*Topic$|VEVO$/i, '').trim().toLowerCase();

// Keep the store small: drop the entries not touched for the longest.
const trim = (obj, max) => {
  const keys = Object.keys(obj);
  if (keys.length <= max) return;
  keys.sort((a, b) => (obj[a].last || 0) - (obj[b].last || 0));
  for (const k of keys.slice(0, keys.length - max)) delete obj[k];
};

// Pure: was this play a skip, a finish, or neither? (unit tested)
const outcome = (heardSec, durationSec) => {
  if (!durationSec) return null;                                   // live / unknown length
  if (heardSec >= durationSec * FINISH_SHARE) return 'finish';
  if (heardSec < EARLY_SKIP_S && heardSec < durationSec / 2) return 'skip';
  return null;                                                     // left somewhere in the middle: no opinion
};

const record = (guildId, song, kind) => {
  if (!kind || !songKey(song)) return;
  const g = guild(guildId);
  const now = Date.now();
  const s = (g.songs[songKey(song)] ||= { skips: 0, finishes: 0 });
  s[kind === 'skip' ? 'skips' : 'finishes']++; s.last = now;
  const a = artistOf(song);
  if (a) { const r = (g.artists[a] ||= { skips: 0, finishes: 0 }); r[kind === 'skip' ? 'skips' : 'finishes']++; r.last = now; }
  trim(g.songs, MAX_SONGS); trim(g.artists, MAX_ARTISTS);
  save();
};

// What is playing now, per server, so the next playSong can judge it.
const current = new Map(); // guildId -> { song, startedAt }
const notePlay = (guildId, song, now = Date.now()) => {
  const prev = current.get(guildId);
  if (prev) record(guildId, prev.song, outcome((now - prev.startedAt) / 1000, prev.song.duration));
  current.set(guildId, song ? { song, startedAt: now } : undefined);
  if (!song) current.delete(guildId);
};
const noteStop = (guildId, now) => notePlay(guildId, null, now);
const forget = (guildId) => { current.delete(guildId); };

// How much this server should like `candidate`. Higher = better; the best
// related song is played. `stats` = { song: {skips, finishes} | undefined,
// artist: {skips, finishes} | undefined }; `rank` = its place in YouTube's
// related list (0 = YouTube's own first pick).
function score(candidate, stats, rank) {
  // TODO(human)
  return -rank;
}

// Pick the best of DisTube's related songs for this server.
const pick = (guildId, candidates) => {
  const g = guild(guildId);
  let best = candidates[0]; let bestScore = -Infinity;
  candidates.forEach((c, rank) => {
    const v = score(c, { song: g.songs[songKey(c)], artist: g.artists[artistOf(c)] }, rank);
    if (v > bestScore) { bestScore = v; best = c; }
  });
  return best;
};

// Replace DisTube's "first related song" for one queue with pick().
// Anything unexpected falls back to DisTube's own behaviour.
const attach = (queue) => {
  if (queue._tasteAttached || typeof queue._addRelatedSong !== 'function') return;
  queue._tasteAttached = true;
  const original = queue._addRelatedSong.bind(queue);
  queue._addRelatedSong = async (song) => {
    const now = song ?? queue.songs?.[0];
    try {
      const seen = new Set([...(queue.previousSongs || []), ...(queue.songs || [])].map(songKey));
      const relatedOf = async (s) => {
        const plugin = s && await queue.handler._getPluginFromSong(s);
        return plugin ? (await plugin.getRelatedSongs(s)) || [] : [];
      };
      let list = (await relatedOf(now)).filter((s) => s && !seen.has(songKey(s)));
      if (!list.length && now?.stream && !now.stream.playFromSource) list = (await relatedOf(now.stream.song)).filter((s) => s && !seen.has(songKey(s)));
      if (list.length) {
        const next = pick(queue.id, list.slice(0, 15));
        next.metadata = now?.metadata;
        next.member = queue.clientMember;
        queue.addToQueue(next);
        return next;
      }
    } catch (e) { console.warn('[taste] smart autoplay fell back:', e.message); }
    return original(song);
  };
};

const stats = (guildId) => guild(guildId);
const _reset = () => { data = {}; current.clear(); };

module.exports = { outcome, record, notePlay, noteStop, forget, score, pick, attach, stats, artistOf, _reset, EARLY_SKIP_S, FINISH_SHARE };
