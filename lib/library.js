// Local song library — user-uploaded audio files the bot can play instantly.
// Files live in data/library/; a JSON manifest tracks display names + metadata.
// The bot streams them over the control server's HTTP endpoint (yt-dlp can't
// resolve a local file path), so duration is probed here at upload time —
// yt-dlp can't determine length from the HTTP stream alone.
const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const ffmpegPath = process.env.FFMPEG_PATH || require('ffmpeg-static');

// Library root is env-configurable so you can put songs on a big disk or a
// different mount (LIBRARY_DIR=/mnt/music or a Docker bind mount). The
// manifest lives INSIDE the library dir so moving the folder is portable.
const LIB_DIR = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'data', 'library');
const MANIFEST = path.join(LIB_DIR, '_manifest.json');
// Legacy manifest location (pre-1.4.0) — migrated on first load if present.
const LEGACY_MANIFEST = path.join(__dirname, '..', 'data', 'library.json');

// yt-dlp binary — derived the same way @distube/yt-dlp resolves it so a single
// YTDLP_DIR/YTDLP_FILENAME env override (set in Docker) covers both the bot's
// stream resolver AND the installer here.
const ytDlpDir = process.env.YTDLP_DIR
  || path.join(__dirname, '..', 'node_modules', '@distube', 'yt-dlp', 'bin');
const ytDlpFilename = process.env.YTDLP_FILENAME
  || (process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const YTDLP_PATH = path.join(ytDlpDir, ytDlpFilename);

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
    return;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[library] load failed:', e.message);
  }
  // Migrate the legacy pre-1.4.0 manifest location (data/library.json) into
  // the in-dir _manifest.json so the library is self-contained going forward.
  try {
    const parsed = JSON.parse(fs.readFileSync(LEGACY_MANIFEST, 'utf8'));
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.songs)) {
      state = parsed;
      save();
      console.log('[library] migrated legacy manifest →', MANIFEST);
      return;
    }
  } catch { /* no legacy either */ }
  state = { songs: [] };
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

// Friendly display name from the ORIGINAL filename — preserves spaces, parens,
// etc. (the on-disk `file` is separately sanitized for safety). Trimmed + capped.
const displayName = (originalName) =>
  String(path.basename(originalName, path.extname(originalName)) || 'song').trim().slice(0, 120) || 'song';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Save a freshly-uploaded buffer. Returns the manifest entry or throws.
// (Used by the slash-command path + tests; the dashboard upload streams to
// disk via createUploadTarget/commitUpload to avoid buffering in memory.)
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
  const id = newId();
  const file = `${id}-${base}${ext}`;
  fs.writeFileSync(path.join(LIB_DIR, file), buffer);

  const entry = {
    id,
    file,
    name: displayName(originalName),
    ext: ext.slice(1),
    size: buffer.length,
    durationSec: null,  // filled in asynchronously by probeAndStore()
    addedAt: Date.now(),
  };
  state.songs.unshift(entry);
  save();
  return entry;
};

// Stream-friendly upload, step 1: validate + reserve a destination path. The
// caller streams bytes into `fullPath`, then calls commitUpload(). This avoids
// reading the whole (up to 500 MB) file into memory.
const createUploadTarget = (originalName) => {
  if (!isAllowedExt(originalName)) {
    throw new Error(`Unsupported format. Allowed: ${[...ALLOWED_EXT].join(', ')}`);
  }
  fs.mkdirSync(LIB_DIR, { recursive: true });
  const ext = path.extname(originalName).toLowerCase();
  const base = sanitizeFilename(path.basename(originalName, ext));
  const id = newId();
  const file = `${id}-${base}${ext}`;
  return {
    id, file,
    fullPath: path.join(LIB_DIR, file),
    name: displayName(originalName),
    ext: ext.slice(1),
  };
};

