// Every YouTube song the bot plays is saved to the library while it plays.
//
// No extra download: lib/yt-stream.js already streams the song through
// yt-dlp for ffmpeg, and writes the same bytes to _incoming/<videoId>.part.
// A song is saved once both have happened:
//   1. the download finished completely (yt-dlp exit 0), and
//   2. the song actually started playing (DisTube "playSong").
// (A prefetched next song can finish downloading before it plays, and may
// never play if it's removed from the queue; then it isn't saved.)
//
// After that, the same song plays from the library copy (index.js getStreamURL):
// instant, and no YouTube download, so no YouTube rate limit.
//
// Settings live in the library's _config.json: autoSave (on/off) and
// autoSaveMaxMB (space for saved songs; the longest-unplayed go first).
// Songs you uploaded or installed yourself are never removed by it.
const fs = require('node:fs');
const path = require('node:path');

const lib = () => require('./library');
const videoId = (url) => require('./yt-stream').videoId(url);

const MAX_SONG_SEC = 20 * 60;              // longer = a mix or a stream, not a song
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MIN_FREE_BYTES = 1024 * 1024 * 1024; // leave the disk at least 1 GB free
const PENDING_TTL_MS = 60 * 60 * 1000;

const played = new Map();   // videoId -> { meta, at }  song started playing
const done = new Map();     // videoId -> { tmp, at }   download finished
let logFn = () => {};

const enabled = () => { try { return lib().loadConfig().autoSave !== false; } catch { return false; } };

// yt-stream asks this before each YouTube download: where to write a copy, or
// null for "don't" (turned off, or the library already has the song).
const tempPathFor = (id) => {
  if (!id || !enabled() || lib().findByVideoId(id)) return null;
  try { fs.mkdirSync(lib().INCOMING_DIR, { recursive: true }); } catch { return null; }
  return path.join(lib().INCOMING_DIR, `${id}-${Date.now().toString(36)}.part`);
};

const rm = (p) => { try { fs.rmSync(p, { force: true }); } catch { /* gone */ } };

// The file's real type, from its first bytes (yt-dlp picks webm/opus or m4a).
const sniffExt = (file) => {
  let b;
  try { const fd = fs.openSync(file, 'r'); b = Buffer.alloc(12); fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd); } catch { return null; }
  if (b.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'm4a';
  if (b.toString('latin1', 0, 4) === 'OggS') return 'ogg';
  if (b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
};

const freeBytes = () => {
  try { const s = fs.statfsSync(lib().LIB_DIR); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; }
};

// Remove the longest-unplayed saved songs until they fit in autoSaveMaxMB.
const enforceCap = (keepId) => {
  const max = lib().loadConfig().autoSaveMaxMB * 1024 * 1024;
  const saved = lib().list().filter((s) => s.source === 'played')
    .sort((a, b) => (a.lastPlayedAt || a.addedAt || 0) - (b.lastPlayedAt || b.addedAt || 0));
  let total = saved.reduce((n, s) => n + (s.size || 0), 0);
  const removed = [];
  for (const s of saved) {
    if (total <= max) break;
    if (s.id === keepId) continue;
    if (lib().remove(s.id)) { total -= s.size || 0; removed.push(s.name); }
  }
  return removed;
};

// Both halves are in: move the copy into the library.
const finish = (id) => {
  const p = played.get(id); const d = done.get(id);
  if (!p || !d) return null;
  played.delete(id); done.delete(id);
  const { meta } = p;
  const skip = (why) => { rm(d.tmp); if (why) logFn(`Not saved to the library: ${meta.name} (${why})`, 'info'); return null; };
  if (!enabled()) return skip();
  if (lib().findByVideoId(id)) return skip();
  if (meta.isLive || (meta.durationSec && meta.durationSec > MAX_SONG_SEC)) return skip('longer than 20 minutes');
  let size = 0; try { size = fs.statSync(d.tmp).size; } catch { return null; }
  if (!size || size > MAX_FILE_BYTES) return skip('file too large');
  if (freeBytes() - size < MIN_FREE_BYTES) return skip('less than 1 GB free on the disk');
  const ext = sniffExt(d.tmp);
  if (!ext) return skip('unknown audio format');
  try {
    const entry = lib().addPlayed(d.tmp, { ...meta, ext, videoId: id });
    const removed = enforceCap(entry.id);
    logFn(`♫ Saved to the library: ${entry.name} (${(entry.size / 1048576).toFixed(1)} MB)${removed.length ? ` · made room by removing ${removed.length} long-unplayed saved song${removed.length === 1 ? '' : 's'}` : ''}`, 'info');
    return entry;
  } catch (e) { return skip(e.message); }
};

// yt-stream: a download finished completely.
const downloaded = (id, tmp) => {
  const old = done.get(id);
  if (old && old.tmp !== tmp) rm(old.tmp);
  done.set(id, { tmp, at: Date.now() });
  return finish(id);
};

// index.js playSong: a YouTube song started playing.
const notePlayed = (song) => {
  const id = videoId(song?.url);
  if (!id || song?.metadata?.localName) return null;
  played.set(id, {
    at: Date.now(),
    meta: {
      name: song.name || 'song',
      uploader: song.uploader?.name || null,
      durationSec: song.duration || null,
      isLive: !!song.isLive,
      sourceUrl: song.url,
      thumbnail: song.thumbnail || null,
    },
  });
  return finish(id);
};

const sweep = (now = Date.now()) => {
  for (const [id, p] of played) if (now - p.at > PENDING_TTL_MS) played.delete(id);
  for (const [id, d] of done) if (now - d.at > PENDING_TTL_MS) { rm(d.tmp); done.delete(id); }
};

// Saved-song totals for the dashboard.
const stats = () => {
  const saved = lib().list().filter((s) => s.source === 'played');
  return { count: saved.length, bytes: saved.reduce((n, s) => n + (s.size || 0), 0) };
};

let timer = null;
const start = ({ log } = {}) => {
  if (log) logFn = log;
  // copies left half-written by the last run
  try { for (const f of fs.readdirSync(lib().INCOMING_DIR)) rm(path.join(lib().INCOMING_DIR, f)); } catch { /* none */ }
  require('./yt-stream').setSaveHooks({ tempPathFor, downloaded, have: (id) => !!lib().findByVideoId(id) });
  if (!timer) { timer = setInterval(sweep, 5 * 60 * 1000); timer.unref?.(); }
};

const _reset = () => { played.clear(); done.clear(); };

module.exports = { start, notePlayed, downloaded, tempPathFor, enforceCap, sniffExt, stats, sweep, _reset, MAX_SONG_SEC };
