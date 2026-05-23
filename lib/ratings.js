// Per-user-per-song ratings stored alongside the rest of the config.
const { getGuild, updateGuild } = require('./config');

const getStore = (guildId) => {
  const g = getGuild(guildId);
  if (!g.ratings) g.ratings = {};
  return g.ratings;
};

const songKey = (song) => (song.url || song.id || song.name || '').toString();

const rate = (guildId, userId, song, stars) => {
  if (stars < 1 || stars > 5) throw new Error('Rating must be 1–5.');
  const all = getStore(guildId);
  const key = songKey(song);
  if (!all[key]) all[key] = { name: song.name, url: song.url, ratings: {} };
  all[key].name = song.name;
  all[key].url = song.url;
  all[key].ratings[userId] = stars;
  updateGuild(guildId, { ratings: all });
};

const aggregate = (guildId) => {
  const all = getStore(guildId);
  return Object.entries(all).map(([key, entry]) => {
    const vals = Object.values(entry.ratings);
    const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    return { key, name: entry.name, url: entry.url, avg, count: vals.length };
  });
};

const topRated = (guildId, n = 10) =>
  aggregate(guildId).filter((e) => e.count >= 1).sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, n);

const lowestRated = (guildId, n = 10) =>
  aggregate(guildId).filter((e) => e.count >= 1).sort((a, b) => a.avg - b.avg).slice(0, n);

module.exports = { rate, topRated, lowestRated };
