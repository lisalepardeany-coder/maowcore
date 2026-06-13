'use strict';
const { makeStore } = require('./_store');
const s = makeStore('suggestions.json');

const list = (gid) => s.forGuild(gid).slice().sort((a, b) => b.createdAt - a.createdAt);

const add = (gid, { text, authorId, authorTag }) => {
  const item = { id: s.id('s-'), text: String(text || '').slice(0, 1000), authorId, authorTag, up: [], down: [], status: 'open', createdAt: Date.now() };
  s.forGuild(gid).push(item); s.save();
  return item;
};

const vote = (gid, id, userId, dir) => {
  const item = s.forGuild(gid).find((x) => x.id === id);
  if (!item) return null;
  item.up = item.up.filter((u) => u !== userId);
  item.down = item.down.filter((u) => u !== userId);
  if (dir === 'up') item.up.push(userId);
  else if (dir === 'down') item.down.push(userId);
  s.save();
  return item;
};

const setStatus = (gid, id, status) => {
  const item = s.forGuild(gid).find((x) => x.id === id);
  if (!item) return null;
  if (['open', 'approved', 'denied', 'implemented'].includes(status)) { item.status = status; s.save(); }
  return item;
};

const remove = (gid, id) => {
  const arr = s.forGuild(gid); const n = arr.length;
  s.state[gid] = arr.filter((x) => x.id !== id);
  if (s.state[gid].length !== n) { s.save(); return true; }
  return false;
};

module.exports = { list, add, vote, setStatus, remove };
