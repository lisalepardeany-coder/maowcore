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

test('roles: ladder is owner > admin > moderator > member > banned', () => {
  assert.deepEqual(roles.LADDER, ['banned', 'member', 'moderator', 'admin', 'owner']);
  assert.equal(roles.rankIndex('owner'), 4);
  assert.equal(roles.rankIndex('banned'), 0);
  assert.equal(roles.rankIndex('member'), 1);
});

test('roles: noteLogin assigns owner when OWNER_USER_ID matches', { skip: !sqliteOk }, () => {
  reset();
  process.env.OWNER_USER_ID = '111111111111111111';
  const r = roles.noteLogin({ userId: '111111111111111111', tag: 'Owner#0001', avatar: null });
  assert.equal(r.rank, 'owner');
  assert.equal(r.grantedBy, 'bootstrap');
  delete process.env.OWNER_USER_ID;
});

test('roles: noteLogin assigns owner to first user when no OWNER_USER_ID', { skip: !sqliteOk }, () => {
  reset();
  delete process.env.OWNER_USER_ID;
  const r = roles.noteLogin({ userId: '222222222222222222', tag: 'First#0001' });
  assert.equal(r.rank, 'owner');
});

test('roles: noteLogin assigns member to second user when owner exists', { skip: !sqliteOk }, () => {
  reset();
  delete process.env.OWNER_USER_ID;
  roles.noteLogin({ userId: '222222222222222222', tag: 'First#0001' });
  const r = roles.noteLogin({ userId: '333333333333333333', tag: 'Second#0002' });
  assert.equal(r.rank, 'member');
  assert.equal(r.grantedBy, 'self');
});

test('roles: noteLogin on an existing user refreshes tag/avatar but not rank', { skip: !sqliteOk }, () => {
  reset();
  delete process.env.OWNER_USER_ID;
  roles.noteLogin({ userId: '444444444444444444', tag: 'Original#0001' });   // owner (first)
  // Promote no-op: re-login should not change rank.
  const r = roles.noteLogin({ userId: '444444444444444444', tag: 'Renamed#9999', avatar: 'http://x/y.png' });
  assert.equal(r.rank, 'owner');
  assert.equal(r.tag, 'Renamed#9999');
  assert.equal(r.avatar, 'http://x/y.png');
});

test('roles: check() respects the ladder', { skip: !sqliteOk }, () => {
  reset();
  delete process.env.OWNER_USER_ID;
  roles.noteLogin({ userId: '555555555555555555', tag: 'Owner' });            // owner
  roles.noteLogin({ userId: '666666666666666666', tag: 'Member' });           // member
  assert.equal(roles.check('555555555555555555', 'admin'), true);
  assert.equal(roles.check('555555555555555555', 'owner'), true);
  assert.equal(roles.check('666666666666666666', 'admin'), false);
  assert.equal(roles.check('666666666666666666', 'member'), true);
});

test('roles: check() rejects banned users on positive ranks', { skip: !sqliteOk }, () => {
  reset();
  delete process.env.OWNER_USER_ID;
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
  delete process.env.OWNER_USER_ID;
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
  delete process.env.OWNER_USER_ID;
  const owner = '141414141414141414';
  roles.noteLogin({ userId: owner, tag: 'Self' });
  assert.throws(() => roles.grant(owner, owner, 'banned'), /change your own rank/);
});

test('roles: grant() accepts pre-grant for a user who has never signed in', { skip: !sqliteOk }, () => {
  reset();
  delete process.env.OWNER_USER_ID;
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
  delete process.env.OWNER_USER_ID;
  roles.noteLogin({ userId: '171717171717171717', tag: 'Owner' });
  const o = '171717171717171717';
  const m = '181818181818181818';
  roles.noteLogin({ userId: m, tag: 'Member' });
  roles.grant(o, m, 'moderator');
  const all = roles.list();
  assert.equal(all[0].rank, 'owner');
  assert.equal(all[1].rank, 'moderator');
});

test('cleanup', () => {
  try { db?.close?.(); } catch { /* */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
});
