// Dashboard Discord-OAuth sessions for v2.1.0 social features.
//
// Flow:
//   1. Dashboard hits POST /api/auth/discord/start with a `redirect` URL
//   2. Server returns an authorization URL to redirect the user to
//   3. Discord redirects back to /api/auth/discord/callback?code=…
//   4. Server exchanges code → access token → user profile → issues a
//      MaowCore session token (opaque random ID)
//   5. Session is persisted to data/sessions.json keyed by token, with
//      Discord user id + tag + avatar + expiry. The dashboard stores
//      the session token in localStorage and sends it as
//      `X-Maow-Session: <token>` on requests that need a logged-in user.
//
// Designed to work whether or not the operator has set
// DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET. Without them OAuth
// silently disables and the dashboard just doesn't show the login UI.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');

const SESSIONS_PATH = path.join(__dirname, '..', 'data', 'sessions.json');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
const MAX_SESSIONS = 1000;

let state = { sessions: {}, pending: {} };

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
    state = parsed && typeof parsed === 'object' ? parsed : state;
    if (!state.sessions) state.sessions = {};
    if (!state.pending) state.pending = {};
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[dashboard-auth] load failed:', e.message);
  }
};

const save = () => {
  try {
    fs.mkdirSync(path.dirname(SESSIONS_PATH), { recursive: true });
    const tmp = `${SESSIONS_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, SESSIONS_PATH);
  } catch (e) { console.warn('[dashboard-auth] save failed:', e.message); }
};

const isConfigured = () => !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

const newToken = () => crypto.randomBytes(24).toString('base64url');

// Step 1 — generate an auth URL the user can be redirected to.
const startAuth = (redirectUri) => {
  if (!isConfigured()) throw new Error('Discord OAuth not configured (set DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET).');
  const stateNonce = newToken();
  state.pending[stateNonce] = { redirectUri, createdAt: Date.now() };
  // Clean up pendings older than 10 minutes — they're abandoned flows.
  const cutoff = Date.now() - 600000;
  for (const k of Object.keys(state.pending)) {
    if (state.pending[k].createdAt < cutoff) delete state.pending[k];
  }
  save();
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state: stateNonce,
  });
  return { authUrl: `https://discord.com/api/oauth2/authorize?${params}`, stateNonce };
};

// Step 4 — exchange code for an access token, fetch the user profile,
// store a session, return the session token + user info.
const completeAuth = async (code, stateNonce) => {
  if (!isConfigured()) throw new Error('OAuth not configured.');
  if (!state.pending[stateNonce]) throw new Error('Invalid or expired state token.');
  const { redirectUri } = state.pending[stateNonce];
  delete state.pending[stateNonce];

  // Exchange code → access token.
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`token exchange failed: ${text.slice(0, 200)}`);
  }
  const tokenData = await tokenRes.json();

  // Fetch the user profile.
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) throw new Error('Could not fetch user profile.');
  const user = await userRes.json();
  const avatar = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
    : null;

  const token = newToken();
  const session = {
    userId: user.id,
    tag: user.global_name || user.username,
    discriminator: user.discriminator || null,
    avatar,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  if (db.isAvailable) {
    db.raw.prepare(
      `INSERT INTO sessions (token, user_id, tag, discriminator, avatar, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(token, session.userId, session.tag, session.discriminator, session.avatar, session.createdAt, session.expiresAt);
    // Cap by deleting oldest when over limit.
    const count = db.raw.prepare(`SELECT COUNT(*) AS n FROM sessions`).get().n;
    if (count > MAX_SESSIONS) {
      db.raw.prepare(
        `DELETE FROM sessions WHERE token IN (
           SELECT token FROM sessions ORDER BY created_at ASC LIMIT ?
         )`,
      ).run(count - MAX_SESSIONS);
    }
  } else {
    state.sessions[token] = session;
    // Cap session table to prevent unbounded growth.
    const all = Object.entries(state.sessions);
    if (all.length > MAX_SESSIONS) {
      all.sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
      while (Object.keys(state.sessions).length > MAX_SESSIONS) {
        delete state.sessions[all.shift()[0]];
      }
    }
    save();
  }
  return { token, user: session };
};

// Look up a session token. Returns the user info or null if missing/expired.
const lookup = (token) => {
  if (!token) return null;
  if (db.isAvailable) {
    const row = db.raw.prepare(`SELECT * FROM sessions WHERE token = ?`).get(token);
    if (!row) return null;
    if (row.expires_at && row.expires_at < Date.now()) {
      db.raw.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
      return null;
    }
    return {
      userId: row.user_id,
      tag: row.tag,
      discriminator: row.discriminator,
      avatar: row.avatar,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }
  const s = state.sessions[token];
  if (!s) return null;
  if (s.expiresAt && s.expiresAt < Date.now()) {
    delete state.sessions[token];
    save();
    return null;
  }
  return s;
};

const logout = (token) => {
  if (!token) return false;
  if (db.isAvailable) {
    const r = db.raw.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return r.changes > 0;
  }
  if (!state.sessions[token]) return false;
  delete state.sessions[token];
  save();
  return true;
};

// List a user's active sessions (no full tokens — only a short id prefix).
const listForUser = (userId) => {
  if (db.isAvailable) {
    return db.raw.prepare(
      `SELECT token, created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC`,
    ).all(userId).map((r) => ({ id: r.token.slice(0, 12), createdAt: r.created_at, expiresAt: r.expires_at }));
  }
  return Object.entries(state.sessions)
    .filter(([, s]) => s.userId === userId)
    .map(([token, s]) => ({ id: token.slice(0, 12), createdAt: s.createdAt, expiresAt: s.expiresAt }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

// Revoke one of a user's sessions by its short id prefix.
const revokeById = (userId, idPrefix) => {
  if (db.isAvailable) {
    const rows = db.raw.prepare(`SELECT token FROM sessions WHERE user_id = ?`).all(userId);
    const match = rows.find((r) => r.token.slice(0, 12) === idPrefix);
    if (!match) return false;
    return db.raw.prepare(`DELETE FROM sessions WHERE token = ?`).run(match.token).changes > 0;
  }
  const entry = Object.entries(state.sessions).find(([token, s]) => s.userId === userId && token.slice(0, 12) === idPrefix);
  if (!entry) return false;
  delete state.sessions[entry[0]];
  save();
  return true;
};

// Revoke every session for a user except the one making the request.
const revokeOthers = (userId, keepToken) => {
  if (db.isAvailable) {
    return db.raw.prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`).run(userId, keepToken).changes;
  }
  let n = 0;
  for (const [token, s] of Object.entries(state.sessions)) {
    if (s.userId === userId && token !== keepToken) { delete state.sessions[token]; n++; }
  }
  if (n) save();
  return n;
};

load();

module.exports = { isConfigured, startAuth, completeAuth, lookup, logout, listForUser, revokeById, revokeOthers };
