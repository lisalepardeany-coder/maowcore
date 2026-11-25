// Listen room without Discord voice: when the bot isn't playing in a voice
// channel, the listen room keeps its own queue and plays it in the browser.
//
// There is no player here, just a shared clock: the first song started at
// `startedAt`, so everyone who opens the page computes the same position and
// hears the same spot (/api/listen/audio streams from there).
// Nobody on the page for a minute → the clock stops, so songs don't run out
// while no one is listening.
const IDLE_MS = 60_000;        // no one asked for the state this long = nobody listening
const MAX_SONGS = 100;

const queues = new Map();      // guildId -> { songs, startedAt, pausedAt, lastSeen, seen: Map<userId, ts> }

const get = (guildId) => queues.get(guildId) || null;

// Pure-ish: bring the clock up to `now` (drop finished songs, account for idle time).
const tick = (guildId, now = Date.now()) => {
  const q = queues.get(guildId);
  if (!q) return null;
  // Nobody listened for a while: freeze time from IDLE_MS after the last visit.
  if (!q.pausedAt && q.lastSeen && now - q.lastSeen > IDLE_MS) q.pausedAt = q.lastSeen + IDLE_MS;
  const clock = q.pausedAt || now;
  while (q.songs.length && q.songs[0].duration && clock - q.startedAt >= q.songs[0].duration * 1000) {
    q.startedAt += q.songs[0].duration * 1000;
    q.songs.shift();
  }
  if (!q.songs.length) { queues.delete(guildId); return null; }
  return q;
};

// Someone has the page open: keeps the clock running (and resumes it).
const touch = (guildId, userId, now = Date.now()) => {
  const q = queues.get(guildId);
  if (!q) return;
  if (q.pausedAt && !q.manual) {          // was frozen because nobody listened
    q.startedAt += now - q.pausedAt;
    q.pausedAt = null;
  }
  q.lastSeen = now;
  if (userId) q.seen.set(userId, now);
};

const position = (guildId, now = Date.now()) => {
  const q = tick(guildId, now);
  if (!q) return null;
  return { song: q.songs[0], at: Math.max(0, ((q.pausedAt || now) - q.startedAt) / 1000), paused: !!q.pausedAt && q.manual };
};

// People who had the page open in the last 15 s (for skip votes).
const listeners = (guildId, now = Date.now()) => {
  const q = queues.get(guildId);
  if (!q) return [];
  return [...q.seen].filter(([, t]) => now - t < 15_000).map(([id]) => id);
};

// song: { name, url, duration (s), thumbnail, by, byId }
const add = (guildId, songs, now = Date.now()) => {
  let q = tick(guildId, now);
  if (!q) {
    q = { songs: [], startedAt: now, pausedAt: null, manual: false, lastSeen: now, seen: new Map() };
    queues.set(guildId, q);
  }
  const room = MAX_SONGS - q.songs.length;
  if (room <= 0) throw new Error(`The listen room queue is full (${MAX_SONGS} songs).`);
  q.songs.push(...songs.slice(0, room));
  return Math.min(songs.length, room);
};

const skip = (guildId, now = Date.now()) => {
  const q = tick(guildId, now);
  if (!q) return null;
  q.songs.shift();
  q.startedAt = q.pausedAt || now;
  if (!q.songs.length) { queues.delete(guildId); return null; }
  return q.songs[0];
};

// Paused by a person (not the idle freeze): stays paused until resumed.
const setPaused = (guildId, paused, now = Date.now()) => {
  const q = tick(guildId, now);
  if (!q) return false;
  if (paused) { q.pausedAt ||= now; q.manual = true; }
  if (!paused && q.pausedAt) { q.startedAt += now - q.pausedAt; q.pausedAt = null; q.manual = false; }
  return true;
};

const clear = (guildId) => queues.delete(guildId);

module.exports = { get, tick, touch, position, listeners, add, skip, setPaused, clear, IDLE_MS, MAX_SONGS };
