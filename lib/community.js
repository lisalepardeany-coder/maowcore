'use strict';
// lib/community.js — birthdays, confessions, and events/RSVP (stored in guild config).

const { getGuild, updateGuild } = require('./config');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const validDM = (d, m) => Number.isInteger(d) && Number.isInteger(m) && m >= 1 && m <= 12 && d >= 1 && d <= 31;

// "25/12", "25-12", "25 dec", "dec 25" → { d, m }  (null if unparseable)
function parseDate(str) {
  if (!str) return null;
  str = String(str).trim().toLowerCase();
  let m = str.match(/^(\d{1,2})[\/\-. ](\d{1,2})$/);
  if (m) { const d = +m[1], mo = +m[2]; return validDM(d, mo) ? { d, m: mo } : null; }
  m = str.match(/^(\d{1,2})\s*([a-z]{3,})$/);
  if (m) { const d = +m[1], mo = MONTHS.indexOf(m[2].slice(0, 3)) + 1; return mo && validDM(d, mo) ? { d, m: mo } : null; }
  m = str.match(/^([a-z]{3,})\s*(\d{1,2})$/);
  if (m) { const mo = MONTHS.indexOf(m[1].slice(0, 3)) + 1, d = +m[2]; return mo && validDM(d, mo) ? { d, m: mo } : null; }
  return null;
}
const fmtDate = (b) => b ? `${b.d} ${MONTH_NAMES[b.m - 1]}` : '—';

// ── birthdays ────────────────────────────────────────────────────────────────
const birthdays = (gid) => getGuild(gid).birthdays || {};
function setBirthday(gid, uid, d, m) { const b = { ...birthdays(gid) }; b[uid] = { d, m }; updateGuild(gid, { birthdays: b }); }
function removeBirthday(gid, uid) { const b = { ...birthdays(gid) }; delete b[uid]; updateGuild(gid, { birthdays: b }); }
const getBirthday = (gid, uid) => birthdays(gid)[uid] || null;
function todaysBirthdays(gid, now = new Date()) {
  const d = now.getDate(), m = now.getMonth() + 1;
  return Object.entries(birthdays(gid)).filter(([, b]) => b.d === d && b.m === m).map(([uid]) => uid);
}
const upcomingBirthdays = (gid) => Object.entries(birthdays(gid))
  .map(([uid, b]) => ({ uid, ...b })).sort((a, b) => (a.m - b.m) || (a.d - b.d));

// ── confessions ──────────────────────────────────────────────────────────────
function nextConfessNumber(gid) { const n = (getGuild(gid).confessCount || 0) + 1; updateGuild(gid, { confessCount: n }); return n; }

// ── events ───────────────────────────────────────────────────────────────────
const events = (gid) => getGuild(gid).events || {};
function createEvent(gid, ev) {
  const id = 'e' + Math.abs(Date.now()).toString(36).slice(-6);
  const all = { ...events(gid) };
  all[id] = { ...ev, going: [], maybe: [], no: [] };
  updateGuild(gid, { events: all });
  return id;
}
const getEvent = (gid, id) => events(gid)[id] || null;
function rsvp(gid, id, uid, status) {
  const all = { ...events(gid) };
  const e = all[id];
  if (!e) return null;
  for (const k of ['going', 'maybe', 'no']) e[k] = (e[k] || []).filter((x) => x !== uid);
  if (['going', 'maybe', 'no'].includes(status)) e[status].push(uid);
  updateGuild(gid, { events: all });
  return e;
}
function cancelEvent(gid, id) { const all = { ...events(gid) }; const e = all[id]; delete all[id]; updateGuild(gid, { events: all }); return e; }
function setEventMessage(gid, id, channelId, messageId) {
  const all = { ...events(gid) };
  if (all[id]) { all[id].channelId = channelId; all[id].messageId = messageId; updateGuild(gid, { events: all }); }
}
const listEvents = (gid) => Object.entries(events(gid)).map(([id, e]) => ({ id, ...e }));

// Shared rendering (used by /community event create AND the RSVP button handler).
function eventEmbed(e) {
  const list = (arr) => (arr && arr.length) ? arr.map((u) => `<@${u}>`).join(' ').slice(0, 1024) : '—';
  return new EmbedBuilder().setColor(0xEB459E).setTitle(`📅  ${e.title}`)
    .setDescription(e.desc || '*No description.*')
    .addFields(
      { name: '🕒 When', value: e.when || 'TBD', inline: false },
      { name: `✅ Going (${(e.going || []).length})`, value: list(e.going), inline: true },
      { name: `❔ Maybe (${(e.maybe || []).length})`, value: list(e.maybe), inline: true },
      { name: `❌ Can't (${(e.no || []).length})`, value: list(e.no), inline: true },
    )
    .setFooter({ text: `Hosted by ${e.hostTag || 'staff'} · RSVP below` });
}
function eventButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rsvp:${id}:going`).setLabel('Going').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rsvp:${id}:maybe`).setLabel('Maybe').setEmoji('❔').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rsvp:${id}:no`).setLabel("Can't").setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
}

module.exports = {
  parseDate, fmtDate, MONTH_NAMES,
  setBirthday, removeBirthday, getBirthday, todaysBirthdays, upcomingBirthdays,
  nextConfessNumber,
  createEvent, getEvent, rsvp, cancelEvent, setEventMessage, listEvents,
  eventEmbed, eventButtons,
};