// Step 2: register a fully-written upload target in the manifest.
const commitUpload = (target, size) => {
  load();
  const entry = {
    id: target.id,
    file: target.file,
    name: target.name,
    ext: target.ext,
    size,
    durationSec: null,
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
  // maxBuffer 10MB so verbose ffmpeg stderr (many streams/metadata) isn't
  // truncated before the "Duration:" line.
  execFile(ffmpegPath, ['-i', filePath], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, (_err, _stdout, stderr) => {
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

// ===== Install from URL =====
// Available output formats. "original" preserves the source codec (smallest
// honest option); the rest re-encode via yt-dlp's --extract-audio postprocessor.
// lossless: true means the CONTAINER is lossless (FLAC/WAV) — but if the
// SOURCE was lossy (YouTube etc.), the audio inside is still lossy. We flag
// that on the manifest entry so the dashboard can show "lossy-in-flac".
const INSTALL_FORMATS = {
  original: { ext: null, postprocess: false,                     lossless: false, label: 'Original (no re-encode)' },
  mp3:      { ext: 'mp3',  postprocess: ['mp3', '0'],            lossless: false, label: 'MP3 320 kbps' },
  opus:     { ext: 'opus', postprocess: ['opus', '0'],           lossless: false, label: 'Opus 256 kbps' },
  flac:     { ext: 'flac', postprocess: ['flac', '0'],           lossless: true,  label: 'FLAC' },
  wav:      { ext: 'wav',  postprocess: ['wav', '0'],            lossless: true,  label: 'WAV (PCM)' },
};

const findBySourceUrl = (url) => {
  load();
  return state.songs.find((s) => s.sourceUrl === url) || null;
};

// Run yt-dlp with the given args, returning stdout. Streams stderr to the
// `onProgress` callback (one line at a time) for live UI feedback.
//
// Also returns a `kill()` function on the promise for cancellation — the
// playlist worker uses this to abort in-flight downloads when the user clicks
// "Cancel all".
const runYtDlp = (args, { onProgress, timeout = 600000, signal } = {}) => {
  let killProc = () => {};
  const promise = new Promise((resolve, reject) => {
    if (!fs.existsSync(YTDLP_PATH)) return reject(new Error(`yt-dlp binary not found at ${YTDLP_PATH}`));
    const proc = spawn(YTDLP_PATH, args, { timeout });
    killProc = () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } };
    if (signal) {
      if (signal.aborted) return killProc();
      signal.addEventListener('abort', killProc, { once: true });
    }
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      if (onProgress) s.split('\n').forEach((line) => { if (line.trim()) onProgress(line); });
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (signal?.aborted) reject(new Error('Cancelled'));
      else if (code === 0) resolve(stdout);
      else reject(new Error(`yt-dlp exited ${code}: ${stderr.split('\n').slice(-5).join(' ').slice(0, 400)}`));
    });
  });
  promise.kill = () => killProc();
  return promise;
};

