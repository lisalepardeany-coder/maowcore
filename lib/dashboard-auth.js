// Panel sign-in with Discord (OAuth2 "identify" scope), stored in SQLite.
//
// Flow:
//   1. Panel POSTs /api/auth/discord/start → we return Discord's authorize URL.
//   2. Discord redirects back to /api/auth/discord/callback?code=…&state=…
//   3. We swap the code for an access token, read the user's profile, and
//      issue our own random session token (Discord's token is thrown away).
//   4. The browser keeps the session token and sends it as X-Maow-Session
//      (or ?session= on the WebSocket). The database only stores a SHA-256
//      hash of it, so a copy of maow.db can't be used to sign in.
//
// Tables (lib/db.js, schema v3): sessions (one row per signed-in device) and
// login_events (sign-ins, failures, sign-outs). Without SQLite it falls back
// to memory + data/sessions.json so the bot still runs.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');

const ROOT = path.join(__dirname, '..');
const SESSIONS_PATH = path.join(ROOT, 'data', 'sessions.json');
const ENV_PATH = path.join(ROOT, '.env');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
const MAX_SESSIONS = 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const SEEN_EVERY_MS = 60 * 1000;
const EVENTS_KEEP = 5000;

const useDb = () => db.isAvailable && !!db.raw;
const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

// ===== JSON fallback (no SQLite) =====
let fileState = { sessions: {} };
const loadFile = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
    fileState = { sessions: parsed?.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {} };
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[dashboard-auth] load failed:', e.message);
  }
};
const saveFile = () => {
  if (process.env.NODE_TEST_CONTEXT) return;
  try {
    fs.mkdirSync(path.dirname(SESSIONS_PATH), { recursive: true });
    fs.writeFileSync(`${SESSIONS_PATH}.tmp`, JSON.stringify(fileState));
    fs.renameSync(`${SESSIONS_PATH}.tmp`, SESSIONS_PATH);
  } catch (e) { console.warn('[dashboard-auth] save failed:', e.message); }
};

// ===== Config =====
const isConfigured = () => !!(clientId() && process.env.DISCORD_CLIENT_SECRET);
const clientId = () => process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '';

