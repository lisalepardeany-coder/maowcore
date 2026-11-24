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

const C = '123456789012345678';

test('owners: both built-in owners count with no setting at all', () => {
  withOwners('', () => {
    assert.deepStrictEqual(owners.ids(), [A, B]);
    assert.strictEqual(owners.primary(), A);
    assert.ok(owners.isOwner(A) && owners.isOwner(B));
  });
  // A server that only lists one of them still knows the other.
  withOwners(A, () => assert.deepStrictEqual(owners.ids(), [A, B]));
});

test('owners: OWNER_USER_ID adds more, split by commas/spaces, without duplicates', () => {
  withOwners(`${C}`, () => assert.deepStrictEqual(owners.ids(), [A, B, C]));
  withOwners(` ${B} , ${C} `, () => assert.deepStrictEqual(owners.ids(), [A, B, C]));
  withOwners(`${A} ${C}`, () => assert.deepStrictEqual(owners.ids(), [A, B, C]));
});

test('owners: junk is ignored; strangers aren\'t owners', () => {
  withOwners('not-an-id,,', () => assert.deepStrictEqual(owners.ids(), [A, B]));
  withOwners('', () => {
    assert.ok(!owners.isOwner(C));
    assert.ok(!owners.isOwner(''));
  });
});

test('roles: root owners are always owner and pass every rank check', () => {
  withOwners(`${A},${B}`, () => {
    assert.strictEqual(roles.rankOf(B), 'owner');
    assert.ok(roles.check(B, 'owner'));
    assert.ok(roles.check(B, 'admin'));
    assert.strictEqual(roles.check(B, 'banned'), false);
  });
});

test('roles: the Ranks list shows root owners who never signed in', { skip: !roles.hasTable() && 'needs SQLite' }, () => {
  withOwners(`${A},${B}`, () => {
    const rows = roles.list().filter((r) => r.userId === A || r.userId === B);
    assert.strictEqual(rows.length, 2);
    assert.ok(rows.every((r) => r.rank === 'owner' && r.permanent));
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
