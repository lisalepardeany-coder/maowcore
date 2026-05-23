// Holds the most-recent queue snapshot per guild so a stop/clear can be undone.
const snapshots = new Map();   // guildId -> { songs: [Song], expiresAt }
const TIMERS = new Map();      // guildId -> setTimeout id
const TTL_MS = 5 * 60 * 1000;  // undo available for 5 minutes

const capture = (guildId, queue) => {
  if (!queue?.songs?.length) return;
  // Store the full Song objects so we can use queue.songs.push(song) directly later
  snapshots.set(guildId, { songs: queue.songs.slice(), capturedAt: Date.now() });
  const prev = TIMERS.get(guildId);
  if (prev) clearTimeout(prev);
  TIMERS.set(guildId, setTimeout(() => snapshots.delete(guildId), TTL_MS));
};

const get = (guildId) => snapshots.get(guildId) || null;
const clear = (guildId) => {
  snapshots.delete(guildId);
  const t = TIMERS.get(guildId);
  if (t) { clearTimeout(t); TIMERS.delete(guildId); }
};

module.exports = { capture, get, clear, TTL_MS };
