// Tick-off checklists (meds, routines…). Each user can have several; each has
// items and an optional daily time when the bot DMs it with tick buttons.
// Stored in data/checklists.json. Ticks are kept per day for streaks.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = process.env.NODE_TEST_CONTEXT
  ? path.join(require('node:os').tmpdir(), `maow-checklists-${process.pid}.json`)
  : path.join(__dirname, '..', 'data', 'checklists.json');
const MAX_LISTS = 20; const MAX_ITEMS = 20; const KEEP_DAYS = 60;

let state = null;
const load = () => {
  if (state) return state;
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { state = { lists: [] }; }
  if (!Array.isArray(state.lists)) state.lists = [];
  return state;
};
const save = () => {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state)); fs.renameSync(`${FILE}.tmp`, FILE); }
  catch (e) { console.warn('[checklists] save failed:', e.message); }
};

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const forUser = (userId) => load().lists.filter((l) => l.userId === String(userId));
const get = (id) => load().lists.find((l) => l.id === String(id)) || null;
const findByName = (userId, name) => forUser(userId).find((l) => l.name.toLowerCase() === String(name || '').trim().toLowerCase()) || null;

const create = ({ userId, name, items, at = null, profile = null }) => {
  load();
  const clean = String(items || '').split(/[,\n]/).map((s) => s.trim().slice(0, 80)).filter(Boolean).slice(0, MAX_ITEMS);
  if (!String(name || '').trim()) throw new Error('Give the checklist a name.');
  if (!clean.length) throw new Error('Add at least one item (separate them with commas).');
  if (at && !HHMM.test(at)) throw new Error('Time looks like 09:00.');
  if (forUser(userId).length >= MAX_LISTS) throw new Error(`Up to ${MAX_LISTS} checklists.`);
  if (findByName(userId, name)) throw new Error('You already have a checklist with that name.');
  const list = { id: crypto.randomBytes(4).toString('hex'), userId: String(userId), name: String(name).trim().slice(0, 40), items: clean, at: at || null, profile: profile || null, done: {}, sentOn: null, nudgedOn: null, createdAt: Date.now() };
  state.lists.push(list); save();
  return list;
};
const remove = (userId, id) => { load(); const n = state.lists.length; state.lists = state.lists.filter((l) => !(l.id === id && l.userId === String(userId))); save(); return state.lists.length < n; };
const update = (userId, id, patch) => {
  const l = get(id);
  if (!l || l.userId !== String(userId)) throw new Error('Checklist not found.');
  if ('at' in patch) { if (patch.at && !HHMM.test(patch.at)) throw new Error('Time looks like 09:00.'); l.at = patch.at || null; }
  if ('items' in patch) l.items = String(patch.items).split(/[,\n]/).map((s) => s.trim().slice(0, 80)).filter(Boolean).slice(0, MAX_ITEMS);
  if ('name' in patch && String(patch.name).trim()) l.name = String(patch.name).trim().slice(0, 40);
  save(); return l;
};

// Ticks for today (or a given day).
const ticked = (l, day = dayKey()) => l.done?.[day] || [];
const toggle = (userId, id, idx, day = dayKey()) => {
  const l = get(id);
  if (!l || l.userId !== String(userId)) throw new Error('Checklist not found.');
  if (idx < 0 || idx >= l.items.length) throw new Error('No such item.');
  const t = new Set(ticked(l, day));
  if (t.has(idx)) t.delete(idx); else t.add(idx);
  l.done = l.done || {};
  l.done[day] = [...t].sort((a, b) => a - b);
  // Forget old days.
  const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 86400000));
  for (const k of Object.keys(l.done)) if (k < cutoff) delete l.done[k];
  save();
  return l;
};
// Pure (tested): consecutive fully-done days ending today (or yesterday if today isn't done yet).
const streak = (l, now = new Date()) => {
  const full = (k) => (l.done?.[k] || []).length >= l.items.length && l.items.length > 0;
  let n = 0; const d = new Date(now);
  if (!full(dayKey(d))) d.setDate(d.getDate() - 1);
  while (full(dayKey(d)) && n < 400) { n++; d.setDate(d.getDate() - 1); }
  return n;
};

// The message (embed + tick buttons) for a checklist.
const message = (l, day = dayKey()) => {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const t = new Set(ticked(l, day));
  const all = l.items.length && t.size >= l.items.length;
  const s = streak(l);
  const rows = [];
  for (let i = 0; i < l.items.length && rows.length < 5; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(l.items.slice(i, i + 5).map((it, j) => new ButtonBuilder()
      .setCustomId(`chk:${l.id}:${i + j}`).setLabel(`${t.has(i + j) ? '✓ ' : ''}${it}`.slice(0, 80))
      .setStyle(t.has(i + j) ? ButtonStyle.Success : ButtonStyle.Secondary))));
  }
  return {
    embeds: [new EmbedBuilder().setColor(all ? 0x57f287 : 0x5865f2)
      .setTitle(`${all ? '✅' : '☑️'} ${l.profile?.emoji ? `${l.profile.emoji} ` : ''}${l.name}`)
      .setDescription(`${l.items.map((it, i) => `${t.has(i) ? '✅' : '⬜'} ${it}`).join('\n')}\n\n${all ? '🎉 All done for today!' : `${t.size}/${l.items.length} done`}${s ? ` · 🔥 ${s}-day streak` : ''}`)
      .setFooter({ text: `${day}${l.profile?.name ? ` · ${l.profile.name}` : ''} · tap an item to tick it` })],
    components: rows,
  };
};

// Pure (tested): which lists should be sent / nudged right now?
const due = (lists, now = new Date()) => {
  const today = dayKey(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const send = []; const nudge = [];
  for (const l of lists) {
    if (!l.at) continue;
    const at = toMin(l.at);
    if (l.sentOn !== today && mins >= at && mins < at + 120) send.push(l);
    else if (l.sentOn === today && l.nudgedOn !== today && mins >= at + 120 && (l.done?.[today] || []).length < l.items.length) nudge.push(l);
  }
  return { send, nudge };
};

const tick = async (client) => {
  const now = new Date();
  const { send, nudge } = due(load().lists, now);
  for (const l of [...send, ...nudge]) {
    const isNudge = nudge.includes(l);
    if (isNudge) l.nudgedOn = dayKey(now); else l.sentOn = dayKey(now);
    save();
    // Quiet hours: still send (they're things like meds), but no extra nudges.
    if (isNudge) { try { if (require('./owner-prefs').isQuiet(now) && l.userId === process.env.OWNER_USER_ID) continue; } catch { /* */ } }
    try {
      const user = await client.users.fetch(l.userId);
      await user.send({ content: isNudge ? `🔔 Gentle nudge: **${l.name}** isn't finished yet.` : undefined, ...message(l) });
    } catch (e) { console.warn('[checklists] DM failed:', e.message); }
  }
};

const _reset = () => { state = { lists: [] }; };

module.exports = { create, remove, update, forUser, get, findByName, toggle, ticked, streak, message, due, tick, dayKey, _reset };
