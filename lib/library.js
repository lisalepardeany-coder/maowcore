// Local song library — user-uploaded audio files the bot can play instantly.
// Files live in data/library/; a JSON manifest tracks display names + metadata.
// The bot streams them over the control server's HTTP endpoint (yt-dlp can't
// resolve a local file path), so duration is probed here at upload time —
// yt-dlp can't determine length from the HTTP stream alone.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const ffmpegPath = require('ffmpeg-static');

const LIB_DIR = path.join(__dirname, '..', 'data', 'library');
const MANIFEST = path.join(__dirname, '..', 'data', 'library.json');

// Audio formats ffmpeg (and therefore DisTube) can decode. Reject anything
// else at upload time so we don't store junk or executables.
const ALLOWED_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.opus', '.webm', '.aac']);
// No song-count limit — upload as many as you want. (Infinity means the
// count guard below never trips; the only real ceiling is your disk space.)
const MAX_SONGS = Infinity;
// Per-file cap. Raised to 500 MB so lossless FLAC / long DJ mixes / full
// albums-as-one-file all fit. Note: the upload buffers in memory, so very
// large files briefly use that much RAM during the upload itself.
const MAX_BYTES = 500 * 1024 * 1024;  // 500 MB per file

let state = { songs: [] };

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    state = (parsed && typeof parsed === 'object') ? parsed : { songs: [] };
    if (!Array.isArray(state.songs)) state.songs = [];
  } catch (e) {
    state = { songs: [] };
    if (e.code !== 'ENOENT') console.warn('[library] load failed:', e.message);
  }
};

const save = () => {
  try {
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    const tmp = `${MANIFEST}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, MANIFEST);
  } catch (e) { console.warn('[library] save failed:', e.message); }
};

// Strip path separators + unsafe chars; cap length. Used for the on-disk
// filename so a malicious X-Filename header can't traverse directories.
const sanitizeFilename = (name) =>
  String(name || 'song')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'song';

const isAllowedExt = (filename) => ALLOWED_EXT.has(path.extname(String(filename)).toLowerCase());

// Save a freshly-uploaded buffer. Returns the manifest entry or throws.
const add = (originalName, buffer) => {
  if (!isAllowedExt(originalName)) {
    throw new Error(`Unsupported format. Allowed: ${[...ALLOWED_EXT].join(', ')}`);
  }
  if (!buffer || !buffer.length) throw new Error('Empty file.');
  if (buffer.length > MAX_BYTES) throw new Error(`File too large (max ${MAX_BYTES / 1024 / 1024} MB).`);
  load();
  // MAX_SONGS is Infinity (no cap) — this guard only fires if someone sets a
  // finite cap. Kept so the limit stays configurable.
  if (Number.isFinite(MAX_SONGS) && state.songs.length >= MAX_SONGS) {
    throw new Error(`Library full (max ${MAX_SONGS} songs).`);
  }

  fs.mkdirSync(LIB_DIR, { recursive: true });
  const ext = path.extname(originalName).toLowerCase();
  const base = sanitizeFilename(path.basename(originalName, path.extname(originalName)));
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const file = `${id}-${base}${ext}`;
  fs.writeFileSync(path.join(LIB_DIR, file), buffer);

  const entry = {
    id,
    file,
    name: base.replace(/_/g, ' '),  // friendly display name
    ext: ext.slice(1),
    size: buffer.length,
    durationSec: null,  // filled in asynchronously by probeAndStore()
    addedAt: Date.now(),
  };
  state.songs.unshift(entry);
  save();
  return entry;
};

// Probe a file's duration (seconds) by running ffmpeg with no output — it
// prints "Duration: HH:MM:SS.ss" to stderr and exits. Resolves null if it
// can't be determined. ~50-200ms for a local file.
const probeDuration = (filePath) => new Promise((resolve) => {
  if (!ffmpegPath) return resolve(null);
  execFile(ffmpegPath, ['-i', filePath], { timeout: 15000 }, (_err, _stdout, stderr) => {
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr || '');
    if (!m) return resolve(null);
    resolve(Math.round((+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])));
  });
});

// Persist a probed duration onto a manifest entry.
const setDuration = (id, durationSec) => {
  load();
  const entry = state.songs.find((s) => s.id === id);
  if (!entry) return;
  entry.durationSec = durationSec;
  save();
};

// Convenience: add() then probe + store duration in the background. Returns
// the entry immediately (duration fills in shortly after).
const probeAndStore = async (id, filePath) => {
  try {
    const sec = await probeDuration(filePath);
    if (sec) setDuration(id, sec);
  } catch { /* duration stays null */ }
};

// One-shot backfill for songs uploaded before duration probing existed (or
// whose probe failed). Runs serially in the background so it doesn't spawn a
// hundred ffmpeg processes at once. Call once on startup.
const backfillDurations = async () => {
  load();
  const pending = state.songs.filter((s) => s.durationSec == null);
  for (const s of pending) {
    const full = path.join(LIB_DIR, s.file);
    if (!fs.existsSync(full)) continue;
    try {
      const sec = await probeDuration(full);
      if (sec) setDuration(s.id, sec);
    } catch { /* skip */ }
  }
  return pending.length;
};

const list = () => {
  load();
  return state.songs.slice();
};

const get = (id) => {
  load();
  return state.songs.find((s) => s.id === id) || null;
};

// Absolute path on disk — what we hand to DisTube.play(). Returns null if the
// manifest entry is missing OR the file vanished from disk.
const getPath = (id) => {
  const entry = get(id);
  if (!entry) return null;
  const full = path.join(LIB_DIR, entry.file);
  return fs.existsSync(full) ? full : null;
};

const remove = (id) => {
  load();
  const entry = state.songs.find((s) => s.id === id);
  if (!entry) return false;
  try { fs.unlinkSync(path.join(LIB_DIR, entry.file)); } catch { /* already gone */ }
  state.songs = state.songs.filter((s) => s.id !== id);
  save();
  return true;
};

// Rename the display name (not the file on disk).
const rename = (id, newName) => {
  load();
  const entry = state.songs.find((s) => s.id === id);
  if (!entry) return false;
  entry.name = String(newName || '').slice(0, 120) || entry.name;
  save();
  return true;
};

load();

module.exports = {
  add, list, get, getPath, remove, rename, isAllowedExt,
  probeDuration, setDuration, probeAndStore, backfillDurations,
  LIB_DIR, MAX_BYTES, MAX_SONGS, ALLOWED_EXT,
};
