'use strict';
const { makeStore } = require('./_store');
const s = makeStore('tickets.json');

const list = (gid) => s.forGuild(gid).slice().sort((a, b) => b.createdAt - a.createdAt);

const open = (gid, { subject, openedBy, openedTag, channelId }) => {
  const t = {
    id: s.id('t-'), subject: String(subject || 'Support request').slice(0, 200),
    openedBy, openedTag: openedTag || null, channelId: channelId || null,
    status: 'open', claimedBy: null, createdAt: Date.now(), closedAt: null,
  };
  s.forGuild(gid).push(t); s.save();
  return t;
};

const claim = (gid, id, userId, userTag) => {
  const t = s.forGuild(gid).find((x) => x.id === id);
  if (!t) return null;
  t.claimedBy = userTag || userId; t.status = 'claimed'; s.save();
  return t;
};

const close = (gid, id) => {
  const t = s.forGuild(gid).find((x) => x.id === id);
  if (!t) return null;
  t.status = 'closed'; t.closedAt = Date.now(); s.save();
  return t;
};

const remove = (gid, id) => {
  const arr = s.forGuild(gid); const n = arr.length;
  s.state[gid] = arr.filter((x) => x.id !== id);
  if (s.state[gid].length !== n) { s.save(); return true; }
  return false;
};

module.exports = { list, open, claim, close, remove };
