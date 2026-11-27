// Local YouTube audio stream for ffmpeg.
//
// YouTube now answers "403 Forbidden" when ffmpeg opens a stream URL directly
// (ffmpeg then exits with code 3436169992 = AVERROR_HTTP_FORBIDDEN). yt-dlp's
// own downloader still works, so instead of handing ffmpeg YouTube's URL we
// hand it http://127.0.0.1:<port>/yt-stream?..., where the control server
// runs yt-dlp and pipes the audio straight through.
//
// Only reachable from this PC, with a random per-run key, and only for
// YouTube links, so it can't be used as a general proxy.
const crypto = require('node:crypto');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const KEY = crypto.randomBytes(16).toString('hex');
const FORMAT = 'bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/ba*';
const MAX_ACTIVE = 8;
const YT = /^https?:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//i;
let active = 0;

const isYouTube = (url) => YT.test(String(url || ''));
const urlFor = (port, videoUrl) => `http://127.0.0.1:${port}/yt-stream?k=${KEY}&u=${encodeURIComponent(videoUrl)}`;
const isLoopback = (req) => /^(127\.|::1$|::ffff:127\.)/.test(req.socket?.remoteAddress || '');

let spawnImpl = (bin, args) => spawn(bin, args, { windowsHide: true });
const spawnYtDlp = (target) => {
  const bin = require('./library').YTDLP_PATH;
  const args = [...require('./yt-cookies').ytdlpArgs(), '--no-warnings', '--quiet', '--no-part', '--no-playlist',
    '-f', FORMAT, '-o', '-', target];
  const proc = spawnImpl(bin, args);
  keepCopy(proc, videoId(target));
  return proc;
};

// ===== A copy for the library (lib/auto-save.js) =====
// The same bytes ffmpeg gets are written to a file; a complete download
// (exit 0) is handed to auto-save, anything else is thrown away.
let saveHooks = null;   // { tempPathFor(id), downloaded(id, file), have(id) }
const setSaveHooks = (h) => { saveHooks = h; };
const keepCopy = (proc, id) => {
  let tmp = null;
  try { tmp = id && saveHooks ? saveHooks.tempPathFor(id) : null; } catch { tmp = null; }
  if (!tmp) return;
  let ws;
  try { ws = fs.createWriteStream(tmp); } catch { return; }
  let failed = false;
  const drop = () => { failed = true; ws.destroy(); fs.rm(tmp, { force: true }, () => {}); };
  ws.on('error', () => { if (!failed) drop(); });
  proc.stdout.on('data', (d) => { if (!failed) ws.write(d); });
  proc.on('close', (code) => {
    if (failed) return;
    if (code !== 0) return drop();
    ws.end(() => { try { saveHooks?.downloaded(id, tmp); } catch { /* auto-save logs its own problems */ } });
  });
};

// The 11-character video ID, so youtu.be/X, watch?v=X&t=30 and
// music.youtube.com/watch?v=X all count as the same song. null for a link
// without one (a playlist-only link, a channel).
const videoId = (url) => {
  try {
    const u = new URL(String(url));
    if (!isYouTube(u.href)) return null;
    const id = /youtu\.be$/i.test(u.hostname) ? u.pathname.slice(1).split('/')[0]
      : u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/) || [])[1];
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
};

// ===== Prefetch: start a song's download before ffmpeg asks for it =====
// yt-dlp needs ~3 s before the first audio byte. We start it early (the next
// song when one starts, the first song as soon as it is requested) and keep up
// to 8 MB of its audio in memory. When ffmpeg asks, it gets that buffer, or,
// if the download is still starting, waits for the same download instead of
// starting a second one.
const PREFETCH_MAX_BYTES = 8 * 1024 * 1024;
const PREFETCH_TTL_MS = 15 * 60 * 1000;
const PREFETCH_MAX = 3;
const prefetched = new Map();   // videoId -> { proc, chunks, bytes, ended, at, err, taken }

const dropPrefetch = (url) => {
  const id = videoId(url) || url;
  const p = prefetched.get(id);
  if (!p) return;
  prefetched.delete(id);
  if (!p.taken && p.proc.exitCode === null) { try { p.proc.kill(); } catch { /* gone */ } }
};

