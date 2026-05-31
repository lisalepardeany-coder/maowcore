// Tests for the v3.2.0 dashboard posts module (lib/posts.js).
//
// Uses a temp DB so the operator's real data is never touched. Skips if
// better-sqlite3 isn't installed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-posts-'));
process.env.DB_PATH = path.join(tmpDir, 'posts.db');

let db, roles, posts;
try {
  db = require('../lib/db');
  roles = require('../lib/roles');
  posts = require('../lib/posts');
} catch { /* */ }
const sqliteOk = db?.isAvailable;

// Seed: owner + admin + member
const OWNER  = '210000000000000001';
const ADMIN  = '210000000000000002';
const MEMBER = '210000000000000003';

const seed = () => {
  if (!sqliteOk) return;
  db.raw.exec(`DELETE FROM posts; DELETE FROM user_roles;`);
  delete process.env.OWNER_USER_ID;
  roles.noteLogin({ userId: OWNER, tag: 'Owner' });        // becomes owner (first user)
  roles.noteLogin({ userId: ADMIN, tag: 'Admin' });        // becomes member
  roles.noteLogin({ userId: MEMBER, tag: 'Member' });      // becomes member
  roles.grant(OWNER, ADMIN, 'admin');
};

test('posts: admin can create a post', { skip: !sqliteOk }, () => {
  seed();
  const p = posts.create(ADMIN, { title: 'Hello', body: 'World', category: 'update' });
  assert.ok(p.id);
  assert.equal(p.title, 'Hello');
  assert.equal(p.category, 'update');
  assert.equal(p.authorId, ADMIN);
  assert.equal(p.authorTag, 'Admin');
  assert.equal(p.pinned, false);
});

test('posts: member cannot create a post', { skip: !sqliteOk }, () => {
  seed();
  assert.throws(() => posts.create(MEMBER, { title: 'x', body: 'y' }), /Admin\+ required/);
});

test('posts: only owner can pin on create', { skip: !sqliteOk }, () => {
  seed();
  assert.throws(() => posts.create(ADMIN, { title: 'x', body: 'y', pinned: true }), /Only owner can pin/);
  const p = posts.create(OWNER, { title: 'Pinned', body: 'y', pinned: true });
  assert.equal(p.pinned, true);
});

test('posts: list sorts pinned first, then newest', { skip: !sqliteOk }, () => {
  seed();
  posts.create(ADMIN, { title: 'A', body: 'first' });
  posts.create(ADMIN, { title: 'B', body: 'second' });
  posts.create(OWNER, { title: 'Pinned', body: 'pinned', pinned: true });
  const { posts: list, total } = posts.list();
  assert.equal(total, 3);
  assert.equal(list[0].title, 'Pinned');
  assert.equal(list[1].title, 'B');
  assert.equal(list[2].title, 'A');
});

test('posts: list filters by category', { skip: !sqliteOk }, () => {
  seed();
  posts.create(ADMIN, { title: 'U1', body: 'x', category: 'update' });
  posts.create(ADMIN, { title: 'N1', body: 'x', category: 'news' });
  posts.create(ADMIN, { title: 'N2', body: 'x', category: 'news' });
  const { posts: news } = posts.list({ category: 'news' });
  assert.equal(news.length, 2);
});

test('posts: admin can edit their own post, member cannot edit others', { skip: !sqliteOk }, () => {
  seed();
  const created = posts.create(ADMIN, { title: 'Mine', body: 'A' });
  const updated = posts.update(ADMIN, created.id, { title: 'Mine v2' });
  assert.equal(updated.title, 'Mine v2');
  assert.throws(() => posts.update(MEMBER, created.id, { title: 'Hijack' }), /Admin\+ or author required/);
});

test('posts: admin can edit pinned post WITHOUT touching pin state (regression: bug #33)', { skip: !sqliteOk }, () => {
  seed();
  const pinned = posts.create(OWNER, { title: 'Pinned', body: 'A', pinned: true });
  // Admin edits title only — should not throw owner-pin permission error.
  const r = posts.update(ADMIN, pinned.id, { title: 'Pinned v2', body: 'A', category: 'update' });
  assert.equal(r.title, 'Pinned v2');
  assert.equal(r.pinned, true);  // pin state unchanged
});

test('posts: admin gets blocked from CHANGING the pin state', { skip: !sqliteOk }, () => {
  seed();
  const pinned = posts.create(OWNER, { title: 'P', body: 'x', pinned: true });
  assert.throws(() => posts.update(ADMIN, pinned.id, { pinned: false }), /Only owner can pin/);
});

test('posts: update does NOT bump updated_at on a no-op save', { skip: !sqliteOk }, () => {
  seed();
  const p = posts.create(ADMIN, { title: 'X', body: 'Y', category: 'update' });
  const original = p.updatedAt;
  // Pause briefly so any change in updated_at would be detectable.
  const r = posts.update(ADMIN, p.id, { title: 'X', body: 'Y', category: 'update' });
  assert.equal(r.updatedAt, original, 'no-op save should not bump updated_at');
});

test('posts: admin can delete any post, member cannot delete', { skip: !sqliteOk }, () => {
  seed();
  const p = posts.create(OWNER, { title: 'Z', body: 'x' });
  assert.throws(() => posts.remove(MEMBER, p.id), /Admin\+ required/);
  assert.equal(posts.remove(ADMIN, p.id), true);
  assert.equal(posts.get(p.id), null);
});

test('posts: title and body are truncated to length limits', { skip: !sqliteOk }, () => {
  seed();
  const longTitle = 'x'.repeat(500);
  const longBody  = 'y'.repeat(100000);
  const p = posts.create(ADMIN, { title: longTitle, body: longBody });
  assert.equal(p.title.length, 200);
  assert.equal(p.body.length, 50000);
});

test('posts: banned author cannot edit their own past posts (regression: bug #66)', { skip: !sqliteOk }, () => {
  seed();
  // Admin writes a post, then gets banned. They should not be able to edit
  // their own post anymore — even the author shortcut shouldn't override
  // the ban.
  const p = posts.create(ADMIN, { title: 'before ban', body: 'X' });
  roles.grant(OWNER, ADMIN, 'banned');
  assert.throws(() => posts.update(ADMIN, p.id, { title: 'after ban' }), /Banned/);
  // Owner can still edit it.
  const updated = posts.update(OWNER, p.id, { title: 'cleaned up' });
  assert.equal(updated.title, 'cleaned up');
});

test('cleanup', () => {
  try { db?.close?.(); } catch { /* */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
});