// Install a song from a URL (YouTube, SoundCloud, Bandcamp — anything yt-dlp
// supports). Downloads + optionally re-encodes to LIB_DIR, registers in the
// manifest with rich metadata. Returns the manifest entry or throws.
//
// opts:
//   format     — INSTALL_FORMATS key (defaults to 'original')
//   onProgress — line-by-line yt-dlp stderr callback
//   limitRate  — yt-dlp `--limit-rate` arg (e.g. '10M', '500K'); omit for unlimited
//   signal     — AbortSignal for cancellation
//   playlist   — optional { id, name, index } to attach to the manifest entry
const installFromUrl = async (url, opts = {}) => {
  const format = INSTALL_FORMATS[opts.format] ? opts.format : 'original';
  const fmtSpec = INSTALL_FORMATS[format];
  const onProgress = opts.onProgress || (() => {});
  const limitRate = opts.limitRate || null;
  const signal = opts.signal || null;

  // Duplicate guard — installing the same source twice is a no-op.
  const existing = findBySourceUrl(url);
  if (existing) {
    onProgress(`Already installed: ${existing.name}`);
    return { entry: existing, alreadyInstalled: true };
  }

  // Step 1 — probe metadata so we know the real title before downloading.
  onProgress('Fetching info…');
  const infoJson = await runYtDlp(['--dump-single-json', '--no-warnings',
    '--no-playlist', '--skip-download', url], { onProgress, signal });
  let info;
  try { info = JSON.parse(infoJson); } catch { throw new Error('yt-dlp returned invalid JSON'); }
  if (!info?.title) throw new Error('No title in extracted metadata.');

  fs.mkdirSync(LIB_DIR, { recursive: true });
  const id = newId();
  const base = sanitizeFilename(String(info.title));
  // We don't know the real extension until yt-dlp picks the format, so use a
  // placeholder template with %(ext)s. yt-dlp fills it in.
  const outTemplate = path.join(LIB_DIR, `${id}-${base}.%(ext)s`);

  onProgress('Downloading…');
  const args = ['--no-warnings', '--no-playlist',
    '-o', outTemplate, '--no-progress', '--newline'];
  if (limitRate) args.push('--limit-rate', limitRate);
  if (fmtSpec.postprocess) {
    args.push('-x', '--audio-format', fmtSpec.postprocess[0], '--audio-quality', fmtSpec.postprocess[1]);
    if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);
  } else {
    args.push('-f', 'bestaudio/best');
  }
  args.push('--print', 'after_move:filepath');
  args.push(url);
  const stdout = await runYtDlp(args, { onProgress, signal });

  // yt-dlp printed the final file path on stdout (--print after_move:filepath).
  const finalPath = stdout.trim().split('\n').filter(Boolean).pop();
  if (!finalPath || !fs.existsSync(finalPath)) {
    throw new Error('yt-dlp did not produce an output file.');
  }
  const stat = fs.statSync(finalPath);
  const ext = path.extname(finalPath).slice(1).toLowerCase();
  if (!ALLOWED_EXT.has('.' + ext)) {
    try { fs.unlinkSync(finalPath); } catch { /* ignore */ }
    throw new Error(`Resulting format .${ext} not supported.`);
  }

  // Was the source already lossless? yt-dlp reports acodec/abr.
  const sourceLossy = !/flac|wav|alac/i.test(String(info.acodec || ''));
  const losslessInLossyContainer = fmtSpec.lossless && sourceLossy;

  const entry = {
    id,
    file: path.basename(finalPath),
    name: String(info.title).slice(0, 200),
    ext,
    size: stat.size,
    durationSec: info.duration ? Math.round(info.duration) : null,
    addedAt: Date.now(),
    // Rich metadata for installed songs
    source: 'install',
    sourceUrl: url,
    sourceExtractor: info.extractor_key || info.extractor || null,
    uploader: info.uploader || info.channel || null,
    sourceAcodec: info.acodec || null,
    sourceAbr: info.abr || null,
    format,
    losslessContainer: !!fmtSpec.lossless,
    losslessInLossyContainer,  // FLAC/WAV wrapping lossy source — UI flags it
    // Playlist-install metadata so the UI can group/filter by playlist later.
    ...(opts.playlist ? {
      playlistId: opts.playlist.id || null,
      playlistName: opts.playlist.name || null,
      playlistIndex: opts.playlist.index != null ? opts.playlist.index : null,
    } : {}),
  };
  load();
  state.songs.unshift(entry);
  save();
  return { entry, alreadyInstalled: false };
};

load();

// =============================================================================
// Download config — persisted to <LIB_DIR>/_config.json so it travels with the
// library when the operator moves LIBRARY_DIR to another disk.
// =============================================================================

const CONFIG_PATH = path.join(LIB_DIR, '_config.json');
const DEFAULT_CONFIG = {
  concurrency: 5,      // parallel yt-dlp processes during playlist install
  limitRate: null,     // per-stream rate cap, e.g. '10M' (10 MB/s); null = unlimited
};
const VALID_RATES = new Set([null, '500K', '1M', '5M', '10M', '50M', '100M']);

// Clamp concurrency: invalid/non-numeric → default; finite → clamped to [1, 50].
// (Distinct from `|| default` which would also coerce a valid 0 to the default.)
const clampConcurrency = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_CONFIG.concurrency;
  return Math.max(1, Math.min(50, Math.floor(n)));
};

const loadConfig = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      concurrency: clampConcurrency(raw.concurrency),
      limitRate: raw.limitRate === null || raw.limitRate === undefined
        ? null
        : (VALID_RATES.has(raw.limitRate) ? raw.limitRate : null),
    };
  } catch { return { ...DEFAULT_CONFIG }; }
};

