// Panel extras: permission gate, panel audit log, soundboard API, synced lyrics
// and restart/update controls. handle() runs before the dashboard's own routes.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const dataRoot = () => (process.env.NODE_TEST_CONTEXT ? require('node:os').tmpdir() : path.join(ROOT, 'data'));
const auditFile = () => path.join(dataRoot(), 'panel-audit.json');
const SOUND_DIR = path.join(ROOT, 'data', 'sounds');
const SOUND_RX = /\.(mp3|wav|ogg|m4a)$/i;
const AUDIT_MAX = 1000;
const MAX_SOUND_BYTES = 15 * 1024 * 1024;

const LADDER = ['banned', 'guest', 'member', 'moderator', 'admin', 'owner'];
const rankAtLeast = (rank, required) => LADDER.indexOf(rank) >= LADDER.indexOf(required);

// ===== Which websites may talk to the panel (pure, unit tested) =====
// Browsers attach an Origin header to cross-site requests. Without this check
// any page you visit could drive the bot through http://127.0.0.1. Allowed:
// the panel itself, other local panels (multi-bot), browser extensions,
// Discord (Vencord plugin) and anything listed in PANEL_ALLOWED_ORIGINS.
const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const DISCORD_ORIGIN = /^https:\/\/(ptb\.|canary\.)?discord\.com$/i;
const originAllowed = (origin, host) => {
  if (!origin || origin === 'null') return !origin;
  const o = String(origin).replace(/\/$/, '');
  if (host && (o === `http://${host}` || o === `https://${host}`)) return true;
  if (LOOPBACK_ORIGIN.test(o) || DISCORD_ORIGIN.test(o)) return true;
  if (/^(chrome|moz)-extension:\/\//i.test(o)) return true;
  const extra = String(process.env.PANEL_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return extra.includes(o);
};
const isLoopback = (req) => /^(127\.|::1$|::ffff:127\.)/.test(req.socket?.remoteAddress || '');

// ===== Permissions (pure, unit tested) =====
const isPublicPath = (p) => !p.startsWith('/api/')
  || p === '/api/health'
  || p === '/api/status/public'
  || p.startsWith('/api/auth/');

const requiredRank = (method, p) => {
  if (isPublicPath(p)) return null;
  // Friends signed in as guests may use the listen room, nothing else.
  if (p.startsWith('/api/listen/')) return 'guest';
  if (p.startsWith('/api/youtube-cookies')) return 'owner';
  if (p === '/api/owner-prefs') return method === 'GET' ? 'member' : 'owner';
  if (p === '/api/status-channel') return 'admin';
  if (p === '/api/mod/log' || p === '/api/mod/notes') return 'moderator';
  if (p === '/api/mod/warn-rules') return method === 'GET' ? 'moderator' : 'admin';
  if (p === '/api/radio/play' || p === '/api/mood/play' || p === '/api/similar') return 'moderator';
  if (p.startsWith('/api/playlists') || p.startsWith('/api/radio/')) return 'member';
  if (p.startsWith('/api/checklists')) return 'member';
  if (p === '/api/routines/run') return 'moderator';
  if (p.startsWith('/api/routines')) return 'member';
  if (p === '/api/health-alerts/set' || p === '/api/health-alerts/test') return 'owner';
  if (p.startsWith('/api/health-alerts')) return 'admin';
  if (p.startsWith('/api/ambience/')) return 'moderator';
  if (/^\/api\/(profiles|reminders)(\/|$)/.test(p)) return 'member';
  if (p.startsWith('/api/dev/') || p === '/api/backup/restore' || p === '/api/roles/grant' || p.startsWith('/api/control/')) return 'owner';
  if (/^\/api\/(admin|automation|custom-cmds|market|templates|backup|status|panel-audit|observability|roles)(\/|$)/.test(p)) return 'admin';
  if (method === 'GET') return 'member';
  if (/^\/api\/(mod|library|posts|sounds)(\/|$)/.test(p)) return 'moderator';
  return 'member';
};

// Login is only enforced once Discord sign-in can actually work, so turning
// it on before the client secret is in .env can never lock you out.
const loginWanted = () => process.env.PANEL_REQUIRE_LOGIN === '1';
const loginRequired = () => {
  if (!loginWanted()) return false;
  try { return require('./dashboard-auth').isConfigured(); } catch { return false; }
};

const identify = (req, control, sessionToken) => {
  const header = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (control.authToken && header?.[1] === control.authToken) return { who: 'control token', rank: 'owner' };
  const token = sessionToken || req.headers['x-maow-session'] || '';
  if (token) {
    try {
      const user = require('./dashboard-auth').lookup(token, { ip: req.socket?.remoteAddress });
      if (user) return { who: user.tag || user.userId, rank: require('./roles').rankOf(user.userId) || 'member', userId: user.userId };
    } catch { /* treated as signed out */ }
  }
  return { who: 'local panel', rank: loginRequired() ? 'banned' : 'owner' };
};

// ===== Audit log =====
let audit = null;
let auditTimer = null;
const loadAudit = () => {
  if (audit) return audit;
  try { audit = JSON.parse(fs.readFileSync(auditFile(), 'utf8')); } catch { audit = []; }
  return audit;
};
const record = (who, action) => {
  loadAudit().unshift({ ts: Date.now(), who, action: String(action).slice(0, 120) });
  audit.length = Math.min(audit.length, AUDIT_MAX);
  if (auditTimer) return;
  auditTimer = setTimeout(() => {
    auditTimer = null;
    try {
      fs.writeFileSync(`${auditFile()}.tmp`, JSON.stringify(audit));
      fs.renameSync(`${auditFile()}.tmp`, auditFile());
    } catch (e) { console.warn('[audit] save failed:', e.message); }
  }, 1000);
  auditTimer.unref?.();
};
// Commands that only read or nudge the view don't belong in the audit trail.
const QUIET_COMMANDS = new Set(['ping', 'refresh', 'get_state', 'subscribe']);

// ===== Synced lyrics (pure parts unit tested) =====
const parseLrc = (lrc) => {
  const out = [];
  for (const line of String(lrc || '').split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const s of stamps) out.push({ t: Number(s[1]) * 60 + Number(s[2]), text });
  }
  return out.sort((a, b) => a.t - b.t);
};
const cleanTitle = (s) => String(s || '')
  .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  .replace(/\b(official|lyrics?|video|audio|hd|4k|mv|remaster(ed)?)\b/gi, ' ')
  .replace(/[▶|•~]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const normWords = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const pickLyrics = (results, query, duration) => {
  const words = normWords(query);
  const score = (r) => {
    const hay = new Set(normWords(`${r.artistName} ${r.trackName}`));
    let s = words.filter((w) => hay.has(w)).length * 2;
    if (r.syncedLyrics) s += 3;
    if (duration && r.duration && Math.abs(r.duration - duration) <= 4) s += 4;
    return s;
  };
  const usable = (results || []).filter((r) => (r.syncedLyrics || r.plainLyrics) && !r.instrumental);
  if (!usable.length) return null;
  return usable.reduce((a, b) => (score(b) > score(a) ? b : a));
};

const lyricCache = new Map();
const syncedLyrics = async (song) => {
  if (lyricCache.has(song.url)) return lyricCache.get(song.url);
  const q = cleanTitle(song.name);
  let best = null;
  if (q) {
    const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'MaowCore Discord bot' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`LRCLIB returned HTTP ${r.status}`);
    best = pickLyrics(await r.json(), q, song.duration);
  }
  const result = best
    ? { found: true, url: song.url, track: best.trackName, artist: best.artistName, lines: parseLrc(best.syncedLyrics), plain: best.plainLyrics || null }
    : { found: false, url: song.url };
  if (lyricCache.size > 100) lyricCache.clear();
  lyricCache.set(song.url, result);
  return result;
};

// ===== Soundboard =====
const safeSoundName = (raw) => {
  const base = path.basename(String(raw || '')).replace(/[^\w .()-]/g, '_').trim();
  return SOUND_RX.test(base) && !base.startsWith('.') ? base : null;
};
const listSounds = () => {
  try { return fs.readdirSync(SOUND_DIR).filter((f) => SOUND_RX.test(f)).sort(); } catch { return []; }
};

// ===== Restart / update =====
const updateJob = { running: false, log: [], ok: null, finishedAt: null };
const runStep = (cmd, args, shell = false) => new Promise((resolve) => {
  // With a shell, pass one command string: Node deprecates args + shell (DEP0190).
  // Only fixed npm arguments go through the shell path, never user input.
  const opts = { cwd: ROOT, shell, windowsHide: true, env: { ...process.env, NODE_TEST_CONTEXT: undefined } };
  const child = shell ? spawn([cmd, ...args].join(' '), opts) : spawn(cmd, args, opts);
  const add = (b) => { for (const l of String(b).split(/\r?\n/)) if (l.trim()) updateJob.log.push(l.slice(0, 200)); updateJob.log = updateJob.log.slice(-60); };
  child.stdout.on('data', add);
  child.stderr.on('data', add);
  child.on('error', (e) => { add(e.message); resolve(1); });
  child.on('close', (code) => resolve(code));
});
const restartSoon = () => setTimeout(() => process.emit('SIGTERM'), 500);

const runUpdate = async (record2) => {
  Object.assign(updateJob, { running: true, log: ['Saving the current package list…'], ok: null, finishedAt: null });
  const lock = path.join(ROOT, 'package-lock.json');
  const saved = path.join(ROOT, 'data', 'package-lock.before-update.json');
  try {
    // Safety first: a full backup (settings, database, library list) before anything changes.
    try {
      const snap = require('./backup').create();
      updateJob.log.push(`Backup made first: ${snap.name}`);
    } catch (e) { updateJob.log.push(`(Backup before update failed: ${e.message} — continuing)`); }
    fs.copyFileSync(lock, saved);
    updateJob.log.push('Updating packages…');
    let code = await runStep('npm', ['update'], true);
    if (code === 0) {
      updateJob.log.push('Running tests…');
      code = await runStep('npm', ['test'], true);
    }
    if (code !== 0) {
      updateJob.log.push('Something failed. Putting the previous packages back…');
      fs.copyFileSync(saved, lock);
      await runStep('npm', ['install'], true);
      updateJob.ok = false;
      return;
    }
    const ytdlp = path.join(ROOT, 'node_modules', '@distube', 'yt-dlp', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    if (fs.existsSync(ytdlp)) {
      updateJob.log.push('Updating yt-dlp…');
      await runStep(ytdlp, ['-U']);
    }
    updateJob.ok = true;
    updateJob.log.push(process.env.MAOW_SUPERVISED ? 'Done. Restarting…' : 'Done. Restart the bot to use the new versions.');
    if (process.env.MAOW_SUPERVISED) restartSoon();
  } catch (e) {
    updateJob.ok = false;
    updateJob.log.push(`Failed: ${e.message}`);
  } finally {
    updateJob.running = false;
    updateJob.finishedAt = Date.now();
    record2(`update finished: ${updateJob.ok ? 'ok' : 'failed'}`);
  }
};

// ===== HTTP =====
const handle = (req, res, p, control, url) => {
  // Another website trying to change something here: refuse before anything runs.
  if (req.method !== 'GET' && req.method !== 'HEAD' && p.startsWith('/api/')
    && req.headers.origin && !originAllowed(req.headers.origin, req.headers.host)) {
    control._json(res, { error: 'Blocked: request came from another website.' }, 403);
    return true;
  }
  const me = identify(req, control);
  if (loginRequired()) {
    const need = requiredRank(req.method, p);
    if (need && !rankAtLeast(me.rank, need)) {
      control._json(res, { error: me.who === 'local panel' ? 'Sign in required.' : `This needs the ${need} rank.` }, me.who === 'local panel' ? 401 : 403);
      return true;
    }
  }
  if (req.method === 'POST' && p.startsWith('/api/')) record(me.who, `POST ${p}`);

  if (p === '/api/panel-audit' && req.method === 'GET') {
    control._json(res, { entries: loadAudit().slice(0, 200) });
    return true;
  }

  if (p === '/api/lyrics/synced' && req.method === 'GET') {
    const gid = url.searchParams.get('guildId') || control.distube.queues.collection.keys().next().value;
    const song = gid ? control.distube.getQueue(gid)?.songs?.[0] : null;
    if (!song) { control._json(res, { found: false, idle: true }); return true; }
    syncedLyrics(song)
      .then((r) => control._json(res, r))
      .catch((e) => control._json(res, { found: false, error: e.message }));
    return true;
  }

  if (p === '/api/sounds' && req.method === 'GET') {
    control._json(res, { sounds: listSounds() });
    return true;
  }
  if (p === '/api/sounds/play' && req.method === 'POST') {
    control._readJsonBody(req).then(async (b) => {
      const file = listSounds().find((f) => f === b.file);
      if (!file) return control._json(res, { error: 'Sound not found.' }, 404);
      const gid = b.guildId && control.distube.voices.get(b.guildId) ? b.guildId : control.distube.voices.collection.keys().next().value;
      const channel = gid ? control.distube.voices.get(gid)?.channel : null;
      if (!channel) return control._json(res, { error: 'The bot is not in a voice channel. Use /play in Discord first.' }, 409);
      await control.distube.play(channel, control._soundUrl(file), { metadata: { localName: path.basename(file, path.extname(file)) } });
      return control._json(res, { ok: true });
    }).catch((e) => control._json(res, { error: e.message }, 500));
    return true;
  }
  if (p === '/api/sounds/delete' && req.method === 'POST') {
    control._readJsonBody(req).then((b) => {
      const file = listSounds().find((f) => f === b.file);
      if (!file) return control._json(res, { error: 'Sound not found.' }, 404);
      fs.unlinkSync(path.join(SOUND_DIR, file));
      return control._json(res, { ok: true });
    }).catch((e) => control._json(res, { error: e.message }, 500));
    return true;
  }
  if (p === '/api/sounds/upload' && req.method === 'POST') {
    let name = null;
    try { name = safeSoundName(decodeURIComponent(req.headers['x-filename'] || '')); } catch { /* bad header */ }
    if (!name) { control._json(res, { error: 'Use an .mp3, .wav, .ogg or .m4a file.' }, 400); return true; }
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_SOUND_BYTES) tooBig = true; else chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return control._json(res, { error: 'Sounds can be up to 15 MB.' }, 413);
      fs.mkdirSync(SOUND_DIR, { recursive: true });
      fs.writeFileSync(path.join(SOUND_DIR, name), Buffer.concat(chunks));
      return control._json(res, { ok: true, file: name });
    });
    return true;
  }

  if (p === '/api/control/info' && req.method === 'GET') {
    control._json(res, {
      supervised: !!process.env.MAOW_SUPERVISED,
      pid: process.pid,
      version: require('../package.json').version,
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
      requireLogin: loginRequired(),
      loginWanted: loginWanted(),
      update: { running: updateJob.running, ok: updateJob.ok, finishedAt: updateJob.finishedAt, log: updateJob.log },
    });
    return true;
  }
  // These two arrive by POST from a page, so refuse other websites.
  if (p === '/api/control/restart' || p === '/api/control/update') {
    if (req.method !== 'POST') { control._json(res, { error: 'POST required' }, 405); return true; }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      control._json(res, { error: 'Blocked: request came from another site.' }, 403);
      return true;
    }
    if (p === '/api/control/restart') {
      if (!process.env.MAOW_SUPERVISED) { control._json(res, { error: 'Restart needs the bot to be started by its supervisor.' }, 409); return true; }
      control._json(res, { ok: true });
      restartSoon();
      return true;
    }
    if (updateJob.running) { control._json(res, { error: 'An update is already running.' }, 409); return true; }
    runUpdate((a) => record(me.who, a));
    control._json(res, { ok: true });
    return true;
  }
  return false;
};

