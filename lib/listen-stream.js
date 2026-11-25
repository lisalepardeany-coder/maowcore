// Listen room audio: streams what the bot is playing to a browser, as MP3,
// starting where the bot is right now. One ffmpeg per listener, stopped as
// soon as the browser stops listening.
//
//   uploaded library song  → read straight from disk
//   anything else          → yt-dlp finds the audio address (with cookies),
//                             cached for a while, ffmpeg fetches and converts it
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');

const MAX_LISTENERS = 25;
const URL_TTL_MS = 60 * 60 * 1000;        // YouTube audio addresses last a few hours
let listeners = 0;
const urlCache = new Map();                // page url → { url, at }

const ffmpegBin = () => process.env.FFMPEG_PATH || (() => { try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; } })();

// The song DisTube is really playing: Spotify etc. are played through a YouTube match.
const playedSong = (song) => (song?.stream && !song.stream.playFromSource && song.stream.song) ? song.stream.song : song;

const resolveRemote = (pageUrl) => new Promise((resolve, reject) => {
  const hit = urlCache.get(pageUrl);
  if (hit && Date.now() - hit.at < URL_TTL_MS) return resolve(hit.url);
  const library = require('./library');
  let cookieArgs = [];
  try { cookieArgs = require('./yt-cookies').ytdlpArgs(); } catch { /* no cookies */ }
  execFile(library.YTDLP_PATH, ['--no-warnings', '--no-playlist', '-f', 'bestaudio/best', '-g', ...cookieArgs, pageUrl],
    { timeout: 45000, windowsHide: true }, (err, stdout, stderr) => {
      const url = String(stdout || '').trim().split('\n').find((l) => /^https?:\/\//.test(l));
      if (err || !url) return reject(new Error(String(stderr || err?.message || 'No audio found').split('\n').find((l) => /ERROR/.test(l)) || 'Couldn\'t get the audio for this song.'));
      urlCache.set(pageUrl, { url, at: Date.now() });
      if (urlCache.size > 200) urlCache.delete(urlCache.keys().next().value);
      resolve(url);
    });
});

// Where ffmpeg reads the song from. Local file, the bot's own sound/ambience
// address, or the remote audio address.
const inputFor = async (song) => {
  const library = require('./library');
  const s = playedSong(song);
  const file = library.fileOfUrl(s?.url);
  if (file) {
    const full = path.join(library.LIB_DIR, file);
    if (!fs.existsSync(full)) throw new Error('This song was deleted from the library.');
    return { input: full, remote: false };
  }
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(s?.url || '')) return { input: s.url, remote: true };
  if (!s?.url) throw new Error('Nothing to stream.');
  return { input: await resolveRemote(s.url), remote: true };
};

const ffmpegArgs = ({ input, remote }, at) => [
  '-hide_banner', '-loglevel', 'error', '-nostdin',
  ...(remote ? ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'] : []),
  // Only seek for a whole second or more: "-ss 0" made ffmpeg give up on
  // servers that can't jump ahead, leaving the browser almost silent.
  ...(Math.floor(at) >= 1 ? ['-ss', String(Math.floor(at))] : []),
  '-i', input,
  '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1',
];

// Streams `song` from `at` seconds into the response.
const stream = async (req, res, { song, at = 0, onError } = {}) => {
  if (listeners >= MAX_LISTENERS) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Too many people are listening in the browser right now.' }));
  }
  let src;
  try { src = await inputFor(song); } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: e.message }));
  }
  if (req.destroyed) return undefined;
  listeners++;
  const ff = spawn(ffmpegBin(), ffmpegArgs(src, at), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let errText = '';
  ff.stderr.on('data', (d) => { errText = (errText + d).slice(-500); });
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  ff.stdout.pipe(res);
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    listeners--;
    try { ff.kill('SIGKILL'); } catch { /* already gone */ }
  };
  req.on('close', stop);
  res.on('close', stop);
  ff.on('close', (code) => {
    if (code && !done && errText) onError?.(errText.trim().split('\n').pop());
    stop();
    try { res.end(); } catch { /* closed */ }
  });
  ff.on('error', (e) => { onError?.(e.message); stop(); try { res.end(); } catch { /* closed */ } });
  return undefined;
};

module.exports = { stream, ffmpegArgs, playedSong, inputFor, MAX_LISTENERS, _count: () => listeners };
