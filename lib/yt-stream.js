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
const { spawn } = require('node:child_process');

const KEY = crypto.randomBytes(16).toString('hex');
const FORMAT = 'bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/ba*';
const MAX_ACTIVE = 8;
const YT = /^https?:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//i;
let active = 0;

const isYouTube = (url) => YT.test(String(url || ''));
const urlFor = (port, videoUrl) => `http://127.0.0.1:${port}/yt-stream?k=${KEY}&u=${encodeURIComponent(videoUrl)}`;
const isLoopback = (req) => /^(127\.|::1$|::ffff:127\.)/.test(req.socket?.remoteAddress || '');

const spawnYtDlp = (target) => {
  const bin = require('./library').YTDLP_PATH;
  const args = [...require('./yt-cookies').ytdlpArgs(), '--no-warnings', '--quiet', '--no-part', '--no-playlist',
    '-f', FORMAT, '-o', '-', target];
  return spawn(bin, args, { windowsHide: true });
};

// ===== Prefetch: start the NEXT song early =====
// yt-dlp needs ~4 s before the first audio byte. When a song starts, we start
// the next one in the background and keep up to 8 MB of its audio in memory;
// when ffmpeg asks for it, it gets that buffer immediately.
const PREFETCH_MAX_BYTES = 8 * 1024 * 1024;
const PREFETCH_TTL_MS = 15 * 60 * 1000;
const prefetched = new Map();   // url -> { proc, chunks, bytes, ended, at, err }

const dropPrefetch = (url) => {
  const p = prefetched.get(url);
  if (!p) return;
  prefetched.delete(url);
  if (!p.taken && p.proc.exitCode === null) { try { p.proc.kill(); } catch { /* gone */ } }
};

const prefetch = (videoUrl) => {
  if (!isYouTube(videoUrl) || prefetched.has(videoUrl)) return false;
  for (const [u, p] of prefetched) if (Date.now() - p.at > PREFETCH_TTL_MS) dropPrefetch(u);
  if (prefetched.size >= 2) dropPrefetch(prefetched.keys().next().value);   // only the next song or two
  const proc = spawnYtDlp(videoUrl);
  const p = { proc, chunks: [], bytes: 0, ended: false, at: Date.now(), err: '', taken: false };
  prefetched.set(videoUrl, p);
  proc.stdout.on('data', (d) => {
    if (p.taken) return;
    p.chunks.push(d); p.bytes += d.length;
    if (p.bytes >= PREFETCH_MAX_BYTES) proc.stdout.pause();   // wait for ffmpeg
  });
  proc.stderr.on('data', (d) => { p.err = (p.err + d).slice(-1000); });
  proc.on('close', () => { p.ended = true; if (!p.bytes) prefetched.delete(videoUrl); });
  return true;
};

setInterval(() => { for (const [u, p] of prefetched) if (Date.now() - p.at > PREFETCH_TTL_MS) dropPrefetch(u); }, 60000).unref?.();

const handle = (req, res, url, { log } = {}) => {
  const target = url.searchParams.get('u') || '';
  if (url.searchParams.get('k') !== KEY || !isLoopback(req) || !isYouTube(target)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  // A prefetched copy is ready: hand over its buffer, then keep piping.
  const pre = prefetched.get(target);
  if (pre && !pre.taken && pre.bytes > 0) {
    prefetched.delete(target);
    pre.taken = true;
    active++;
    let done = false;
    const finish = () => { if (!done) { done = true; active--; } };
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    for (const c of pre.chunks) res.write(c);
    pre.chunks = [];
    if (pre.ended) { res.end(); finish(); } else {
      pre.proc.stdout.resume();
      pre.proc.stdout.pipe(res);
      pre.proc.on('close', () => { if (!res.writableEnded) res.end(); finish(); });
    }
    res.on('close', () => { if (pre.proc.exitCode === null) { try { pre.proc.kill(); } catch { /* gone */ } } finish(); });
    return;
  }
  if (pre) dropPrefetch(target);   // still warming up or failed: start fresh
  if (active >= MAX_ACTIVE) { res.writeHead(503).end('Busy'); return; }
  active++;
  const proc = spawnYtDlp(target);
  let started = false; let errText = ''; let done = false;
  const finish = () => { if (!done) { done = true; active--; } };

  // Wait for the first bytes before answering, so a failure becomes a clear
  // HTTP error for ffmpeg instead of an empty "successful" stream.
  proc.stdout.once('data', (first) => {
    started = true;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.write(first);
    proc.stdout.pipe(res);
  });
  proc.stderr.on('data', (d) => { errText = (errText + d).slice(-2000); });
  proc.on('error', (e) => { errText += e.message; });
  proc.on('close', (code) => {
    finish();
    if (!started) {
      const line = errText.split('\n').reverse().find((l) => /ERROR/.test(l)) || errText.trim().split('\n').pop() || `yt-dlp exited ${code}`;
      // rate limit: say so plainly (the ffmpeg "exited with code 8" that follows is only the result)
      const hint = /rate-limited|Too Many Requests|HTTP Error 429/i.test(line)
        ? ' → YouTube rate-limited this server for up to an hour (too many requests). Wait; retrying makes it longer.'
        : '';
      log?.(`✕ YouTube stream failed: ${line.slice(0, 200)}${hint}`, 'error');
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' }).end(line.slice(0, 300));
    } else if (!res.writableEnded) res.end();
  });
  // ffmpeg stopped reading (skip/stop/seek): stop downloading.
  res.on('close', () => { if (proc.exitCode === null) { try { proc.kill(); } catch { /* gone */ } } finish(); });
};

module.exports = { handle, urlFor, isYouTube, prefetch, dropPrefetch, prefetchedCount: () => prefetched.size, FORMAT, KEY_LENGTH: KEY.length, activeCount: () => active };
