// Owner preferences that the bot itself needs to know (not just the browser):
// quiet hours, and whether health alerts are held during them.
// Stored in data/owner-prefs.json.
const fs = require('node:fs');
const path = require('node:path');

const FILE = process.env.NODE_TEST_CONTEXT
  ? path.join(require('node:os').tmpdir(), `maow-owner-prefs-${process.pid}.json`)
  : path.join(__dirname, '..', 'data', 'owner-prefs.json');

const DEFAULTS = {
  quiet: { enabled: false, start: '23:00', end: '08:00', holdAlerts: true, gentle: true },
};

let prefs = null;
const load = () => {
  if (prefs) return prefs;
  try { const p = JSON.parse(fs.readFileSync(FILE, 'utf8')); prefs = { ...DEFAULTS, ...p, quiet: { ...DEFAULTS.quiet, ...(p.quiet || {}) } }; }
  catch { prefs = JSON.parse(JSON.stringify(DEFAULTS)); }
  return prefs;
};
const save = () => {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(prefs, null, 2)); }
  catch (e) { console.warn('[owner-prefs] save failed:', e.message); }
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

// Pure (tested): is `date` inside the window? Windows can cross midnight.
const inWindow = (start, end, date = new Date()) => {
  if (!HHMM.test(start) || !HHMM.test(end) || start === end) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const a = toMin(start); const b = toMin(end);
  return a < b ? now >= a && now < b : now >= a || now < b;
};

const isQuiet = (date) => { const q = load().quiet; return !!q.enabled && inWindow(q.start, q.end, date); };

const get = () => load();
const update = (patch = {}) => {
  load();
  if (patch.quiet && typeof patch.quiet === 'object') {
    const q = { ...prefs.quiet };
    if ('enabled' in patch.quiet) q.enabled = !!patch.quiet.enabled;
    if ('holdAlerts' in patch.quiet) q.holdAlerts = !!patch.quiet.holdAlerts;
    if ('gentle' in patch.quiet) q.gentle = !!patch.quiet.gentle;
    for (const k of ['start', 'end']) {
      if (k in patch.quiet) {
        if (!HHMM.test(String(patch.quiet[k]))) throw new Error('Times look like 23:00.');
        q[k] = String(patch.quiet[k]);
      }
    }
    prefs.quiet = q;
  }
  save();
  return prefs;
};

const _reset = () => { prefs = null; try { fs.unlinkSync(FILE); } catch { /* */ } };

module.exports = { get, update, isQuiet, inWindow, _reset };
