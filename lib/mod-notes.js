'use strict';
// lib/mod-notes.js — private staff notes on members (getGuild(id).modNotes).

const { getGuild, updateGuild } = require('./config');

const store = (guildId) => getGuild(guildId).modNotes || {};

function add(guildId, userId, text, modId) {
  const all = { ...store(guildId) };
  all[userId] = [...(all[userId] || []), { ts: Date.now(), text, modId }];
  updateGuild(guildId, { modNotes: all });
  return all[userId].length;
}
const list = (guildId, userId) => store(guildId)[userId] || [];
function remove(guildId, userId, index) {
  const all = { ...store(guildId) };
  const arr = [...(all[userId] || [])];
  if (index < 1 || index > arr.length) return false;
  arr.splice(index - 1, 1);
  if (arr.length) all[userId] = arr; else delete all[userId];
  updateGuild(guildId, { modNotes: all });
  return true;
}
function clear(guildId, userId) {
  const all = { ...store(guildId) };
  delete all[userId];
  updateGuild(guildId, { modNotes: all });
}

module.exports = { add, list, remove, clear };
