// Persistent reminders (data/reminders.json), now with repeats and snooze.
//
// Entry: { id, userId, channelId|null, what, fireAt, repeat|null, createdAt }
//   repeat: 'hourly' | 'daily' | 'weekdays' | 'weekly' | null
// Fired one-shot reminders are kept for 2 days in `recent` so the Snooze
// buttons on the delivered message can bring them back.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = process.env.NODE_TEST_CONTEXT
  ? path.join(require('node:os').tmpdir(), `maow-reminders-${process.pid}.json`)
  : path.join(__dirname, '..', 'data', 'reminders.json');
const RECENT_MS = 2 * 86400000;
const MAX_PER_USER = 50;
const REPEATS = ['hourly', 'daily', 'weekdays', 'weekly'];

let state = { reminders: [], recent: [] };

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    state = { reminders: Array.isArray(parsed?.reminders) ? parsed.reminders : [], recent: Array.isArray(parsed?.recent) ? parsed.recent : [] };
    // Older files used numeric ids (Date.now() + Math.random()).
    for (const r of state.reminders) r.id = String(r.id);
  } catch (e) {
    state = { reminders: [], recent: [] };
    if (e.code !== 'ENOENT') console.warn('[reminders] load failed:', e.message);
  }
};

const save = () => {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state));
    fs.renameSync(`${FILE}.tmp`, FILE);
  } catch (e) { console.warn('[reminders] save failed:', e.message); }
};

const newId = () => crypto.randomBytes(5).toString('hex');

// ===== Time parsing (pure, unit tested) =====
// Accepts durations ("30min", "2h30m", "1d"), clock times ("9:00", "21:30",
// "9am", "9:15pm") and "tomorrow …". Returns a timestamp or 0.
const parseDuration = (s) => {
  if (!s) return 0;
  const re = /(\d+)\s*(d|h|m|min|s|sec)/gi;
  let total = 0;
  let m;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    total += n * (u.startsWith('d') ? 86400000 : u.startsWith('h') ? 3600000 : u.startsWith('s') ? 1000 : 60000);
  }
  return total;
};

const parseWhen = (input, now = Date.now()) => {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return 0;
  const clock = s.match(/^(tomorrow\s+(?:at\s+)?)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (clock && (clock[3] || clock[4] || clock[1])) {
    let h = Number(clock[2]);
    const min = Number(clock[3] || 0);
    if (clock[4] === 'pm' && h < 12) h += 12;
    if (clock[4] === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return 0;
    const d = new Date(now);
    d.setHours(h, min, 0, 0);
    if (clock[1]) d.setDate(d.getDate() + 1);
    else if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  if (s === 'tomorrow') return now + 86400000;
  const ms = parseDuration(s);
  return ms >= 1000 ? now + ms : 0;
};

// Next time a repeating reminder fires after `from` (skips missed ones).
const nextFire = (fireAt, repeat, from = Date.now()) => {
  let t = fireAt;
  const step = (x) => {
    const d = new Date(x);
    if (repeat === 'hourly') return x + 3600000;
    if (repeat === 'weekly') { d.setDate(d.getDate() + 7); return d.getTime(); }
    d.setDate(d.getDate() + 1);
    if (repeat === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.getTime();
  };
  let guard = 0;
  do { t = step(t); } while (t <= from && guard++ < 10000);
  return t;
};

// ===== Store =====
const add = (entry) => {
  const repeat = REPEATS.includes(entry.repeat) ? entry.repeat : null;
  if (state.reminders.filter((r) => r.userId === entry.userId).length >= MAX_PER_USER) {
    throw new Error(`You already have ${MAX_PER_USER} reminders. Cancel some first.`);
  }
  const r = {
    id: newId(),
    userId: String(entry.userId),
    channelId: entry.channelId || null,
    what: String(entry.what || '').slice(0, 500),
    fireAt: Number(entry.fireAt),
    repeat,
    // Optional panel profile (headmate) this reminder belongs to.
    profile: entry.profile && entry.profile.name ? { id: String(entry.profile.id || '').slice(0, 20), name: String(entry.profile.name).slice(0, 40), emoji: String(entry.profile.emoji || '').slice(0, 8) } : null,
    createdAt: Date.now(),
  };
  state.reminders.push(r);
  save();
  return r;
};

const remove = (id) => {
  const before = state.reminders.length;
  state.reminders = state.reminders.filter((r) => r.id !== String(id));
  save();
  return state.reminders.length < before;
};

const cancel = (id, userId) => {
  const r = state.reminders.find((x) => x.id === String(id));
  if (!r || (userId && r.userId !== String(userId))) return false;
  return remove(id);
};

// Called by the ticker after delivering. Repeating ones move to their next
// time; one-shots move to `recent` (for Snooze).
const markFired = (r, now = Date.now()) => {
  const live = state.reminders.find((x) => x.id === r.id);
  if (live?.repeat) {
    live.fireAt = nextFire(live.fireAt, live.repeat, now);
  } else {
    state.reminders = state.reminders.filter((x) => x.id !== r.id);
    state.recent.push({ ...r, firedAt: now });
  }
  state.recent = state.recent.filter((x) => now - x.firedAt < RECENT_MS).slice(-500);
  save();
};

// Snooze a delivered reminder (or push a repeating one's next time).
const snooze = (id, userId, ms, now = Date.now()) => {
  const live = state.reminders.find((x) => x.id === String(id) && x.userId === String(userId));
  if (live?.repeat) {
    // Repeating: add a one-off copy so the schedule stays the same.
    return add({ userId: live.userId, channelId: live.channelId, what: live.what, fireAt: now + ms, profile: live.profile });
  }
  const old = state.recent.find((x) => x.id === String(id) && x.userId === String(userId));
  if (!old) return null;
  state.recent = state.recent.filter((x) => x !== old);
  return add({ userId: old.userId, channelId: old.channelId, what: old.what, fireAt: now + ms, profile: old.profile });
};

const stopRepeat = (id, userId) => {
  const live = state.reminders.find((x) => x.id === String(id) && x.userId === String(userId));
  if (!live) return false;
  state.reminders = state.reminders.filter((x) => x !== live);
  save();
  return true;
};

const due = (now = Date.now()) => state.reminders.filter((r) => r.fireAt <= now);
const all = () => state.reminders.slice().sort((a, b) => a.fireAt - b.fireAt);
const forUser = (userId) => all().filter((r) => r.userId === String(userId));
const _reset = () => { state = { reminders: [], recent: [] }; };

load();
module.exports = { add, remove, cancel, markFired, snooze, stopRepeat, due, all, forUser, parseWhen, parseDuration, nextFire, REPEATS, _reset };
