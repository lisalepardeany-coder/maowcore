// Per-guild user warnings stored in the config.
const { getGuild, updateGuild } = require('./config');

const getStore = (guildId) => {
  const g = getGuild(guildId);
  if (!g.warnings) g.warnings = {};
  return g.warnings;
};

const add = (guildId, userId, reason, modId) => {
  const all = getStore(guildId);
  if (!all[userId]) all[userId] = [];
  all[userId].push({ ts: Date.now(), reason, modId });
  updateGuild(guildId, { warnings: all });
  return all[userId].length;
};

const list = (guildId, userId) => getStore(guildId)[userId] || [];
const listAll = (guildId) => getStore(guildId);
const clear = (guildId, userId) => {
  const all = getStore(guildId);
  delete all[userId];
  updateGuild(guildId, { warnings: all });
};

module.exports = { add, list, listAll, clear };