// ===== WebSocket =====
const wsAllowed = (ws, req, control) => {
  // Cross-site WebSocket hijacking: a random page opening ws://127.0.0.1.
  if (req.headers.origin && !originAllowed(req.headers.origin, req.headers.host)) return false;
  let session = null;
  try { session = new URL(req.url || '/', 'http://x').searchParams.get('session'); } catch { /* none */ }
  let me = identify(req, control, session);
  // Browsers always send Origin on WebSockets, so no Origin from this PC means
  // a local program (the desktop control panel). Those are trusted like before.
  if (loginRequired() && me.who === 'local panel' && !req.headers.origin && isLoopback(req)) {
    me = { who: 'local app', rank: 'owner' };
  }
  ws.maowWho = me;
  return !loginRequired() || rankAtLeast(me.rank, 'member');
};
const wsCommandAllowed = (ws, msg) => {
  const me = ws?.maowWho || { who: 'local panel', rank: loginRequired() ? 'banned' : 'owner' };
  if (loginRequired() && !rankAtLeast(me.rank, 'moderator')) return false;
  if (msg?.action && !QUIET_COMMANDS.has(msg.action)) record(me.who, `panel: ${msg.action}`);
  return true;
};

module.exports = { handle, wsAllowed, wsCommandAllowed, requiredRank, isPublicPath, rankAtLeast, originAllowed, loginRequired, loginWanted, identify, parseLrc, cleanTitle, pickLyrics, safeSoundName };
