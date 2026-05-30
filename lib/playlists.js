// User-scoped saved playlists, stored alongside the rest of the config.
const { getGuild, updateGuild } = require('./config');

const MAX_NAME = 32;
const MAX_SONGS = 200;
const MAX_PER_USER = 50;

// Sanitize playlist name. Coerce to string and reject the literal "undefined"
// or empty strings so a malformed save (e.g. queue with no song name) can't
// pollute the manifest with "undefined" keys that later render as
// "undefined / undefined / undefined" in slash-command autocomplete dropdowns.
const sanitize = (name) => {
  const s = String(name == null ? '' : name).trim();
  if (s === 'undefined' || s === 'null') return '';
  return s.slice(0, MAX_NAME);
};

const getStore = (guildId) => {
  const g = getGuild(guildId);
  if (!g.playlists) g.playlists = {};
  return g.playlists;
};

const listFor = (guildId, userId) => {
  const store = getStore(guildId);
  return store[userId] || {};
};

const save = (guildId, userId, name, urls) => {
  if (!urls?.length) throw new Error('Nothing to save — queue is empty.');
  if (urls.length > MAX_SONGS) throw new Error(`Too many songs (max ${MAX_SONGS}).`);
  name = sanitize(name);
  if (!name) throw new Error('Playlist name is empty.');
  const all = getStore(guildId);
  const userLists = all[userId] || {};
  if (!userLists[name] && Object.keys(userLists).length >= MAX_PER_USER) {
    throw new Error(`You already have ${MAX_PER_USER} playlists. Delete one first.`);
  }
  userLists[name] = urls.slice(0, MAX_SONGS);
  all[userId] = userLists;
  updateGuild(guildId, { playlists: all });
  return userLists[name].length;
};

const load = (guildId, userId, name) => {
  const userLists = listFor(guildId, userId);
  const urls = userLists[sanitize(name)];
  if (!urls) throw new Error(`No playlist named **${name}**.`);
  return urls;
};

const remove = (guildId, userId, name) => {
  name = sanitize(name);
  const all = getStore(guildId);
  if (!all[userId]?.[name]) throw new Error(`No playlist named **${name}**.`);
  delete all[userId][name];
  updateGuild(guildId, { playlists: all });
};

module.exports = { save, load, remove, listFor };
