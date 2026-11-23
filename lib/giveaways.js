'use strict';
const { makeStore } = require('./_store');
const s = makeStore('giveaways.json');

const list = (gid) => s.forGuild(gid).slice().sort((a, b) => b.createdAt - a.createdAt);

const create = (gid, { prize, winners, endsAt, authorId }) => {
  const g = {
    id: s.id('g-'), prize: String(prize || 'Prize').slice(0, 200),
    winners: Math.max(1, Math.min(20, Number(winners) || 1)),
    endsAt: Number(endsAt) || Date.now() + 86400000,
    entries: [], ended: false, winnersList: [], authorId, createdAt: Date.now(),
  };
  s.forGuild(gid).push(g); s.save();
  return g;
};

const enter = (gid, id, userId) => {
  const g = s.forGuild(gid).find((x) => x.id === id);
  if (!g || g.ended) return null;
  if (!g.entries.includes(userId)) { g.entries.push(userId); s.save(); }
  return g;
};

const draw = (gid, id) => {
  const g = s.forGuild(gid).find((x) => x.id === id);
  if (!g) return null;
  const pool = [...g.entries];
  const picked = [];
  while (picked.length < g.winners && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  g.winnersList = picked; g.ended = true; s.save();
  return g;
};

const remove = (gid, id) => {
  const arr = s.forGuild(gid); const n = arr.length;
  s.state[gid] = arr.filter((x) => x.id !== id);
  if (s.state[gid].length !== n) { s.save(); return true; }
  return false;
};

module.exports = { list, create, enter, draw, remove };