const prefetch = (videoUrl) => {
  const id = videoId(videoUrl);
  if (!id || prefetched.has(id)) return false;
  try { if (saveHooks?.have(id)) return false; } catch { /* */ }   // plays from the library copy
  for (const [k, p] of prefetched) if (Date.now() - p.at > PREFETCH_TTL_MS) dropPrefetch(k);
  if (prefetched.size >= PREFETCH_MAX) dropPrefetch(prefetched.keys().next().value);   // only the next song or two
  const proc = spawnYtDlp(videoUrl);
  const p = { proc, chunks: [], bytes: 0, ended: false, at: Date.now(), err: '', taken: false };
  prefetched.set(id, p);
  proc.stdout.on('data', (d) => {
    if (p.taken) return;
    p.chunks.push(d); p.bytes += d.length;
    if (p.bytes >= PREFETCH_MAX_BYTES) proc.stdout.pause();   // wait for ffmpeg
  });
  proc.stderr.on('data', (d) => { p.err = (p.err + d).slice(-2000); });
  proc.on('error', (e) => { p.err += e.message; });
  proc.on('close', (code) => { p.ended = true; p.code = code; if (!p.bytes && prefetched.get(id) === p) prefetched.delete(id); });
  return true;
};

setInterval(() => { for (const [k, p] of prefetched) if (Date.now() - p.at > PREFETCH_TTL_MS) dropPrefetch(k); }, 60000).unref?.();

const handle = (req, res, url, { log } = {}) => {
  const target = url.searchParams.get('u') || '';
  if (url.searchParams.get('k') !== KEY || !isLoopback(req) || !isYouTube(target)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  // Use the early download if there is one (ready or still starting),
  // otherwise start one now.
  const id = videoId(target);
  const pre = id ? prefetched.get(id) : null;
  let proc; let buffered = []; let errText = ''; let alreadyEnded = false;
  if (pre && !pre.taken) {
    prefetched.delete(id);
    pre.taken = true;
    proc = pre.proc;
    buffered = pre.chunks; pre.chunks = [];
    errText = pre.err;
    alreadyEnded = pre.ended;   // the whole song fit in the buffer
  } else {
    if (active >= MAX_ACTIVE) { res.writeHead(503).end('Busy'); return; }
    proc = spawnYtDlp(target);
  }
  active++;
  let started = false; let done = false;
  const finish = () => { if (!done) { done = true; active--; } };
  const begin = (chunks) => {
    started = true;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    for (const c of chunks) res.write(c);
    if (alreadyEnded) { res.end(); finish(); return; }
    proc.stdout.resume();
    proc.stdout.pipe(res);
  };

  // Wait for the first bytes before answering, so a failure becomes a clear
  // HTTP error for ffmpeg instead of an empty "successful" stream.
  if (buffered.length) begin(buffered);
  else proc.stdout.once('data', (first) => begin([first]));
  proc.stderr.on('data', (d) => { errText = (errText + d).slice(-2000); });
  proc.on('error', (e) => { errText += e.message; });
  const onClose = (code) => {
    finish();
    if (!started) {
      const line = errText.split('\n').reverse().find((l) => /ERROR/.test(l)) || errText.trim().split('\n').pop() || `yt-dlp exited ${code}`;
      // rate limit: say so plainly (the ffmpeg "exited with code 8" that follows is only the result)
      const hint = /rate-limited|Too Many Requests|HTTP Error 429/i.test(line)
        ? ' → YouTube rate-limited this server for up to an hour (too many requests). Wait; retrying makes it longer.'
        : '';
      log?.(`✕ YouTube stream failed: ${line.slice(0, 200)}${hint}`, 'error');
      if (hint) {
        try {
          require('./health-alerts').alert('ratelimit', 'YouTube rate-limited the server',
            'YouTube songs fail to play for up to an hour (too many requests from this server). Waiting it out is the fix; retrying makes it longer.',
            { color: 0xf59e0b, icon: '⏸' });
        } catch { /* */ }
      }
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' }).end(line.slice(0, 300));
    } else if (!res.writableEnded) res.end();
  };
  if (!alreadyEnded) proc.on('close', onClose);
  // ffmpeg stopped reading (skip/stop/seek): stop downloading.
  res.on('close', () => { if (proc.exitCode === null) { try { proc.kill(); } catch { /* gone */ } } finish(); });
};

module.exports = {
  handle, urlFor, isYouTube, videoId, prefetch, dropPrefetch, prefetchedCount: () => prefetched.size,
  FORMAT, KEY_LENGTH: KEY.length, activeCount: () => active,
  setSaveHooks,
  _setSpawn: (fn) => { spawnImpl = fn; },   // tests: a fake yt-dlp
};
