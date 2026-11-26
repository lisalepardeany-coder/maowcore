// Tests for the v3.2.0 dashboard roles ladder (lib/roles.js).
//
// Uses a temp DB so the operator's real data is never touched. Skips if
// better-sqlite3 isn't installed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-roles-'));
process.env.DB_PATH = path.join(tmpDir, 'roles.db');

let db, roles;
try { db = require('../lib/db'); roles = require('../lib/roles'); } catch { /* */ }
const sqliteOk = db?.isAvailable;

const reset = () => {
  if (!sqliteOk) return;
  db.raw.exec(`DELETE FROM user_roles`);
};

test('roles: ladder is owner > admin > moderator > member > guest > banned', () => {
  assert.deepEqual(roles.LADDER, ['banned', 'guest', 'member', 'moderator', 'admin', 'owner']);
  assert.equal(roles.rankIndex('owner'), 5);
  assert.equal(roles.rankIndex('banned'), 0);
  assert.equal(roles.rankIndex('member'), 2);
});

test('roles: new sign-ins wait as guest, with or without the login lock, unless sign-up is open', () => {
  const prev = { lock: process.env.PANEL_REQUIRE_LOGIN, open: process.env.PANEL_OPEN_SIGNUP };
  try {
    delete process.env.PANEL_OPEN_SIGNUP;
    process.env.PANEL_REQUIRE_LOGIN = '1';
    assert.equal(roles.newUserRank(), 'guest');
    process.env.PANEL_OPEN_SIGNUP = '1';
    assert.equal(roles.newUserRank(), 'member');
    process.env.PANEL_REQUIRE_LOGIN = '0';
    delete process.env.PANEL_OPEN_SIGNUP;
    assert.equal(roles.newUserRank(), 'guest');   // used to be member: any Discord account got in
  } finally {
    for (const [k, v] of [['PANEL_REQUIRE_LOGIN', prev.lock], ['PANEL_OPEN_SIGNUP', prev.open]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('roles: noteLogin assigns owner when OWNER_USER_ID matches', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '111111111111111111';
  const r = roles.noteLogin({ userId: '111111111111111111', tag: 'Owner#0001', avatar: null });
  assert.equal(r.rank, 'owner');
  assert.equal(r.grantedBy, 'bootstrap');
  delete process.env.OWNER_USER_ID;
});

// The built-in owners (lib/owners.js) always exist, so the first stranger to
// sign in no longer becomes owner.
test('roles: the first stranger to sign in is not made owner', { skip: !sqliteOk }, () => {
  reset();
  delete process.env.OWNER_USER_ID;
  const r = roles.noteLogin({ userId: '222222222222222222', tag: 'First#0001' });
  assert.notEqual(r.rank, 'owner');
});

test('roles: a built-in owner is owner on first sign-in', { skip: !sqliteOk }, () => {
  reset();
  delete process.env.OWNER_USER_ID;
  const r = roles.noteLogin({ userId: '481051702850617346', tag: 'pokeofevil' });
  assert.equal(r.rank, 'owner');
});

test('roles: noteLogin makes a second user a guest (member with open sign-up)', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '222222222222222222';
  const prevOpen = process.env.PANEL_OPEN_SIGNUP;
  try {
    delete process.env.PANEL_OPEN_SIGNUP;
    roles.noteLogin({ userId: '222222222222222222', tag: 'First#0001' });
    const r = roles.noteLogin({ userId: '333333333333333333', tag: 'Second#0002' });
    assert.equal(r.rank, 'guest');
    assert.equal(r.grantedBy, 'self');
    process.env.PANEL_OPEN_SIGNUP = '1';
    assert.equal(roles.noteLogin({ userId: '343434343434343434', tag: 'Third#0003' }).rank, 'member');
  } finally {
    if (prevOpen === undefined) delete process.env.PANEL_OPEN_SIGNUP; else process.env.PANEL_OPEN_SIGNUP = prevOpen;
  }
});

test('roles: noteLogin on an existing user refreshes tag/avatar but not rank', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '444444444444444444';
  roles.noteLogin({ userId: '444444444444444444', tag: 'Original#0001' });   // owner
  // Promote no-op: re-login should not change rank.
  const r = roles.noteLogin({ userId: '444444444444444444', tag: 'Renamed#9999', avatar: 'http://x/y.png' });
  assert.equal(r.rank, 'owner');
  assert.equal(r.tag, 'Renamed#9999');
  assert.equal(r.avatar, 'http://x/y.png');
});

test('roles: check() respects the ladder', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '555555555555555555';
  roles.noteLogin({ userId: '555555555555555555', tag: 'Owner' });            // owner
  roles.noteLogin({ userId: '666666666666666666', tag: 'Member' });           // guest at first
  roles.grant('555555555555555555', '666666666666666666', 'member');          // let in by the owner
  assert.equal(roles.check('555555555555555555', 'admin'), true);
  assert.equal(roles.check('555555555555555555', 'owner'), true);
  assert.equal(roles.check('666666666666666666', 'admin'), false);
  assert.equal(roles.check('666666666666666666', 'member'), true);
});

test('roles: check() rejects banned users on positive ranks', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '777777777777777777';
  const owner = '777777777777777777';
  const target = '888888888888888888';
  roles.noteLogin({ userId: owner, tag: 'Owner' });
  roles.noteLogin({ userId: target, tag: 'Target' });
  roles.grant(owner, target, 'banned');
  assert.equal(roles.check(target, 'member'), false);
  assert.equal(roles.check(target, 'admin'), false);
  assert.equal(roles.check(target, 'banned'), true);
});

