'use strict';
const { makeStore } = require('./_store');
const s = makeStore('appeals.json');

const list = (gid) => s.forGuild(gid).slice().sort((a, b) => b.createdAt - a.createdAt);

const submit = (gid, { userId, userTag, reason, type }) => {
  const a = {
    id: s.id('a-'), userId, userTag: userTag || null,
    reason: String(reason || '').slice(0, 1500),
    type: ['ban', 'mute', 'timeout', 'kick', 'other'].includes(type) ? type : 'other',
    status: 'pending', resolvedBy: null, resolution: null, createdAt: Date.now(),
  };
  s.forGuild(gid).push(a); s.save();
  return a;
};

const resolve = (gid, id, status, by, note) => {
  const a = s.forGuild(gid).find((x) => x.id === id);
  if (!a) return null;
  if (['approved', 'denied'].includes(status)) {
    a.status = status; a.resolvedBy = by || null; a.resolution = note || null; s.save();
  }
  return a;
};

const remove = (gid, id) => {
  const arr = s.forGuild(gid); const n = arr.length;
  s.state[gid] = arr.filter((x) => x.id !== id);
  if (s.state[gid].length !== n) { s.save(); return true; }
  return false;
};

module.exports = { list, submit, resolve, remove };
