// Dashboard posts/announcements (v3.2.0).
//
// Backed by the SQLite `posts` table (schema v2). Rank gates enforced via
// lib/roles.js:
//   - read:    any signed-in user
//   - create:  admin+
//   - update:  admin+ (can edit any post) OR author themselves
//   - delete:  admin+
//   - pin:     owner only
//
// Body stored as raw markdown. Caller is responsible for rendering (or
// trusting it). The dashboard runs body through escapeHtmlSafe + a tiny
// markdown shim before display.

const db = require('./db');
const roles = require('./roles');

const CATEGORIES = ['update', 'announcement', 'changelog', 'news'];

const hasTable = () => {
  if (!db.isAvailable) return false;
  try {
    return !!db.raw.prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='posts'`,
    ).get();
  } catch { return false; }
};

const list = ({ limit = 50, offset = 0, category = null } = {}) => {
  if (!hasTable()) return { posts: [], total: 0 };
  const where = category ? `WHERE category = ?` : '';
  const args = category ? [category] : [];
  const total = db.raw.prepare(
    `SELECT COUNT(*) AS n FROM posts ${where}`,
  ).get(...args).n;
  const rows = db.raw.prepare(
    `SELECT * FROM posts ${where} ORDER BY pinned DESC, created_at DESC LIMIT ? OFFSET ?`,
  ).all(...args, limit, offset);
  return { posts: rows.map(rowToPost), total };
};

const get = (id) => {
  if (!hasTable()) return null;
  const r = db.raw.prepare(`SELECT * FROM posts WHERE id = ?`).get(id);
  return r ? rowToPost(r) : null;
};

const create = (callerUserId, { title, body, category, pinned }) => {
  if (!hasTable()) throw new Error('Posts unavailable (SQLite not loaded).');
  if (!callerUserId) throw new Error('Not signed in.');
  if (!roles.check(callerUserId, 'admin')) throw new Error('Admin+ required.');
  if (!title || !body) throw new Error('title and body are required.');
  const wantPin = !!pinned;
  if (wantPin && !roles.check(callerUserId, 'owner')) {
    throw new Error('Only owner can pin posts.');
  }
  const cat = CATEGORIES.includes(category) ? category : 'update';
  const author = roles.get(callerUserId);
  const now = Date.now();
  const info = db.raw.prepare(`
    INSERT INTO posts (title, body, category, pinned, author_id, author_tag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(title).slice(0, 200),
    String(body).slice(0, 50000),
    cat,
    wantPin ? 1 : 0,
    callerUserId,
    author?.tag || null,
    now, now,
  );
  return get(info.lastInsertRowid);
};

const update = (callerUserId, id, patch) => {
  if (!hasTable()) throw new Error('Posts unavailable.');
  if (!callerUserId) throw new Error('Not signed in.');
  const post = get(id);
  if (!post) throw new Error('Post not found.');
  // Banned users can never edit anything, even their own posts. The author
  // shortcut only applies to non-banned authors.
  if (roles.rankOf(callerUserId) === 'banned') throw new Error('Banned users cannot edit posts.');
  const isAdmin = roles.check(callerUserId, 'admin');
  const isAuthor = post.authorId === callerUserId;
  if (!isAdmin && !isAuthor) throw new Error('Admin+ or author required.');
  const sets = [];
  const args = [];

  // Only build SET clauses for fields that actually changed. Avoids
  // updated_at bumps on no-op edits, and avoids the pin-permission check
  // firing when an admin edits a pinned post without changing the pin state.
  if (typeof patch.title === 'string') {
    const v = patch.title.slice(0, 200);
    if (v !== post.title) { sets.push('title = ?'); args.push(v); }
  }
  if (typeof patch.body === 'string') {
    const v = patch.body.slice(0, 50000);
    if (v !== post.body) { sets.push('body = ?'); args.push(v); }
  }
  if (typeof patch.category === 'string' && CATEGORIES.includes(patch.category)
      && patch.category !== post.category) {
    sets.push('category = ?'); args.push(patch.category);
  }
  if (typeof patch.pinned === 'boolean' && !!patch.pinned !== post.pinned) {
    // Only owner can change the pin state.
    if (!roles.check(callerUserId, 'owner')) throw new Error('Only owner can pin/unpin.');
    sets.push('pinned = ?'); args.push(patch.pinned ? 1 : 0);
  }
  if (!sets.length) return post;
  sets.push('updated_at = ?'); args.push(Date.now());
  args.push(id);
  db.raw.prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  return get(id);
};

const remove = (callerUserId, id) => {
  if (!hasTable()) throw new Error('Posts unavailable.');
  if (!callerUserId) throw new Error('Not signed in.');
  if (!roles.check(callerUserId, 'admin')) throw new Error('Admin+ required.');
  const info = db.raw.prepare(`DELETE FROM posts WHERE id = ?`).run(id);
  return info.changes > 0;
};

const rowToPost = (r) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  category: r.category,
  pinned: !!r.pinned,
  authorId: r.author_id,
  authorTag: r.author_tag,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

module.exports = { list, get, create, update, remove, CATEGORIES };
