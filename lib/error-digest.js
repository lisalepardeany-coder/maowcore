'use strict';
// lib/error-digest.js — one DM a day to the main owner with yesterday's errors,
// grouped so one broken feature is one line ("lyrics: Genius timeout ×14"),
// not fifty. Fed by ControlServer.log() for every error-level entry.
//
// Kept in data/error-digest.json so a restart doesn't lose the day's count.
// ERROR_DIGEST=0 turns the DM off. Nothing is sent for a day without errors.

const path = require('node:path');
const { readJson, writeJson } = require('./safe-json');

const FILE = path.join(__dirname, '..', 'data', 'error-digest.json');
const MAX_GROUPS = 200;
const SHOW_GROUPS = 15;

let state = null;
let timer = null;

const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function load() {
  if (!state) state = readJson(FILE, { days: {} }, { valid: (d) => d && typeof d === 'object' && d.days, label: 'error digest' });
  return state;
}
function flush() {
  clearTimeout(timer); timer = null;
  if (state && !process.env.NODE_TEST_CONTEXT) { try { writeJson(FILE, state); } catch (e) { console.warn('[error-digest] save failed:', e.message); } }
}
const scheduleSave = () => { if (!timer) { timer = setTimeout(flush, 10_000); timer.unref?.(); } };

/**
 * Pure: the grouping key for an error line. Numbers, IDs, durations, URLs and
 * quoted bits are replaced so "✕ /play failed (812ms): Video 'abc' unavailable"
 * and "... (90ms): Video 'xyz' unavailable" land in the same group.
 */
function groupKey(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/(["'`]).*?\1/g, '<…>')
    .replace(/\(\d+ ?ms\)/g, '')
    .replace(/\b\d{5,}\b/g, '<id>')
    .replace(/\d+(\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function note(entry, now = Date.now()) {
  if (!entry?.text) return;
  const s = load();
  const day = (s.days[dayKey(now)] ||= { total: 0, groups: {} });
  day.total++;
  let key = groupKey(entry.text);
  if (!day.groups[key] && Object.keys(day.groups).length >= MAX_GROUPS) key = '<other>';
  let g = day.groups[key];
  if (!g) {
    const sample = key === '<other>' ? 'Other errors (too many kinds to list)' : String(entry.text).slice(0, 300);
    g = day.groups[key] = { sample, count: 0, servers: {}, lastAt: 0 };
  }
  g.count++;
  g.lastAt = now;
  const server = entry.meta?.guild;
  if (server && server !== 'DM') g.servers[server] = (g.servers[server] || 0) + 1;
  scheduleSave();
}

/** Pure: the digest text for one day's bucket. */
function format(day) {
  const groups = Object.values(day.groups).sort((a, b) => b.count - a.count);
  const lines = groups.slice(0, SHOW_GROUPS).map((g) => {
    const top = Object.entries(g.servers).sort((a, b) => b[1] - a[1])[0];
    const where = top ? ` · mostly in ${top[0]}` : '';
    return `**×${g.count}** \`${g.sample.slice(0, 180).replace(/`/g, "'")}\`${where}`;
  });
  if (groups.length > SHOW_GROUPS) lines.push(`…and ${groups.length - SHOW_GROUPS} more kinds of error.`);
  return lines.join('\n');
}

/** Send every finished day that has errors (normally just yesterday), then forget it. */
async function sendDue(client, now = Date.now()) {
  const s = load();
  const today = dayKey(now);
  const due = Object.keys(s.days).filter((d) => d < today).sort();
  if (!due.length) return 0;
  const owner = require('./owners').primary();
  const on = process.env.ERROR_DIGEST !== '0' && owner && client?.isReady?.();
  if (!on) {                                // nobody to tell: just drop old days
    if (process.env.ERROR_DIGEST === '0' || !owner) { for (const d of due) delete s.days[d]; scheduleSave(); }
    return 0;
  }
  let sent = 0;
  for (const d of due) {
    const day = s.days[d];
    if (day?.total) {
      try {
        const user = await client.users.fetch(owner);
        await user.send({ embeds: [{
          color: 0xf59e0b,
          title: `🧾 ${day.total} error${day.total === 1 ? '' : 's'} on ${d}`,
          description: format(day).slice(0, 3900),
          footer: { text: 'MaowCore daily error digest · turn off with ERROR_DIGEST=0' },
        }] });
        sent++;
      } catch (e) { console.warn('[error-digest] DM failed:', e.message); return sent; }   // keep it for next time
    }
    delete s.days[d];
  }
  scheduleSave();
  return sent;
}

function start(client) {
  const tick = () => sendDue(client).catch((e) => console.warn('[error-digest]', e.message));
  setTimeout(tick, 60_000).unref?.();                     // after a restart, catch up
  setInterval(tick, 30 * 60_000).unref?.();               // shortly after midnight otherwise
}

function _reset(next = { days: {} }) { state = next; }

module.exports = { note, groupKey, format, sendDue, start, flush, dayKey, _reset };
