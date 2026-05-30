// Power-user automation for v2.5.0.
//
// Three primitives, all persisted to data/automation.json:
//
//   1. Cron actions      — run a dashboard command on a schedule
//   2. Incoming webhooks — POST /api/automation/hook/:token triggers an action
//   3. Conditional rules — fire when a triggering event matches (best-effort,
//      bot-side events only: voice-join, voice-leave, play-end, queue-empty)
//
// The runner is intentionally tiny: 1-min tick checks cron entries by
// matching cron expressions (5-field: m h dom mon dow). Webhook + rule
// dispatch is event-driven, not polled.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PATH = path.join(__dirname, '..', 'data', 'automation.json');
const DEFAULT_STATE = { crons: [], webhooks: [], rules: [] };
let state = { ...DEFAULT_STATE };

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(PATH, 'utf8'));
    state = parsed && typeof parsed === 'object' ? { ...DEFAULT_STATE, ...parsed } : { ...DEFAULT_STATE };
    state.crons = Array.isArray(state.crons) ? state.crons : [];
    state.webhooks = Array.isArray(state.webhooks) ? state.webhooks : [];
    state.rules = Array.isArray(state.rules) ? state.rules : [];
  } catch (e) { if (e.code !== 'ENOENT') console.warn('[automation] load failed:', e.message); }
};
const save = () => {
  try {
    fs.mkdirSync(path.dirname(PATH), { recursive: true });
    const tmp = `${PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, PATH);
  } catch (e) { console.warn('[automation] save failed:', e.message); }
};

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ===== Cron parsing — minimal 5-field implementation =====
// Each field is either '*', a comma list of numbers, or a single number.
// Steps (*/5) and ranges (1-5) are supported. Day-of-week and day-of-month
// follow standard cron OR semantics when both are wildcards.
const parseField = (str, min, max) => {
  if (str === '*') return null;   // wildcard
  const out = new Set();
  const validate = (n) => {
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`Cron value ${n} out of range [${min}-${max}]`);
    }
  };
  for (const part of String(str).split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[2]);
      // Step must be > 0 — otherwise the for-loop is infinite (i += 0).
      if (!Number.isFinite(step) || step <= 0) {
        throw new Error(`Cron step must be > 0, got ${step}`);
      }
      const range = stepMatch[1] === '*' ? [min, max] : stepMatch[1].split('-').map(Number);
      const [a, b] = range.length === 2 ? range : [range[0], range[0]];
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error(`Cron range malformed: ${stepMatch[1]}`);
      }
      validate(a); validate(b);
      for (let i = a; i <= b; i += step) out.add(i);
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error(`Cron range malformed: ${part}`);
      }
      validate(a); validate(b);
      for (let i = a; i <= b; i++) out.add(i);
    } else {
      const n = Number(part);
      validate(n);
      out.add(n);
    }
  }
  return out;
};
const parseCron = (expr) => {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('Cron must have 5 fields: m h dom mon dow');
  return {
    m:   parseField(parts[0], 0, 59),
    h:   parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31),
    mon: parseField(parts[3], 1, 12),
    dow: parseField(parts[4], 0, 6),
  };
};
const cronMatches = (parsed, date = new Date()) => {
  const ok = (set, n) => set === null || set.has(n);
  return ok(parsed.m, date.getMinutes())
    && ok(parsed.h, date.getHours())
    && ok(parsed.dom, date.getDate())
    && ok(parsed.mon, date.getMonth() + 1)
    && ok(parsed.dow, date.getDay());
};

// ===== Crons CRUD =====
const listCrons = () => state.crons.slice();
const addCron = ({ name, expr, action, guildId }) => {
  parseCron(expr);   // validate
  const c = { id: newId('cron'), name: String(name || 'cron').slice(0, 80), expr, action, guildId, enabled: true, lastRunAt: null, runCount: 0, lastError: null };
  state.crons.push(c); save(); return c;
};
const removeCron = (id) => { const n = state.crons.length; state.crons = state.crons.filter((c) => c.id !== id); if (state.crons.length !== n) { save(); return true; } return false; };
const toggleCron = (id, enabled) => { const c = state.crons.find((x) => x.id === id); if (!c) return null; c.enabled = !!enabled; save(); return c; };

// ===== Webhooks =====
const listWebhooks = () => state.webhooks.map((w) => ({ ...w, secret: undefined }));   // hide secrets
const addWebhook = ({ name, action, guildId }) => {
  const w = { id: newId('hook'), name: String(name || 'webhook').slice(0, 80), action, guildId, secret: crypto.randomBytes(16).toString('hex'), createdAt: Date.now(), hitCount: 0, lastHitAt: null };
  state.webhooks.push(w); save();
  return w;
};
const removeWebhook = (id) => { const n = state.webhooks.length; state.webhooks = state.webhooks.filter((w) => w.id !== id); if (state.webhooks.length !== n) { save(); return true; } return false; };
const findWebhookBySecret = (secret) => state.webhooks.find((w) => w.secret === secret) || null;
const noteWebhookHit = (id) => { const w = state.webhooks.find((x) => x.id === id); if (!w) return; w.hitCount++; w.lastHitAt = Date.now(); save(); };

// ===== Rules =====
// Rule shape: { id, name, event, condition?, action, guildId, enabled, runCount }
//   event: 'voice-join' | 'voice-leave' | 'play-end' | 'queue-empty'
const listRules = () => state.rules.slice();
const addRule = ({ name, event, action, condition, guildId }) => {
  const r = { id: newId('rule'), name: String(name || 'rule').slice(0, 80), event, action, condition: condition || null, guildId, enabled: true, runCount: 0 };
  state.rules.push(r); save(); return r;
};
const removeRule = (id) => { const n = state.rules.length; state.rules = state.rules.filter((r) => r.id !== id); if (state.rules.length !== n) { save(); return true; } return false; };
const rulesForEvent = (event) => state.rules.filter((r) => r.enabled && r.event === event);
const noteRuleFired = (id) => { const r = state.rules.find((x) => x.id === id); if (r) { r.runCount++; save(); } };
const noteCronRan = (id, error) => { const c = state.crons.find((x) => x.id === id); if (c) { c.lastRunAt = Date.now(); c.runCount++; c.lastError = error || null; save(); } };

// ===== Scheduler — single-minute tick =====
// Runs the registered onCron callback for every enabled cron whose
// expression matches the current minute. Skips a fire if its
// matching-minute is the same as lastRunAt's minute (prevent double-fire
// when the tick drifts).
const startScheduler = ({ onCron, onLog } = {}) => {
  const noop = onLog || (() => {});
  let stopped = false;
  // lastMinute is now a STRING (was -1 number which compared poorly).
  let lastMinute = '';
  const tick = async () => {
    if (stopped) return;
    const now = new Date();
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (minuteKey === lastMinute) return;
    lastMinute = minuteKey;
    // Snapshot the list BEFORE iterating — if a cron callback adds/removes
    // crons, we still see a consistent view for this tick.
    const snapshot = state.crons.slice();
    for (const c of snapshot) {
      if (!c.enabled) continue;
      // Re-fetch the live cron in case it was removed/toggled mid-iteration.
      const live = state.crons.find((x) => x.id === c.id);
      if (!live || !live.enabled) continue;
      try {
        const parsed = parseCron(live.expr);
        if (!cronMatches(parsed, now)) continue;
        noop(`⏰ Cron fired: ${live.name} → ${live.action?.type || '?'}`, 'info');
        try { await onCron?.(live); noteCronRan(live.id, null); }
        catch (e) { noop(`✕ Cron "${live.name}" failed: ${e.message}`, 'error'); noteCronRan(live.id, e.message); }
      } catch (e) {
        noop(`✕ Cron "${live.name}" invalid expression: ${e.message}`, 'error');
      }
    }
  };
  // Tick every 20s. Combined with the minute-key check, this guarantees
  // each clock-minute fires at most once even if individual ticks are slow.
  const timer = setInterval(tick, 20000);
  timer.unref?.();
  // Kick first tick after 5s so newly-added crons get evaluated promptly.
  const boot = setTimeout(tick, 5000);
  boot.unref?.();
  return () => { stopped = true; clearInterval(timer); clearTimeout(boot); };
};

load();

module.exports = {
  listCrons, addCron, removeCron, toggleCron,
  listWebhooks, addWebhook, removeWebhook, findWebhookBySecret, noteWebhookHit,
  listRules, addRule, removeRule, rulesForEvent, noteRuleFired,
  startScheduler, parseCron, cronMatches,
};
