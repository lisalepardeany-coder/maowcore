// v3.2.4 — per-user opt-in for "bot follows me between voice channels."
//
// When a user has opted in AND they're the requester of the currently-playing
// song AND they move voice channels, the bot follows them. Default = off.
//
// Storage piggybacks on the per-guild config JSON (no schema migration
// needed). Each guild has a `voiceFollowUsers: string[]` array of user IDs.
//
// Edge cases the listener in index.js handles (not this module):
//   - AFK channel:           bot stays put
//   - No perms in new channel: bot stays put, warn
//   - User leaves voice:     bot stays put
//   - Bot isn't playing:     no-op (nothing to migrate)
//   - User isn't requester:  no-op (not their bot to drag around)

const { getGuild, updateGuild } = require('./config');

const list = (guildId) => {
  const cfg = getGuild(guildId);
  return Array.isArray(cfg.voiceFollowUsers) ? cfg.voiceFollowUsers : [];
};

const isEnabled = (guildId, userId) => {
  if (!guildId || !userId) return false;
  return list(guildId).includes(String(userId));
};

const setEnabled = (guildId, userId, enabled) => {
  if (!guildId || !userId) return false;
  const current = new Set(list(guildId));
  const uid = String(userId);
  if (enabled) current.add(uid);
  else current.delete(uid);
  updateGuild(guildId, { voiceFollowUsers: [...current] });
  return enabled;
};

const toggle = (guildId, userId) => {
  const next = !isEnabled(guildId, userId);
  setEnabled(guildId, userId, next);
  return next;
};

module.exports = { list, isEnabled, setEnabled, toggle };