// The redirect URI must match one registered in the Discord Developer Portal
// exactly, so it's built from the panel's own address, never from the client.
// PANEL_PUBLIC_URL overrides it (e.g. when the panel sits behind a tunnel).
const HOST_OK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
const callbackUrl = (reqHost, port) => {
  const base = String(process.env.PANEL_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (base) return `${base}/api/auth/discord/callback`;
  const host = HOST_OK.test(String(reqHost || '')) ? reqHost : `127.0.0.1:${port}`;
  return `http://${host}/api/auth/discord/callback`;
};

// ===== Login history =====
const recordEvent = (event, user, detail, meta = {}) => {
  if (!useDb()) return;
  try {
    db.raw.prepare(
      `INSERT INTO login_events (ts, user_id, tag, event, detail, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(Date.now(), user?.userId || null, clip(user?.tag, 100), event, clip(detail, 300), clip(meta.ip, 64), clip(meta.ua, 300));
    if (Math.random() < 0.02) {
      db.raw.prepare(`DELETE FROM login_events WHERE id NOT IN (SELECT id FROM login_events ORDER BY ts DESC LIMIT ?)`).run(EVENTS_KEEP);
    }
  } catch (e) { console.warn('[dashboard-auth] event log failed:', e.message); }
};

const recentEvents = ({ limit = 50, userId = null } = {}) => {
  if (!useDb()) return [];
  const n = Math.max(1, Math.min(500, Number(limit) || 50));
  const rows = userId
    ? db.raw.prepare(`SELECT * FROM login_events WHERE user_id = ? ORDER BY ts DESC, id DESC LIMIT ?`).all(userId, n)
    : db.raw.prepare(`SELECT * FROM login_events ORDER BY ts DESC, id DESC LIMIT ?`).all(n);
  return rows.map((r) => ({ ts: r.ts, userId: r.user_id, tag: r.tag, event: r.event, detail: r.detail, ip: r.ip, userAgent: r.user_agent }));
};

// ===== OAuth flow =====
const pending = new Map();   // state nonce → { redirectUri, createdAt }

// `next` = where to land after signing in ('panel' = classic dashboard, 'app' = new dashboard, or 'listen').
const startAuth = (redirectUri, next = 'panel') => {
  if (!isConfigured()) throw new Error('Discord sign-in is not set up yet (DISCORD_CLIENT_SECRET is missing).');
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > PENDING_TTL_MS) pending.delete(k);
  if (pending.size > 500) pending.clear();
  const stateNonce = newToken();
  pending.set(stateNonce, { redirectUri, createdAt: now, next: ['listen', 'app'].includes(next) ? next : 'panel' });
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state: stateNonce,
    prompt: 'none',
  });
  return { authUrl: `https://discord.com/oauth2/authorize?${params}`, stateNonce };
};

const avatarUrl = (user) => (user.avatar
  ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
  : null);

const createSession = (user, meta = {}) => {
  const token = newToken();
  const now = Date.now();
  const session = {
    userId: user.userId, tag: user.tag, discriminator: user.discriminator || null, avatar: user.avatar || null,
    createdAt: now, expiresAt: now + SESSION_TTL_MS,
  };
  if (useDb()) {
    db.raw.prepare(
      `INSERT INTO sessions (token, user_id, tag, discriminator, avatar, created_at, expires_at, last_seen_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(hash(token), session.userId, session.tag, session.discriminator, session.avatar, now, session.expiresAt, now, clip(meta.ip, 64), clip(meta.ua, 300));
    db.raw.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now);
    const count = db.raw.prepare(`SELECT COUNT(*) AS n FROM sessions`).get().n;
    if (count > MAX_SESSIONS) {
      db.raw.prepare(`DELETE FROM sessions WHERE token IN (SELECT token FROM sessions ORDER BY last_seen_at ASC LIMIT ?)`).run(count - MAX_SESSIONS);
    }
  } else {
    fileState.sessions[hash(token)] = { ...session, lastSeenAt: now, ip: clip(meta.ip, 64), userAgent: clip(meta.ua, 300) };
    saveFile();
  }
  return { token, user: session };
};

const discordFetch = async (url, init) => {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    let reason = text.slice(0, 200);
    try { const j = JSON.parse(text); reason = j.error_description || j.error || j.message || reason; } catch { /* plain text */ }
    throw new Error(`Discord said: ${reason || `HTTP ${r.status}`}`);
  }
  return r.json();
};

const completeAuth = async (code, stateNonce, meta = {}) => {
  if (!isConfigured()) throw new Error('Discord sign-in is not set up yet.');
  const p = pending.get(stateNonce);
  pending.delete(stateNonce);
  if (!p || Date.now() - p.createdAt > PENDING_TTL_MS) {
    throw new Error('That sign-in link expired. Please try again.');
  }
  const tokenData = await discordFetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: p.redirectUri,
    }),
  });
  const me = await discordFetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  // We only needed the profile — give Discord's token back right away.
  fetch('https://discord.com/api/oauth2/token/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: tokenData.access_token, client_id: clientId(), client_secret: process.env.DISCORD_CLIENT_SECRET }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
  const user = {
    userId: me.id,
    tag: me.global_name || me.username,
    discriminator: me.discriminator && me.discriminator !== '0' ? me.discriminator : null,
    avatar: avatarUrl(me),
  };
  return { ...createSession(user, meta), next: p.next || 'panel' };
};

// ===== Sessions =====
const lookup = (token, meta = {}) => {
  if (!token) return null;
  const id = hash(token);
  const now = Date.now();
  if (useDb()) {
    const row = db.raw.prepare(`SELECT * FROM sessions WHERE token = ?`).get(id);
    if (!row) return null;
    if (row.expires_at && row.expires_at < now) {
      db.raw.prepare(`DELETE FROM sessions WHERE token = ?`).run(id);
      return null;
    }
    if (!row.last_seen_at || now - row.last_seen_at > SEEN_EVERY_MS) {
      db.raw.prepare(`UPDATE sessions SET last_seen_at = ?, ip = COALESCE(?, ip) WHERE token = ?`).run(now, clip(meta.ip, 64), id);
    }
    return {
      userId: row.user_id, tag: row.tag, discriminator: row.discriminator, avatar: row.avatar,
      createdAt: row.created_at, expiresAt: row.expires_at, sessionId: id,
    };
  }
  const s = fileState.sessions[id];
  if (!s) return null;
  if (s.expiresAt && s.expiresAt < now) { delete fileState.sessions[id]; saveFile(); return null; }
  return { ...s, sessionId: id };
};

const listSessions = (userId, currentToken) => {
  const current = currentToken ? hash(currentToken) : null;
  const shape = (id, s) => ({
    id, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt || s.createdAt, expiresAt: s.expiresAt,
    ip: s.ip || null, userAgent: s.userAgent || null, current: id === current,
  });
  if (useDb()) {
    return db.raw.prepare(`SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`)
      .all(userId, Date.now())
      .map((r) => shape(r.token, { createdAt: r.created_at, lastSeenAt: r.last_seen_at, expiresAt: r.expires_at, ip: r.ip, userAgent: r.user_agent }));
  }
  return Object.entries(fileState.sessions).filter(([, s]) => s.userId === userId).map(([id, s]) => shape(id, s));
};

const revokeSession = (userId, sessionId) => {
  if (useDb()) return db.raw.prepare(`DELETE FROM sessions WHERE token = ? AND user_id = ?`).run(String(sessionId), userId).changes > 0;
  const s = fileState.sessions[sessionId];
  if (!s || s.userId !== userId) return false;
  delete fileState.sessions[sessionId];
  saveFile();
  return true;
};

const logout = (token) => {
  if (!token) return false;
  const id = hash(token);
  if (useDb()) return db.raw.prepare(`DELETE FROM sessions WHERE token = ?`).run(id).changes > 0;
  if (!fileState.sessions[id]) return false;
  delete fileState.sessions[id];
  saveFile();
  return true;
};

const logoutAll = (userId) => {
  if (useDb()) return db.raw.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId).changes;
  let n = 0;
  for (const [id, s] of Object.entries(fileState.sessions)) if (s.userId === userId) { delete fileState.sessions[id]; n++; }
  saveFile();
  return n;
};

// ===== One-time setup from the panel =====
// Writes KEY=value into .env (replacing an existing line) and applies it to
// the running process, so sign-in works without a restart.
const setEnv = (key, value) => {
  if (!/^[A-Z_]+$/.test(key) || /[\r\n]/.test(String(value))) throw new Error('Bad setting.');
  process.env[key] = String(value);
  if (process.env.NODE_TEST_CONTEXT) return;
  let text = '';
  try { text = fs.readFileSync(ENV_PATH, 'utf8'); } catch { /* new file */ }
  const line = `${key}=${value}`;
  const rx = new RegExp(`^${key}=.*$`, 'm');
  text = rx.test(text) ? text.replace(rx, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;
  fs.writeFileSync(ENV_PATH, text);
};

const setupSecret = (secret) => {
  const s = String(secret || '').trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(s)) {
    throw new Error('That does not look like a Discord client secret (about 32 letters and numbers).');
  }
  if (!clientId()) throw new Error('DISCORD_CLIENT_ID is missing in .env.');
  setEnv('DISCORD_CLIENT_SECRET', s);
};

// ===== Session list for the new (SvelteKit) dashboard =====
// Same jobs as listSessions/revokeSession above, in the shape the new dashboard
// expects. Sessions are stored by their hash, so the short id is a prefix of the
// hash, never of the real token.
const listForUser = (userId) => listSessions(userId)
  .map((s) => ({ id: String(s.id).slice(0, 12), createdAt: s.createdAt, expiresAt: s.expiresAt }))
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

const revokeById = (userId, idPrefix) => {
  const match = listSessions(userId).find((s) => String(s.id).slice(0, 12) === String(idPrefix));
  return match ? revokeSession(userId, match.id) : false;
};

// Sign out everywhere except the session making the request.
const revokeOthers = (userId, keepToken) => {
  const keep = keepToken ? hash(keepToken) : null;
  let n = 0;
  for (const s of listSessions(userId)) if (s.id !== keep && revokeSession(userId, s.id)) n++;
  return n;
};

if (!useDb()) loadFile();

module.exports = {
  isConfigured, clientId, callbackUrl, startAuth, completeAuth, createSession,
  lookup, logout, logoutAll, listSessions, revokeSession,
  listForUser, revokeById, revokeOthers,
  recordEvent, recentEvents, setEnv, setupSecret, hash,
};
