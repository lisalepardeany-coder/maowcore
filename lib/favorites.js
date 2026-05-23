// Per-user-per-guild starred songs.
const { getGuild, updateGuild } = require('./config');

const getStore = (guildId) => {
  const g = getGuild(guildId);
  if (!g.favorites) g.favorites = {};
  return g.favorites;
};

const listFor = (guildId, userId) => {
  const store = getStore(guildId);
  return store[userId] || [];
};

const add = (guildId, userId, song) => {
  if (!song?.url) throw new Error('Cannot favorite a song without a URL.');
  const all = getStore(guildId);
  const userList = all[userId] || [];
  if (userList.some((s) => s.url === song.url)) return false; // already favorited
  userList.unshift({
    url: song.url,
    name: song.name,
    duration: song.duration,
    formattedDuration: song.formattedDuration,
    thumbnail: song.thumbnail || null,
    addedAt: Date.now(),
  });
  if (userList.length > 200) userList.pop();
  all[userId] = userList;
  updateGuild(guildId, { favorites: all });
  return true;
};

const remove = (guildId, userId, url) => {
  const all = getStore(guildId);
  const userList = all[userId] || [];
  const next = userList.filter((s) => s.url !== url);
  if (next.length === userList.length) return false;
  all[userId] = next;
  updateGuild(guildId, { favorites: all });
  return true;
};

const has = (guildId, userId, url) => {
  return listFor(guildId, userId).some((s) => s.url === url);
};

module.exports = { add, remove, has, listFor };
