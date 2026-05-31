// Dashboard user roles (v3.2.0).
//
// Five ranks, ordered: banned < member < moderator < admin < owner.
// Discord user IDs (from OAuth sessions) map to ranks. Check functions
// compare against required rank using the ladder.
//
// Bootstrap behavior:
//   - If OWNER_USER_ID is set in .env, that user becomes owner on first
//     access (creates the row).
//   - Otherwise the FIRST Discord user to log in becomes the owner.
//   - Any subsequent login without a rank record becomes 'member'.
//
// JSON-fallback path is NOT supported for roles — this is a v3.2 feature
// and SQLite is required. If SQLite isn't available, role checks return
// 'member' for everyone (so the bot still works, just no admin gating).

const db = require('./db');

const LADDER = ['banned', 'member', 'moderator', 'admin', 'owner'];
const rankIndex = (r) => LADDER.indexOf(String(r || 'member'));

// Internal: does this user_roles table exist? (Will be false on pre-schema-v2
// installs that haven't migrated yet, or on the JSON fallback path.)
const hasTable = () => {
  if (!db.isAvailable) return false;
  try {
    return !!db.raw.prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_roles'`,
    ).get();
  } catch { return false; }
};

// Has anyone been granted 'owner' yet?
const ownerExists = () => {
  if (!hasTable()) return false;
  const r = db.raw.prepare(`SELECT 1 FROM user_roles WHERE rank = 'owner' LIMIT 1`).get();
  return !!r;
};

// Read a user's role record. Returns null if unknown (caller decides default).
const get = (userId) => {
  if (!userId || !hasTable()) return null;
  const r = db.raw.prepare(`SELECT * FROM user_roles WHERE user_id = ?`).get(userId);
  if (!r) return null;
  return {
    userId: r.user_id, rank: r.rank, tag: r.tag, avatar: r.avatar,
    grantedBy: r.granted_by, grantedAt: r.granted_at, notes: r.notes,
  };
};

// Get user's rank, falling back to 'member' if unknown. Banned users
// return 'banned' (not normalized to 'member') so the auth layer can
// reject them.
const rankOf = (userId) => {
  const r = get(userId);
  if (r) return r.rank;
  return 'member';
};

// Compare a user's rank against a required minimum. Returns true if the
// user is at or above `required`. `banned` users always fail unless the
// requirement IS exactly 'banned'.
const check = (userId, required) => {
  if (!userId) return false;
  // No table = SQLite isn't loaded. Deny everything above 'member' so admin
  // gates fail closed. 'member' checks pass so the basic dashboard still works.
  if (!hasTable()) return required === 'member';
  const userIdx = rankIndex(rankOf(userId));
  const reqIdx = rankIndex(required);
  if (userIdx < 0 || reqIdx < 0) return false;
  // Banned never passes a positive rank check.
  if (rankOf(userId) === 'banned') return required === 'banned';
  return userIdx >= reqIdx;
};

// Resolve who should be the owner. Returns userId or null.
const resolveBootstrapOwner = () => {
  return process.env.OWNER_USER_ID ? String(process.env.OWNER_USER_ID).trim() : null;
};

// Called from the OAuth callback after a successful login AND from
// /api/auth/me so pre-v3.2 sessions get backfilled with a role row on their
// next dashboard load. Records/updates the user's tag + avatar. If they're
// the first user AND no OWNER_USER_ID is set, makes them owner. If
// OWNER_USER_ID matches them, also makes them owner. Otherwise creates
// 'member' if they're new.
//
// The whole INSERT-or-UPDATE is wrapped in a transaction so two simultaneous
// first-time logins can't both win the owner-bootstrap race.
const noteLogin = (user) => {
  if (!user?.userId || !hasTable()) return null;
  return db.raw.transaction(() => {
    const existing = get(user.userId);
    const bootstrapOwnerId = resolveBootstrapOwner();

    if (!existing) {
      // First-ever login flow: assign owner if either (a) OWNER_USER_ID matches,
      // or (b) nobody else is owner yet AND OWNER_USER_ID is not set.
      let rank = 'member';
      let grantedBy = 'self';
      if (bootstrapOwnerId && bootstrapOwnerId === String(user.userId)) {
        rank = 'owner';
        grantedBy = 'bootstrap';
      } else if (!bootstrapOwnerId && !ownerExists()) {
        rank = 'owner';
        grantedBy = 'bootstrap';
      }
      db.raw.prepare(`
        INSERT INTO user_roles (user_id, rank, tag, avatar, granted_by, granted_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(user.userId, rank, user.tag || null, user.avatar || null, grantedBy, Date.now());
    } else {
      // Refresh cached display fields on every login.
      db.raw.prepare(`
        UPDATE user_roles SET tag = ?, avatar = ? WHERE user_id = ?
      `).run(user.tag || existing.tag, user.avatar || existing.avatar, user.userId);
    }
    return get(user.userId);
  })();
};

// Grant a new rank to a user. Requires the caller to be at least admin AND
// strictly higher than both the target's current rank AND the new rank.
// Owner is the only one who can promote to admin.
const grant = (callerId, targetId, newRank, notes) => {
  if (!hasTable()) throw new Error('Roles unavailable (SQLite not loaded).');
  if (!LADDER.includes(newRank)) throw new Error(`Invalid rank: ${newRank}`);
  if (!callerId || !targetId) throw new Error('callerId + targetId required');
  if (callerId === targetId) throw new Error("You can't change your own rank.");

  const caller = get(callerId);
  if (!caller || rankIndex(caller.rank) < rankIndex('admin')) {
    throw new Error('Only admin+ can grant ranks.');
  }
  const target = get(targetId);
  const targetCurrentIdx = target ? rankIndex(target.rank) : rankIndex('member');
  const newRankIdx = rankIndex(newRank);
  const callerIdx = rankIndex(caller.rank);
  // Caller must outrank both the target's current AND the new rank.
  if (callerIdx <= targetCurrentIdx) throw new Error("You can't change the rank of someone at your level or above.");
  if (callerIdx <= newRankIdx)       throw new Error("You can't grant a rank equal to or above your own.");

  if (target) {
    db.raw.prepare(
      `UPDATE user_roles SET rank = ?, granted_by = ?, granted_at = ?, notes = ? WHERE user_id = ?`,
    ).run(newRank, callerId, Date.now(), notes || null, targetId);
  } else {
    db.raw.prepare(`
      INSERT INTO user_roles (user_id, rank, granted_by, granted_at, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(targetId, newRank, callerId, Date.now(), notes || null);
  }
  return get(targetId);
};

const list = () => {
  if (!hasTable()) return [];
  return db.raw.prepare(
    `SELECT user_id, rank, tag, avatar, granted_by, granted_at, notes
     FROM user_roles
     ORDER BY
       CASE rank
         WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2
         WHEN 'member' THEN 3 WHEN 'banned' THEN 4 ELSE 5
       END,
       granted_at DESC`,
  ).all().map((r) => ({
    userId: r.user_id, rank: r.rank, tag: r.tag, avatar: r.avatar,
    grantedBy: r.granted_by, grantedAt: r.granted_at, notes: r.notes,
  }));
};

module.exports = {
  LADDER, rankIndex,
  get, rankOf, check, noteLogin, grant, list, ownerExists, hasTable,
};
