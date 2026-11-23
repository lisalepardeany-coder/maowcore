// YouTube cookies, for when YouTube says "Sign in to confirm you're not a bot".
//
// The owner exports cookies.txt (Netscape format) from their browser and
// uploads it in the panel (Control room). It's stored at
// data/youtube-cookies.txt (data/ is git-ignored) and used by:
//   • yt-dlp (stream URLs)          → --cookies <file>, read on every call
//   • @distube/youtube (search/info) → Cookie[] at startup (needs a restart)
// Only YouTube/Google cookies are kept. Values are never sent back to the
// panel or written to logs.
const fs = require('node:fs');
const path = require('node:path');

const FILE = process.env.NODE_TEST_CONTEXT
  ? path.join(require('node:os').tmpdir(), `maow-yt-cookies-${process.pid}.txt`)
  : path.join(__dirname, '..', 'data', 'youtube-cookies.txt');
const MAX_BYTES = 512 * 1024;
const DOMAIN = /(^|\.)(youtube\.com|google\.com)$/i;
const LOGIN_NAMES = ['SID', '__Secure-1PSID', '__Secure-3PSID', 'LOGIN_INFO', 'SAPISID'];

const HEADER = '# Netscape HTTP Cookie File';

// Pure (unit tested): repair what editors, phones and copy-paste do to a
// cookies.txt, so yt-dlp accepts it. yt-dlp needs the FIRST line to be the
// Netscape header and every cookie line to be exactly 7 TAB-separated fields.
//   - invisible byte-order mark at the start, Windows line endings, blank lines
//     before the header, a missing header
//   - tabs turned into spaces (the panel's file editor, pasting)
const normalize = (text) => {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n|\r/);
  const out = [HEADER];
  for (let raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    if (/^#( Netscape)? HTTP Cookie File/i.test(line.trim())) continue; // we write our own header
    const http = line.startsWith('#HttpOnly_') ? '#HttpOnly_' : '';
    const body = http ? line.slice(http.length) : line;
    if (!http && body.startsWith('#')) { out.push(line); continue; } // a comment
    let fields = body.split('\t');
    if (fields.length < 7) fields = body.trim().split(/\s+/); // tabs became spaces
    if (fields.length < 7) continue; // not a cookie line: drop it rather than break the file
    // 7 fields; a value that had spaces in it gets them back
    const cookie = [...fields.slice(0, 6), fields.slice(6).join(fields.length > 7 && !body.includes('\t') ? ' ' : '\t')];
    out.push(http + cookie.join('\t'));
  }
  return `${out.join('\n')}\n`;
};

