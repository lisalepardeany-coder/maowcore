// Panel profiles: several personal setups under one Discord account (for a
// system's headmates, or just "work" vs "chill"). Each profile keeps its own
// theme, sound/comfort settings, Home layout and favourite songs. One can be
// marked as "fronting" — shown only in the panel, never posted to Discord.
const crypto = require('node:crypto');
const db = require('./db');

const MAX_PROFILES = 30;
const MAX_PREFS_BYTES = 64 * 1024;
const MAX_FAVS = 200;

const ok = () => db.isAvailable && !!db.raw;
const need = () => { if (!ok()) throw new Error('Profiles need the database (better-sqlite3).'); };

const shape = (r) => ({
  id: r.id, name: r.name, emoji: r.emoji, color: r.color, pronouns: r.pronouns,
  prefs: safeJson(r.prefs, {}), favorites: safeJson(r.favorites, []),
  fronting: !!r.fronting, sort: r.sort, createdAt: r.created_at, updatedAt: r.updated_at,
});
const safeJson = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const clean = (s, n) => (s == null ? null : String(s).trim().slice(0, n) || null);
const COLOR = /^#[0-9a-f]{6}$/i;

const list = (userId) => {
  if (!ok()) return [];
  return db.raw.prepare(`SELECT * FROM panel_profiles WHERE user_id = ? ORDER BY sort, created_at`).all(String(userId)).map(shape);
};

const save = (userId, input = {}) => {
  need();
  const uid = String(userId);
  const name = clean(input.name, 40);
  if (!name) throw new Error('Give the profile a name.');
  const prefs = JSON.stringify(input.prefs && typeof input.prefs === 'object' ? input.prefs : {});
  if (prefs.length > MAX_PREFS_BYTES) throw new Error('Those settings are too big to save.');
  const favs = Array.isArray(input.favorites) ? input.favorites.slice(0, MAX_FAVS)
    .filter((f) => f && typeof f.url === 'string' && /^https?:\/\//.test(f.url))
    .map((f) => ({ name: clean(f.name, 200) || f.url, url: f.url.slice(0, 500) })) : null;
  const now = Date.now();
  const existing = input.id ? db.raw.prepare(`SELECT * FROM panel_profiles WHERE id = ? AND user_id = ?`).get(String(input.id), uid) : null;
  if (existing) {
    db.raw.prepare(`UPDATE panel_profiles SET name = ?, emoji = ?, color = ?, pronouns = ?, prefs = ?, favorites = COALESCE(?, favorites), updated_at = ? WHERE id = ?`)
      .run(name, clean(input.emoji, 8), COLOR.test(input.color || '') ? input.color : existing.color, clean(input.pronouns, 30), prefs, favs ? JSON.stringify(favs) : null, now, existing.id);
    return shape(db.raw.prepare(`SELECT * FROM panel_profiles WHERE id = ?`).get(existing.id));
  }
  const count = db.raw.prepare(`SELECT COUNT(*) n FROM panel_profiles WHERE user_id = ?`).get(uid).n;
  if (count >= MAX_PROFILES) throw new Error(`You can have up to ${MAX_PROFILES} profiles.`);
  const id = crypto.randomBytes(6).toString('hex');
  db.raw.prepare(`INSERT INTO panel_profiles (id, user_id, name, emoji, color, pronouns, prefs, favorites, fronting, sort, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
    .run(id, uid, name, clean(input.emoji, 8), COLOR.test(input.color || '') ? input.color : '#5865f2', clean(input.pronouns, 30), prefs, JSON.stringify(favs || []), count, now, now);
  return shape(db.raw.prepare(`SELECT * FROM panel_profiles WHERE id = ?`).get(id));
};

const remove = (userId, id) => {
  need();
  return db.raw.prepare(`DELETE FROM panel_profiles WHERE id = ? AND user_id = ?`).run(String(id), String(userId)).changes > 0;
};

// Mark one profile as fronting (or none with id = null).
const setFront = (userId, id) => {
  need();
  const uid = String(userId);
  return db.raw.transaction(() => {
    db.raw.prepare(`UPDATE panel_profiles SET fronting = 0 WHERE user_id = ?`).run(uid);
    if (id) {
      const r = db.raw.prepare(`UPDATE panel_profiles SET fronting = 1, updated_at = ? WHERE id = ? AND user_id = ?`).run(Date.now(), String(id), uid);
      if (!r.changes) throw new Error('Profile not found.');
    }
    return list(uid).find((p) => p.fronting) || null;
  })();
};

module.exports = { list, save, remove, setFront, MAX_PROFILES };
