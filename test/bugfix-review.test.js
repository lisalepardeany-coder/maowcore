// Fixes from the 3.16.0 bug review: dashboard sessions, role order, birthdays,
// staged restores, coin transfers without XP, constant-time token compare.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ── #1 Discord sessions are rank-checked even without the login lock ─────────
test('a Discord sign-in without a rank cannot use owner/admin API (login lock off)', () => {
  const prev = { lock: process.env.PANEL_REQUIRE_LOGIN, open: process.env.PANEL_OPEN_SIGNUP };
  delete process.env.PANEL_REQUIRE_LOGIN; delete process.env.PANEL_OPEN_SIGNUP;
  const auth = require('../lib/dashboard-auth');
  const realLookup = auth.lookup;
  auth.lookup = (t) => (t === 'stranger' ? { userId: '909090909090909090', tag: 'stranger' } : null);
  try {
    const extras = require('../lib/panel-extras');
    const control = { authToken: 'secret-token', _json: (res, body, status = 200) => { res.status = status; res.body = body; } };
    const run = (method, p, headers) => {
      const res = {};
      const handled = extras.handle({ method, headers: { host: 'x', ...headers }, socket: {} }, res, p, control, new URL(`http://x${p}`));
      return { handled, ...res };
    };
    for (const p of ['/api/dev/db/query', '/api/control/restart', '/api/mod/ban', '/api/admin/welcome']) {
      const r = run('POST', p, { 'x-maow-session': 'stranger' });
      assert.equal(r.handled, true, p);
      assert.equal(r.status, 403, p);
    }
    // The dashboard token still opens everything.
    const ok = run('POST', '/api/mod/ban', { authorization: 'Bearer secret-token' });
    assert.notEqual(ok.status, 403);
    // A guest may still use the listen room.
    assert.notEqual(run('GET', '/api/listen/state', { 'x-maow-session': 'stranger' }).status, 403);
  } finally {
    auth.lookup = realLookup;
    for (const [k, v] of [['PANEL_REQUIRE_LOGIN', prev.lock], ['PANEL_OPEN_SIGNUP', prev.open]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test('WebSocket: a guest session cannot connect or send commands without the login lock', () => {
  const extras = require('../lib/panel-extras');
  const ws = { maowWho: { who: 'x', rank: 'guest', userId: '1' } };
  assert.equal(extras.wsCommandAllowed(ws, { action: 'skip' }), false);
  assert.equal(extras.wsCommandAllowed({ maowWho: { who: 'x', rank: 'moderator', userId: '1' } }, { action: 'skip' }), true);
  assert.equal(extras.wsCommandAllowed({ maowWho: { who: 'control token', rank: 'owner' } }, { action: 'skip' }), true);
});

// ── #3/#4 Discord role order ────────────────────────────────────────────────
const { canAssignRole, canModerate } = require('../lib/hierarchy');
const guild = { ownerId: '1' };
const mem = (id, pos) => ({ id, guild, roles: { highest: { position: pos } } });

test('canAssignRole: only roles below your own highest role (server owner: any)', () => {
  assert.equal(canAssignRole(mem('5', 10), { position: 9 }), true);
  assert.equal(canAssignRole(mem('5', 10), { position: 10 }), false);
  assert.equal(canAssignRole(mem('5', 10), { position: 20 }), false);
  assert.equal(canAssignRole(mem('1', 0), { position: 50 }), true);
});

test('canModerate: only members below you; never the owner; self only when allowed', () => {
  assert.equal(canModerate(mem('5', 10), mem('6', 9)), true);
  assert.equal(canModerate(mem('5', 10), mem('6', 10)), false);
  assert.equal(canModerate(mem('5', 10), mem('6', 11)), false);
  assert.equal(canModerate(mem('5', 99), mem('1', 0)), false);           // server owner
  assert.equal(canModerate(mem('1', 0), mem('6', 50)), true);            // owner acts on anyone
  assert.equal(canModerate(mem('5', 10), mem('5', 10)), false);
  assert.equal(canModerate(mem('5', 10), mem('5', 10), { allowSelf: true }), true);
  assert.equal(canModerate(mem('5', 10), null), true);                    // ban by ID, not in server
});

// ── #7 one birthday list ────────────────────────────────────────────────────
test('birthday-store reads both old shapes and keeps settings', () => {
  const { norm } = require('../lib/birthday-store');
  const mixed = { people: { '111111111111111111': { d: 1, m: 2 } }, '222222222222222222': { d: 3, m: 4 }, channelId: 'c', lastRun: '2026-1-1' };
  const n = norm(mixed);
  assert.deepEqual(Object.keys(n.people).sort(), ['111111111111111111', '222222222222222222']);
  assert.equal(n.channelId, 'c');
  assert.ok(!('channelId' in n.people) && !('people' in n.people));
  // /community's channel setting is the fallback; /birthday setup "off" (null) stays off.
  assert.equal(norm({}, { birthdayChannelId: 'g' }).channelId, 'g');
  assert.equal(norm({ channelId: null }, { birthdayChannelId: 'g' }).channelId, null);
});

// ── #5 restores are staged and applied on the next start ────────────────────
test('pending-restore stages files and swaps them in (dropping the db -wal)', () => {
  const pr = require('../lib/pending-restore');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-pr-'));
  const cfg = path.join(dir, 'config.json'); const dbf = path.join(dir, 'maow.db');
  fs.writeFileSync(cfg, 'old'); fs.writeFileSync(dbf, 'olddb'); fs.writeFileSync(`${dbf}-wal`, 'stale');
  try {
    pr.stage(cfg, 'new');
    pr.stage(dbf, Buffer.from('newdb'), { isDb: true });
    assert.equal(fs.readFileSync(cfg, 'utf8'), 'old');            // untouched until the next start
    assert.equal(pr.pending().length, 2);
    assert.equal(pr.apply(), 2);
    assert.equal(fs.readFileSync(cfg, 'utf8'), 'new');
    assert.equal(fs.readFileSync(dbf, 'utf8'), 'newdb');
    assert.equal(fs.existsSync(`${dbf}-wal`), false);
    assert.equal(pr.apply(), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── #6 moving coins gives no XP ─────────────────────────────────────────────
test('economy.award with xp:false adds coins only', () => {
  const economy = require('../lib/economy');
  const gid = `g${Date.now()}`;
  const before = economy.getUser(gid, 'u1');
  economy.award(gid, 'u1', 500, 'pay', { xp: false });
  const after = economy.getUser(gid, 'u1');
  assert.equal(after.coins - before.coins, 500);
  assert.equal(after.xp, before.xp);
  assert.equal(after.level, before.level);
  economy.award(gid, 'u1', 1, 'work');
  assert.ok(economy.getUser(gid, 'u1').xp > before.xp || economy.getUser(gid, 'u1').level > before.level);
});

// ── #10 constant-time token compare ─────────────────────────────────────────
test('tokenEq', () => {
  const { tokenEq } = require('../lib/token-eq');
  assert.equal(tokenEq('abc', 'abc'), true);
  assert.equal(tokenEq('abd', 'abc'), false);
  assert.equal(tokenEq('', 'abc'), false);
  assert.equal(tokenEq(undefined, 'abc'), false);
  assert.equal(tokenEq('abc', ''), false);
});
