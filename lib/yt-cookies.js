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

// Pure (unit tested): Netscape cookies.txt → cookie objects (YouTube/Google only).
const parse = (text) => {
  const out = [];
  for (let line of String(text || '').split(/\r?\n/)) {
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
const filePath = () => (exists() ? FILE : null);

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
  const c = check(text);
  if (!c.ok) throw new Error(c.error);
  const keep = String(text).split(/\r?\n/).filter((line) => {
    const l = line.startsWith('#HttpOnly_') ? line.slice(10) : line;
    if (!l.trim() || l.startsWith('#')) return false;
    const host = (l.split('\t')[0] || '').replace(/^\./, '');
    return DOMAIN.test(host);
  });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `# Netscape HTTP Cookie File\n# Saved by MaowCore for YouTube playback\n${keep.join('\n')}\n`, { mode: 0o600 });
  return info();
};

const remove = () => { try { fs.unlinkSync(FILE); return true; } catch { return false; } };

// For @distube/youtube (ytdl-core) at startup.
const forYtdl = () => {
  if (!exists()) return undefined;
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
const ytdlpArgs = () => ['--js-runtimes', jsRuntime(), ...(exists() ? ['--cookies', FILE] : [])];

module.exports = { parse, check, info, save, remove, filePath, forYtdl, jsRuntime, ytdlpArgs, FILE };
