// Tracks A-B loop windows per guild. Polls every 500ms; when currentTime
// reaches `end`, seeks back to `start`. Auto-clears when the song changes.

const loops = new Map();   // guildId -> { start, end, songUrl }
const timers = new Map();  // guildId -> intervalId

const stop = (guildId) => {
  const t = timers.get(guildId);
  if (t) clearInterval(t);
  timers.delete(guildId);
  loops.delete(guildId);
};

const start = (distube, guildId, songUrl, startSec, endSec) => {
  stop(guildId);
  loops.set(guildId, { start: startSec, end: endSec, songUrl });
  const id = setInterval(() => {
    const queue = distube.getQueue(guildId);
    const loop = loops.get(guildId);
    if (!queue?.songs?.length || !loop) return stop(guildId);
    if (queue.songs[0].url !== loop.songUrl) return stop(guildId);
    if ((queue.currentTime || 0) >= loop.end) {
      try { queue.seek(loop.start); } catch { /* ignored */ }
    }
  }, 500);
  timers.set(guildId, id);
};

const get = (guildId) => loops.get(guildId);

module.exports = { start, stop, get };
