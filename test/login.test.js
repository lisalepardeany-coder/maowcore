// Panel login: session database, origin rules, setup validation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-login-'));
process.env.DB_PATH = path.join(tmpDir, 'login.db');

const db = require('../lib/db');
const auth = require('../lib/dashboard-auth');
const extras = require('../lib/panel-extras');
const sqliteOk = db.isAvailable;

const user = { userId: '111', tag: 'Hazel', avatar: null };

test('login db: schema v3 has login_events and session columns', { skip: !sqliteOk }, () => {
  const v = db.raw.prepare(`SELECT value FROM _meta WHERE key = 'schema_version'`).get().value;
  assert.ok(Number(v) >= 3);
  const cols = db.raw.prepare(`PRAGMA table_info(sessions)`).all().map((c) => c.name);
  for (const c of ['last_seen_at', 'ip', 'user_agent']) assert.ok(cols.includes(c), c);
  assert.ok(db.raw.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'login_events'`).get());
});

test('login db: only a hash of the token is stored, lookup works', { skip: !sqliteOk }, () => {
  const { token } = auth.createSession(user, { ip: '127.0.0.1', ua: 'Mozilla/5.0 Chrome/130 Windows' });
  assert.equal(db.raw.prepare(`SELECT COUNT(*) n FROM sessions WHERE token = ?`).get(token).n, 0);
  assert.equal(db.raw.prepare(`SELECT COUNT(*) n FROM sessions WHERE token = ?`).get(auth.hash(token)).n, 1);
  assert.equal(auth.lookup(token).userId, '111');
  assert.equal(auth.lookup('not-a-real-token'), null);
});

test('login db: devices list, revoke one, sign out everywhere', { skip: !sqliteOk }, () => {
  db.raw.exec('DELETE FROM sessions');
  const a = auth.createSession(user, {});
  const b = auth.createSession(user, {});
  const list = auth.listSessions('111', a.token);
  assert.equal(list.length, 2);
  assert.equal(list.filter((s) => s.current).length, 1);
  const other = list.find((s) => !s.current);
  assert.equal(auth.revokeSession('999', other.id), false, 'cannot revoke someone else’s device');
  assert.equal(auth.revokeSession('111', other.id), true);
  assert.equal(auth.lookup(b.token), null);
  assert.equal(auth.logoutAll('111'), 1);
  assert.equal(auth.lookup(a.token), null);
});

test('login db: expired sessions are rejected', { skip: !sqliteOk }, () => {
  const { token } = auth.createSession(user, {});
  db.raw.prepare(`UPDATE sessions SET expires_at = 1 WHERE token = ?`).run(auth.hash(token));
  assert.equal(auth.lookup(token), null);
});

test('login db: history records events newest first', { skip: !sqliteOk }, () => {
  auth.recordEvent('login', user, 'owner', { ip: '127.0.0.1' });
  auth.recordEvent('failed', null, 'cancelled', {});
  const mine = auth.recentEvents({ userId: '111' });
  assert.ok(mine.length >= 1);
  assert.ok(mine.every((e) => e.userId === '111'));
  assert.equal(auth.recentEvents({ limit: 1 })[0].event, 'failed');
});

test('login: sign-in link uses a server-built redirect and a one-time state', async () => {
  const prev = { id: process.env.DISCORD_CLIENT_ID, s: process.env.DISCORD_CLIENT_SECRET };
  process.env.DISCORD_CLIENT_ID = '123';
  process.env.DISCORD_CLIENT_SECRET = 'x'.repeat(32);
  try {
    assert.equal(auth.callbackUrl('127.0.0.1:8766', 8766), 'http://127.0.0.1:8766/api/auth/discord/callback');
    assert.equal(auth.callbackUrl('evil.example', 8766), 'http://127.0.0.1:8766/api/auth/discord/callback');
    const { authUrl, stateNonce } = auth.startAuth(auth.callbackUrl('localhost:8766', 8766));
    const u = new URL(authUrl);
    assert.equal(u.searchParams.get('scope'), 'identify');
    assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:8766/api/auth/discord/callback');
    assert.equal(u.searchParams.get('state'), stateNonce);
    await assert.rejects(auth.completeAuth('code', 'wrong-state'), /expired/);
  } finally {
    process.env.DISCORD_CLIENT_ID = prev.id; process.env.DISCORD_CLIENT_SECRET = prev.s;
    if (prev.id === undefined) delete process.env.DISCORD_CLIENT_ID;
    if (prev.s === undefined) delete process.env.DISCORD_CLIENT_SECRET;
  }
});

test('login: setup rejects things that are not a client secret', () => {
  assert.throws(() => auth.setupSecret(''), /does not look like/);
  assert.throws(() => auth.setupSecret('has spaces in it and is long enough'), /does not look like/);
  assert.throws(() => auth.setupSecret('short'), /does not look like/);
  assert.throws(() => auth.setEnv('BAD KEY', 'x'), /Bad setting/);
  assert.throws(() => auth.setEnv('OK', 'a\nB=c'), /Bad setting/);
});

test('origins: only the panel, local panels, extensions and Discord', () => {
  const host = '127.0.0.1:8766';
  assert.equal(extras.originAllowed(undefined, host), true);
  assert.equal(extras.originAllowed('http://127.0.0.1:8766', host), true);
  assert.equal(extras.originAllowed('http://localhost:8767', host), true);
  assert.equal(extras.originAllowed('chrome-extension://abc', host), true);
  assert.equal(extras.originAllowed('https://discord.com', host), true);
  assert.equal(extras.originAllowed('https://evil.example', host), false);
  assert.equal(extras.originAllowed('http://127.0.0.1.evil.example', host), false);
  assert.equal(extras.originAllowed('https://discord.com.evil.example', host), false);
  assert.equal(extras.originAllowed('null', host), false);
  process.env.PANEL_ALLOWED_ORIGINS = 'https://panel.example.com/';
  try { assert.equal(extras.originAllowed('https://panel.example.com', host), true); }
  finally { delete process.env.PANEL_ALLOWED_ORIGINS; }
});

test('lock: never enforced before Discord sign-in is set up', () => {
  const prev = { lock: process.env.PANEL_REQUIRE_LOGIN, s: process.env.DISCORD_CLIENT_SECRET, id: process.env.DISCORD_CLIENT_ID };
  try {
    process.env.PANEL_REQUIRE_LOGIN = '1';
    process.env.DISCORD_CLIENT_ID = '123';
    delete process.env.DISCORD_CLIENT_SECRET;
    assert.equal(extras.loginWanted(), true);
    assert.equal(extras.loginRequired(), false);
    process.env.DISCORD_CLIENT_SECRET = 'x'.repeat(32);
    assert.equal(extras.loginRequired(), true);
    assert.equal(extras.rankAtLeast('guest', 'member'), false);
  } finally {
    for (const [k, v] of [['PANEL_REQUIRE_LOGIN', prev.lock], ['DISCORD_CLIENT_SECRET', prev.s], ['DISCORD_CLIENT_ID', prev.id]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
