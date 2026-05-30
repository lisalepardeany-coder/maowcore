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
  state.sessions[token] = {
    userId: user.id,
    tag: user.global_name || user.username,
    discriminator: user.discriminator || null,
    avatar,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  // Cap session table to prevent unbounded growth.
  const all = Object.entries(state.sessions);
  if (all.length > MAX_SESSIONS) {
    all.sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
    while (Object.keys(state.sessions).length > MAX_SESSIONS) {
      delete state.sessions[all.shift()[0]];
    }
  }
  save();
  return { token, user: state.sessions[token] };
};

// Look up a session token. Returns the user info or null if missing/expired.
const lookup = (token) => {
  if (!token) return null;
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
  if (!token || !state.sessions[token]) return false;
  delete state.sessions[token];
  save();
  return true;
};

load();

module.exports = { isConfigured, startAuth, completeAuth, lookup, logout };
