'use strict';
const { makeStore } = require('./_store');
const s = makeStore('polls.json');

const list = (gid) => s.forGuild(gid).slice().sort((a, b) => b.createdAt - a.createdAt);

const create = (gid, { question, options, authorId }) => {
  const opts = (options || []).map((t) => String(t).slice(0, 100)).filter(Boolean).slice(0, 10);
  if (!question || opts.length < 2) throw new Error('A question and at least 2 options are required.');
  const poll = { id: s.id('p-'), question: String(question).slice(0, 300), options: opts.map((text) => ({ text, votes: [] })), closed: false, authorId, createdAt: Date.now() };
  s.forGuild(gid).push(poll); s.save();
  return poll;
};

const vote = (gid, id, optionIdx, userId) => {
  const poll = s.forGuild(gid).find((x) => x.id === id);
  if (!poll || poll.closed) return null;
  poll.options.forEach((o) => { o.votes = o.votes.filter((u) => u !== userId); });
  if (poll.options[optionIdx]) poll.options[optionIdx].votes.push(userId);
  s.save();
  return poll;
};

const close = (gid, id) => {
  const poll = s.forGuild(gid).find((x) => x.id === id);
  if (poll) { poll.closed = true; s.save(); }
  return poll;
};

const remove = (gid, id) => {
  const arr = s.forGuild(gid); const n = arr.length;
  s.state[gid] = arr.filter((x) => x.id !== id);
  if (s.state[gid].length !== n) { s.save(); return true; }
  return false;
};

module.exports = { list, create, vote, close, remove };