test('roles: grant() requires caller to outrank both target and new rank', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '999999999999999999';
  const owner = '999999999999999999';
  const admin = '101010101010101010';
  const member = '121212121212121212';
  roles.noteLogin({ userId: owner, tag: 'O' });
  roles.noteLogin({ userId: admin, tag: 'A' });
  roles.noteLogin({ userId: member, tag: 'M' });
  roles.grant(owner, admin, 'admin');
  // Admin can promote member → moderator.
  roles.grant(admin, member, 'moderator');
  assert.equal(roles.rankOf(member), 'moderator');
  // Admin cannot promote member → admin (equal to own rank).
  assert.throws(() => roles.grant(admin, member, 'admin'), /equal to or above/);
  // Admin cannot demote another admin.
  const admin2 = '131313131313131313';
  roles.noteLogin({ userId: admin2, tag: 'A2' });
  roles.grant(owner, admin2, 'admin');
  assert.throws(() => roles.grant(admin, admin2, 'member'), /at your level or above/);
});

test('roles: grant() blocks self-promotion', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '141414141414141414';
  const owner = '141414141414141414';
  roles.noteLogin({ userId: owner, tag: 'Self' });
  assert.throws(() => roles.grant(owner, owner, 'banned'), /change your own rank/);
});

test('roles: grant() accepts pre-grant for a user who has never signed in', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '151515151515151515';
  const owner = '151515151515151515';
  roles.noteLogin({ userId: owner, tag: 'Owner' });
  const future = '161616161616161616';
  const r = roles.grant(owner, future, 'moderator', 'pre-promoted before first login');
  assert.equal(r.rank, 'moderator');
  assert.equal(r.tag, null);
  assert.equal(r.notes, 'pre-promoted before first login');
});

test('roles: list() sorts owner first, then admin, then moderator, etc.', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '171717171717171717';
  roles.noteLogin({ userId: '171717171717171717', tag: 'Owner' });
  const o = '171717171717171717';
  const m = '181818181818181818';
  roles.noteLogin({ userId: m, tag: 'Member' });
  roles.grant(o, m, 'moderator');
  // Leave out the built-in owners who never signed in (listed first, not stored).
  const all = roles.list().filter((r) => r.grantedBy !== 'OWNER_USER_ID');
  assert.equal(all[0].rank, 'owner');
  assert.equal(all[1].rank, 'moderator');
});

test('cleanup', () => {
  try { db?.close?.(); } catch { /* */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
});