const saveConfig = (cfg) => {
  try {
    fs.mkdirSync(LIB_DIR, { recursive: true });
    const next = {
      concurrency: clampConcurrency(cfg.concurrency),
      limitRate: cfg.limitRate === null || cfg.limitRate === undefined ? null
        : (VALID_RATES.has(cfg.limitRate) ? cfg.limitRate : null),
    };
    // Atomic: .tmp + rename so a crash mid-write doesn't corrupt the config
    // (which would prevent the bot from starting next time).
    const tmp = `${CONFIG_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, CONFIG_PATH);
    return next;
  } catch (e) { throw new Error(`Could not save config: ${e.message}`); }
};

// =============================================================================
// Playlist install — probe entries via yt-dlp --flat-playlist, then download
// in a configurable promise-pool (concurrency + per-stream rate limit).
// =============================================================================

// Returns playlist metadata + flat list of entries without downloading anything.
// Use this to show the operator "N songs detected" before committing.
const probePlaylist = async (url, opts = {}) => {
  const onProgress = opts.onProgress || (() => {});
  onProgress('Probing playlist…');
  const out = await runYtDlp(
    ['--flat-playlist', '--dump-single-json', '--no-warnings', url],
    { onProgress, signal: opts.signal },
  );
  let info;
  try { info = JSON.parse(out); } catch { throw new Error('yt-dlp returned invalid playlist JSON'); }
  // yt-dlp returns { _type: 'playlist', title, entries: [{ id, title, url, ... }] }
  // For single-video URLs there's no entries[] — treat as a 1-item "playlist".
  if (!info?.entries || !Array.isArray(info.entries)) {
    if (info?.title && info?.url) {
      return {
        playlistId: info.id || null,
        playlistName: info.title,
        entries: [{ url: info.webpage_url || url, title: info.title }],
      };
    }
    throw new Error('Not a playlist (no entries returned).');
  }
  const entries = info.entries
    .filter((e) => e && (e.url || e.webpage_url))
    .map((e) => ({
      url: e.url || e.webpage_url,
      title: e.title || e.id || 'untitled',
    }));
  if (!entries.length) throw new Error('Playlist is empty.');
  return {
    playlistId: info.id || null,
    playlistName: info.title || 'Untitled playlist',
    entries,
  };
};

// Install every entry in a playlist with a promise-pool. opts.onItem fires for
// each entry start/finish/fail so the caller can stream progress to the UI.
// opts.signal aborts the whole job (current downloads are killed).
const installPlaylistFromUrl = async (url, opts = {}) => {
  const cfg = loadConfig();
  const concurrency = Math.max(1, Math.min(50, Number(opts.concurrency) || cfg.concurrency));
  const limitRate = opts.limitRate !== undefined ? opts.limitRate : cfg.limitRate;
  const format = opts.format || 'original';
  const onProgress = opts.onProgress || (() => {});
  const onItem = opts.onItem || (() => {});
  const signal = opts.signal || null;

  const meta = await probePlaylist(url, { onProgress, signal });
  onProgress(`Playlist: "${meta.playlistName}" — ${meta.entries.length} entries`);

  const results = { installed: [], skipped: [], failed: [] };

  // Promise-pool: keep `concurrency` workers running, each pulling from `queue`.
  let cursor = 0;
  const queue = meta.entries.map((e, i) => ({ ...e, index: i }));

  const worker = async (workerId) => {
    while (cursor < queue.length) {
      if (signal?.aborted) return;
      const item = queue[cursor++];
      const startedAt = Date.now();
      onItem({ phase: 'start', index: item.index, title: item.title, url: item.url });
      try {
        const { entry, alreadyInstalled } = await installFromUrl(item.url, {
          format,
          limitRate,
          signal,
          // Per-line progress only logs to global onProgress so we don't blow
          // up the UI with N×every line. The UI tracks worker state via onItem.
          onProgress: () => {},
          playlist: { id: meta.playlistId, name: meta.playlistName, index: item.index },
        });
        const bucket = alreadyInstalled ? results.skipped : results.installed;
        bucket.push(entry);
        onItem({
          phase: alreadyInstalled ? 'skip' : 'done',
          index: item.index, title: entry.name, entry,
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        if (signal?.aborted) return;
        results.failed.push({ url: item.url, title: item.title, error: err.message });
        onItem({ phase: 'fail', index: item.index, title: item.title, error: err.message });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));

  if (signal?.aborted) {
    return { playlistName: meta.playlistName, ...results, cancelled: true };
  }
  return { playlistName: meta.playlistName, ...results, cancelled: false };
};

module.exports = {
  add, createUploadTarget, commitUpload,
  installFromUrl, findBySourceUrl, INSTALL_FORMATS,
  installPlaylistFromUrl, probePlaylist,
  loadConfig, saveConfig,
  list, get, getPath, remove, rename, isAllowedExt,
  probeDuration, setDuration, probeAndStore, backfillDurations,
  LIB_DIR, CONFIG_PATH, MAX_BYTES, MAX_SONGS, ALLOWED_EXT, YTDLP_PATH,
};
