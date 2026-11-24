// Server welcome sound before the first song of a music session.
//
// Fast path (normal): the welcome sound is downloaded once into
// data/welcome-cache/. When a queue is created (initQueue) a song pointing at
// that local file is put first and started right away, so it plays the moment
// the bot joins, while the requested song is still loading. DisTube waits for
// that song before moving on, so it follows straight after.
//
// Slow path (first time after the link changed, cache still downloading):
// the welcome sound is looked up online and put in front once the first song
// starts; that song then plays again from its start.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const CACHE_DIR = process.env.WELCOME_CACHE_DIR || path.join(__dirname, '..', 'data', 'welcome-cache');
const MAX_BYTES = 15 * 1024 * 1024;
const NAME = '👋 Welcome sound';

const keyOf = (url) => crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 16);
const ready = new Map();     // url → { file, duration }
const loading = new Map();   // url → Promise
const pending = new Map();   // queue → Promise<Song|null>   (slow path)
const started = new WeakSet(); // queues whose intro already started
const suppress = new Set();  // guildIds: the next queue is the welcome sound itself

// The cached file for `url`, if it's already downloaded.
const cached = (url) => {
  if (!url) return null;
  const hit = ready.get(url);
  if (hit && fs.existsSync(hit.file)) return hit;
  try {
    const key = keyOf(url);
    const name = fs.readdirSync(CACHE_DIR).find((f) => f.startsWith(`${key}.`) && !f.endsWith('.part') && !f.endsWith('.json'));
    if (!name) return null;
    let duration = 0;
    try { duration = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${key}.json`), 'utf8')).duration || 0; } catch { /* unknown */ }
    const meta = { file: path.join(CACHE_DIR, name), duration };
    ready.set(url, meta);
    return meta;
  } catch { return null; }
};

// Download the welcome sound once (in the background). Safe to call often.
const warm = (url, log = () => {}) => {
  if (!url || !/^https?:\/\//i.test(url)) return Promise.resolve(null);
  const have = cached(url);
  if (have) return Promise.resolve(have);
  if (loading.has(url)) return loading.get(url);
  const library = require('./library');
  const key = keyOf(url);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let cookieArgs = [];
  try { cookieArgs = require('./yt-cookies').ytdlpArgs(); } catch { /* none */ }
  const p = new Promise((resolve) => {
    execFile(library.YTDLP_PATH, ['--no-warnings', '--no-playlist', '-f', 'bestaudio/best', '--max-filesize', String(MAX_BYTES),
      ...cookieArgs, '-o', path.join(CACHE_DIR, `${key}.%(ext)s`), '--print', 'after_move:filepath', '--no-progress', url],
    { timeout: 120000, windowsHide: true }, async (err, stdout, stderr) => {
      const file = String(stdout || '').trim().split('\n').filter(Boolean).pop();
      if (err || !file || !fs.existsSync(file)) {
        log(`Welcome sound couldn't be downloaded: ${String(stderr || err?.message || '').split('\n').find((l) => /ERROR/.test(l)) || 'no file'}`);
        return resolve(null);
      }
      let duration = 0;
      try { duration = await library.probeDuration(file) || 0; } catch { /* unknown */ }
      try { fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify({ url, duration })); } catch { /* */ }
      const meta = { file, duration };
      ready.set(url, meta);
      resolve(meta);
    });
  }).finally(() => loading.delete(url));
  loading.set(url, p);
  return p;
};

// A DisTube song that plays the cached file directly: it already has its
// stream address, so DisTube looks nothing up before playing it.
const songFor = (url, meta) => {
  const { Song } = require('distube');
  const s = new Song({ source: 'welcome', playFromSource: true, id: `welcome-${keyOf(url)}`, name: NAME, url, duration: meta.duration },
    { metadata: { welcomeIntro: true, localName: NAME, durationSec: meta.duration } });
  s.stream.url = meta.file;
  return s;
};

// A new session. Cached: put the welcome sound first and start it now.
// Not cached yet: look it up for the slow path and download it for next time.
const prepare = (distube, queue, url, log = () => {}) => {
  if (!url) return;
  if (suppress.delete(queue.id)) return;            // this queue IS the welcome sound
  if (!justJoined(queue.id)) return;                // bot was already in voice: no welcome
  const meta = cached(url);
  if (meta && !queue.songs.length) {
    queue.songs.unshift(songFor(url, meta));
    started.add(queue);
    setImmediate(() => { Promise.resolve().then(() => queue.play()).catch((e) => log(`Welcome sound couldn't play: ${e.message}`)); });
    return;
  }
  warm(url, log);
  const p = distube.handler.resolve(url, { metadata: { welcomeIntro: true, localName: NAME } })
    .then((s) => (s && Array.isArray(s.songs) ? s.songs[0] || null : s))   // a playlist link: its first song
    .catch((e) => { log(`Welcome sound couldn't be loaded: ${e.message}`); return null; });
  pending.set(queue, p);
};

// Slow path, once per queue. True when it took over (the caller should then
// skip its own "now playing" work for `song`, which plays again next).
const maybeIntro = async (queue, song) => {
  const p = pending.get(queue);
  if (!p || started.has(queue)) return false;
  pending.delete(queue);
  if (song?.metadata?.welcomeIntro) return false;
  const intro = await p;
  if (!intro || !queue.songs?.length || queue.songs[0] !== song) return false;  // gone or moved on meanwhile
  queue.songs.splice(1, 0, intro, song);
  await queue.skip();
  return true;
};

// For an idle join (/join, 24/7): the welcome sound as the thing to play.
// Returns a ready song (cached) or the link, and makes sure prepare() doesn't
// add it a second time.
const forIdleJoin = (guildId, url) => {
  suppress.add(guildId);
  setTimeout(() => suppress.delete(guildId), 30000).unref?.();
  const meta = cached(url);
  return meta ? songFor(url, meta) : url;
};

// ---- Only when the bot just joined voice ----
// A queue also starts when the bot was already sitting in the channel (the
// last song ended, then someone used /play again). That's not a "welcome":
// play it only when the bot wasn't in voice a moment ago.
const STAY_MS = 5000;
const joinedAt = new Map();   // guildId → when the bot joined voice (cleared when it leaves)
const noteJoin = (guildId, at = Date.now()) => { joinedAt.set(guildId, at); };
const noteLeave = (guildId) => { joinedAt.delete(guildId); };
// True unless the bot has been in voice for more than a few seconds already.
// (Discord may report the join a moment after the queue is made: unknown counts as new.)
const justJoined = (guildId, now = Date.now()) => {
  const at = joinedAt.get(guildId);
  return at == null || now - at < STAY_MS;
};

const isIntro = (song) => !!song?.metadata?.welcomeIntro;
const forget = (queue) => pending.delete(queue);

module.exports = {
  prepare, maybeIntro, warm, cached, songFor, forIdleJoin, isIntro, forget, keyOf,
  noteJoin, noteLeave, justJoined, CACHE_DIR, _pending: pending,
};
