const test = require('node:test');
const assert = require('node:assert');
const owners = require('../lib/owners');
const roles = require('../lib/roles');

const A = '168281178309132288';
const B = '481051702850617346';
const withOwners = (value, fn) => {
  const before = process.env.OWNER_USER_ID;
  process.env.OWNER_USER_ID = value;
  try { fn(); } finally { if (before === undefined) delete process.env.OWNER_USER_ID; else process.env.OWNER_USER_ID = before; }
};

test('owners: one ID, or several split by commas/spaces', () => {
  withOwners(A, () => assert.deepStrictEqual(owners.ids(), [A]));
  withOwners(`${A},${B}`, () => assert.deepStrictEqual(owners.ids(), [A, B]));
  withOwners(` ${A} , ${B} `, () => assert.deepStrictEqual(owners.ids(), [A, B]));
  withOwners(`${A} ${B}`, () => assert.deepStrictEqual(owners.ids(), [A, B]));
});

test('owners: the first is the main owner; junk is ignored', () => {
  withOwners(`${A},${B}`, () => {
    assert.strictEqual(owners.primary(), A);
    assert.ok(owners.isOwner(A) && owners.isOwner(B));
    assert.ok(!owners.isOwner('123456789012345678'));
    assert.ok(!owners.isOwner(''));
  });
  withOwners('not-an-id,,', () => { assert.deepStrictEqual(owners.ids(), []); assert.strictEqual(owners.primary(), null); });
  withOwners('', () => assert.strictEqual(owners.isOwner(A), false));
});

test('roles: root owners are always owner and pass every rank check', () => {
  withOwners(`${A},${B}`, () => {
    assert.strictEqual(roles.rankOf(B), 'owner');
    assert.ok(roles.check(B, 'owner'));
    assert.ok(roles.check(B, 'admin'));
    assert.strictEqual(roles.check(B, 'banned'), false);
  });
});

test('roles: a root owner\'s rank can\'t be changed by anyone', () => {
  withOwners(`${A},${B}`, () => {
    if (!roles.hasTable()) {
      assert.throws(() => roles.grant(A, B, 'banned'), /SQLite/);
      return;
    }
    assert.throws(() => roles.grant(A, B, 'banned'), /permanent owner/);
  });
});