// Pure (unit tested): Netscape cookies.txt → cookie objects (YouTube/Google only).
const parse = (text) => {
  const out = [];
  for (let line of normalize(text).split('\n')) {
    let httpOnly = false;
    if (line.startsWith('#HttpOnly_')) { httpOnly = true; line = line.slice(10); }
    if (!line.trim() || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [domain, , cpath, secure, expires, name, ...rest] = parts;
    const host = domain.replace(/^\./, '');
    if (!DOMAIN.test(host) || !name) continue;
    out.push({
      domain, path: cpath || '/', secure: secure === 'TRUE', httpOnly,
      expirationDate: Number(expires) || undefined, name, value: rest.join('\t'),
    });
  }
  return out;
};

// Pure: is this a usable file? Returns { ok, count, signedIn, error }.
const check = (text) => {
  if (Buffer.byteLength(String(text || '')) > MAX_BYTES) return { ok: false, error: 'That file is too big for a cookies.txt.' };
  const cookies = parse(text);
  const yt = cookies.filter((c) => /youtube\.com$/i.test(c.domain.replace(/^\./, '')));
  if (!yt.length) {
    return { ok: false, error: 'No YouTube cookies found. Export cookies.txt while you are on youtube.com (Netscape format).' };
  }
  const signedIn = cookies.some((c) => LOGIN_NAMES.includes(c.name));
  const now = Date.now() / 1000;
  const expired = yt.length && yt.every((c) => c.expirationDate && c.expirationDate < now);
  if (expired) return { ok: false, error: 'These cookies have all expired. Export fresh ones.' };
  return { ok: true, count: cookies.length, signedIn };
};

const exists = () => fs.existsSync(FILE);

// The saved file, repaired if needed, or null when it can't be used.
// yt-dlp stops with "does not look like a Netscape format cookies file" on a
// broken file, which made EVERY download and stream fail. So the file is
// checked before each use (cheap: cached until the file changes), repaired in
// place when possible (the original is kept as .bak), and left out otherwise:
// no cookies beats a broken file.
let usableCache = { key: null, ok: false };
let warned = null;
const usableFile = () => {
  let st;
  try { st = fs.statSync(FILE); } catch { return null; }
  const key = `${st.size}:${st.mtimeMs}`;
  if (usableCache.key === key) return usableCache.ok ? FILE : null;
  let ok = false;
  try {
    const text = fs.readFileSync(FILE, 'utf8');
    const fixed = normalize(text);
    ok = check(fixed).ok;
    if (ok && fixed !== text) {
      try { fs.writeFileSync(`${FILE}.bak`, text, { mode: 0o600 }); } catch { /* best effort */ }
      fs.writeFileSync(FILE, fixed, { mode: 0o600 });
      console.log('♥ Cookies: repaired data/youtube-cookies.txt (header, tabs or line endings); the original is in youtube-cookies.txt.bak');
      st = fs.statSync(FILE);
    }
    if (!ok && warned !== key) {
      warned = key;
      console.warn(`▲ Cookies: data/youtube-cookies.txt can't be used (${check(fixed).error}). Downloads run without cookies until you add a working one.`);
    }
  } catch { ok = false; }
  usableCache = { key: `${st.size}:${st.mtimeMs}`, ok };
  return ok ? FILE : null;
};
const filePath = () => usableFile();

const info = () => {
  if (!exists()) return { present: false };
  try {
    const text = fs.readFileSync(FILE, 'utf8');
    const c = check(text);
    return { present: true, updatedAt: fs.statSync(FILE).mtimeMs, count: c.count || 0, signedIn: !!c.signedIn, valid: c.ok, problem: c.ok ? null : c.error };
  } catch (e) { return { present: true, valid: false, problem: e.message }; }
};

// Keep only the YouTube/Google lines, so nothing else from the browser is stored.
const save = (text) => {
  text = normalize(text); // repair tabs, header, line endings first
  const c = check(text);
  if (!c.ok) throw new Error(c.error);
  const keep = text.split('\n').filter((line) => {
    const l = line.startsWith('#HttpOnly_') ? line.slice(10) : line;
    if (!l.trim() || l.startsWith('#')) return false;
    const host = (l.split('\t')[0] || '').replace(/^\./, '');
    return DOMAIN.test(host);
  });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${HEADER}\n# Saved by MaowCore for YouTube playback\n${keep.join('\n')}\n`, { mode: 0o600 });
  usableCache = { key: null, ok: false };
  return info();
};

const remove = () => { try { fs.unlinkSync(FILE); return true; } catch { return false; } };

// For @distube/youtube (ytdl-core) at startup.
const forYtdl = () => {
  if (!usableFile()) return undefined;
  try {
    const list = parse(fs.readFileSync(FILE, 'utf8'));
    return list.length ? list : undefined;
  } catch { return undefined; }
};

// YouTube now needs a JavaScript runtime to unlock streams (the "n challenge"),
// and yt-dlp only looks for Deno by default. Node is already here — it's what
// runs the bot — so point yt-dlp at it. Without this, signed-in requests come
// back with "Only images are available".
const jsRuntime = () => `node:${process.execPath}`;

// Extra command-line args for every yt-dlp call.
const ytdlpArgs = () => { const f = usableFile(); return ['--js-runtimes', jsRuntime(), ...(f ? ['--cookies', f] : [])]; };

module.exports = { parse, check, normalize, info, save, remove, filePath, usableFile, forYtdl, jsRuntime, ytdlpArgs, FILE, HEADER };
