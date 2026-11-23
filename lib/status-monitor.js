// Status monitor: samples each service once a minute, keeps the last 24 h
// minute by minute plus 90 days of daily buckets in data/status.json, and
// serves the public status page + admin API.
// History only contains real measurements. Days before tracking began show as
// "no data". Time the bot was off is recorded as downtime on the next boot.

const fs = require('node:fs');
const path = require('node:path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'status.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const HISTORY_DAYS = 90;
const SAMPLE_MS = 60 * 1000;
const PROBE_MS = 5 * 60 * 1000;
const PUSH_MS = 2 * 60 * 1000;
const GAP_THRESHOLD_MIN = 3;
const MUSIC_ERROR_WINDOW_MS = 10 * 60 * 1000;

const SERVICES = [
  { id: 'bot', name: 'Discord Bot' },
  { id: 'music', name: 'Music Playback' },
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'spotify', name: 'Spotify' },
  { id: 'lyrics', name: 'Lyrics' },
];
const KINDS = ['operational', 'degraded', 'maintenance', 'offline', 'custom'];
const SEVERITY = { operational: 0, maintenance: 1, degraded: 2, custom: 2, offline: 3 };
const BUCKET = { operational: 'up', degraded: 'degraded', custom: 'degraded', maintenance: 'maint', offline: 'down' };

const PROBES = {
  youtube: 'https://www.youtube.com/generate_204',
  spotify: 'https://api.spotify.com/v1/',
  lyrics: 'https://lrclib.net/api/search?q=test',
};

// ===== Pure helpers (unit tested) =====
const dayKey = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const dayState = (b) => {
  if (!b) return 'none';
  const total = (b.up || 0) + (b.degraded || 0) + (b.down || 0) + (b.maint || 0);
  if (!total) return 'none';
  if ((b.down || 0) >= 30) return 'down';
  if ((b.down || 0) > 0 || (b.degraded || 0) >= 5) return 'degraded';
  if ((b.maint || 0) > 0) return 'maintenance';
  return 'up';
};

// Maintenance is excluded, so planned work doesn't lower the uptime figure.
const uptimePct = (buckets) => {
  let good = 0;
  let all = 0;
  for (const b of buckets) {
    if (!b) continue;
    good += (b.up || 0) + (b.degraded || 0);
    all += (b.up || 0) + (b.degraded || 0) + (b.down || 0);
  }
  return all ? Math.round((good / all) * 10000) / 100 : null;
};

// Split an outage across the local days it covers, one count per minute.
const addGapMinutes = (days, serviceIds, fromMs, toMs) => {
  for (let t = fromMs; t < toMs; t += 60000) {
    const key = dayKey(t);
    days[key] = days[key] || {};
    for (const id of serviceIds) {
      days[key][id] = days[key][id] || {};
      days[key][id].down = (days[key][id].down || 0) + 1;
    }
  }
};

const fmtDuration = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);

// ===== Minute history (last 24 h) =====
// minutes[serviceId][epochMinute] = 'u' up · 'g' degraded · 'm' maintenance · 'd' down
const MINUTES_KEEP = 24 * 60;
const CODE = { up: 'u', degraded: 'g', maint: 'm', down: 'd' };
const CODE_STATE = { u: 'up', g: 'degraded', m: 'maintenance', d: 'down' };
const CODE_BUCKET = { u: 'up', g: 'degraded', m: 'maint', d: 'down' };
const epochMin = (ms) => Math.floor(ms / 60000);

// Pure: mark a gap (bot was off) as down, minute by minute, within the window.
const addGapToMinutes = (minutes, serviceIds, fromMs, toMs, nowMs = toMs) => {
  const first = Math.max(epochMin(fromMs), epochMin(nowMs) - MINUTES_KEEP);
  for (let m = first; m < epochMin(toMs); m++) {
    for (const id of serviceIds) (minutes[id] = minutes[id] || {})[m] = 'd';
  }
};

// Pure: the last `count` minutes for one service, oldest first.
const minuteSeries = (log = {}, nowMs, count = 90) => {
  // The current minute may not be sampled yet; end at the last recorded one
  // so the newest bar isn't a grey "no data" for most of each minute.
  let end = epochMin(nowMs);
  if (!log[end] && log[end - 1]) end -= 1;
  const out = [];
  for (let m = end - count + 1; m <= end; m++) out.push({ t: m * 60000, state: CODE_STATE[log[m]] || 'none' });
  return out;
};

// Pure: the last `count` hours, each summarised from its minutes.
const hourState = (b) => {
  const total = (b.up || 0) + (b.degraded || 0) + (b.down || 0) + (b.maint || 0);
  if (!total) return 'none';
  if ((b.down || 0) >= 10) return 'down';
  if ((b.down || 0) > 0 || (b.degraded || 0) >= 3) return 'degraded';
  if ((b.maint || 0) > 0) return 'maintenance';
  return 'up';
};
const hourSeries = (log = {}, nowMs, count = 24) => {
  const endHour = Math.floor(nowMs / 3600000);
  const out = [];
  for (let h = endHour - count + 1; h <= endHour; h++) {
    const b = {};
    for (let m = h * 60; m < h * 60 + 60; m++) if (log[m]) { const k = CODE_BUCKET[log[m]]; b[k] = (b[k] || 0) + 1; }
    out.push({ t: h * 3600000, state: hourState(b), downMin: b.down || 0, degradedMin: b.degraded || 0, maintMin: b.maint || 0 });
  }
  return out;
};
// Pure: uptime % over the last `count` minutes (maintenance excluded).
const minuteUptime = (log = {}, nowMs, count) => {
  const b = {};
  const end = epochMin(nowMs);
  for (let m = end - count + 1; m <= end; m++) if (log[m]) { const k = CODE_BUCKET[log[m]]; b[k] = (b[k] || 0) + 1; }
  return uptimePct([b]);
};

// ===== Runtime =====
let state = { days: {}, minutes: {}, overrides: {}, incidents: [], lastSeen: null, startedTracking: null, settings: { channelId: null, dmAlerts: true } };
let ctx = null;
const probes = {};
const fails = {};
let lastMusicError = 0;
let lastLive = {};
const openIncidents = {};
let maintenancePresence = false;

const load = () => {
  try { state = { ...state, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch { /* first run */ }
};
const save = () => {
  try {
    fs.writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(state));
    fs.renameSync(`${DATA_FILE}.tmp`, DATA_FILE);
  } catch (e) { console.warn('[status] save failed:', e.message); }
};

const measured = (id) => {
  const { client, control, ffmpegPath } = ctx;
  const botUp = client.isReady() && client.ws.status === 0;
  if (id === 'bot') return botUp ? 'operational' : 'offline';
  if (id === 'dashboard') return control?.httpServer?.listening ? 'operational' : 'offline';
  if (id === 'music') {
    if (!botUp || !ffmpegPath || (ffmpegPath.includes(path.sep) && !fs.existsSync(ffmpegPath))) return 'offline';
    return Date.now() - lastMusicError < MUSIC_ERROR_WINDOW_MS ? 'degraded' : 'operational';
  }
  return probes[id] || 'operational';
};

const overrideFor = (id) => state.overrides[id] || state.overrides.all || null;
const liveStatus = (id) => {
  const o = overrideFor(id);
  return o ? o.kind : measured(id);
};

const announce = async (title, description, kind, { dm = false } = {}) => {
  const { client } = ctx;
  if (!client.isReady()) return;
  const color = { operational: 0x57f287, degraded: 0xfee75c, custom: 0xeb459e, maintenance: 0x5865f2, offline: 0xed4245 }[kind] || 0x99aab5;
  const embed = { title, description, color, timestamp: new Date().toISOString() };
  if (state.settings.channelId) {
    try {
      const ch = await client.channels.fetch(state.settings.channelId);
      await ch.send({ embeds: [embed] });
    } catch (e) { console.warn('[status] channel post failed:', e.message); }
  }
  const quiet = (() => { try { const op = require('./owner-prefs'); return op.isQuiet() && op.get().quiet.holdAlerts; } catch { return false; } })();
  if (dm && state.settings.dmAlerts && !quiet) {
    try {
      const app = await client.application.fetch();
      const owner = app.owner?.owner?.user || app.owner;
      await owner?.send?.({ embeds: [embed] });
    } catch (e) { console.warn('[status] owner DM failed:', e.message); }
  }
};

const applyPresence = () => {
  const { client } = ctx;
  if (!client.isReady()) return;
  const maint = state.overrides.all?.kind === 'maintenance';
  if (maint) {
    client.user.setPresence({ status: 'dnd', activities: [{ name: `🔧 ${state.overrides.all.label || 'Maintenance'}`, type: 4 }] });
    maintenancePresence = true;
  } else if (maintenancePresence) {
    maintenancePresence = false;
    try { require('./presence').setIdle(client); } catch { /* cosmetic */ }
  }
};

const handleTransitions = () => {
  for (const s of SERVICES) {
    const cur = liveStatus(s.id);
    const prev = lastLive[s.id];
    lastLive[s.id] = cur;
    if (!prev || prev === cur || overrideFor(s.id)) continue;
    if (SEVERITY[cur] >= 2 && SEVERITY[prev] < 2) {
      const inc = { id: `auto-${Date.now()}-${s.id}`, type: 'incident', title: `${s.name}: ${cur}`, body: '', start: Date.now(), end: null, auto: true };
      state.incidents.unshift(inc);
      openIncidents[s.id] = inc;
      announce(`⚠ ${s.name} is ${cur}`, 'Detected automatically.', cur, { dm: true });
    } else if (cur === 'operational') {
      const inc = openIncidents[s.id];
      if (inc) { inc.end = Date.now(); delete openIncidents[s.id]; }
      announce(`✓ ${s.name} recovered`, inc ? `Lasted ${fmtDuration(Math.max(1, Math.round((inc.end - inc.start) / 60000)))}.` : 'Back to normal.', 'operational');
    }
  }
};

const sample = () => {
  const now = Date.now();
  const key = dayKey(now);
  state.days[key] = state.days[key] || {};
  state.minutes = state.minutes || {};
  const m = epochMin(now);
  for (const s of SERVICES) {
    const bucket = BUCKET[liveStatus(s.id)];
    const d = (state.days[key][s.id] = state.days[key][s.id] || {});
    d[bucket] = (d[bucket] || 0) + 1;
    (state.minutes[s.id] = state.minutes[s.id] || {})[m] = CODE[bucket];
  }
  handleTransitions();
  applyPresence();
  state.lastSeen = now;
  const cutoff = dayKey(now - (HISTORY_DAYS + 5) * 86400000);
  for (const k of Object.keys(state.days)) if (k < cutoff) delete state.days[k];
  for (const log of Object.values(state.minutes)) {
    for (const k of Object.keys(log)) if (Number(k) <= m - MINUTES_KEEP) delete log[k];
  }
  state.incidents = state.incidents.slice(0, 100);
  save();
};

const probe = async () => {
  await Promise.all(Object.entries(PROBES).map(async ([id, url]) => {
    let ok = false;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'MaowCore status monitor' } });
      ok = r.status < 500; // A 401 still proves the service is reachable.
    } catch { /* unreachable */ }
    fails[id] = ok ? 0 : (fails[id] || 0) + 1;
    // Require two misses in a row so a single network blip isn't an outage.
    probes[id] = ok ? 'operational' : fails[id] >= 2 ? 'offline' : probes[id] || 'operational';
  }));
};

const start = ({ client, control, ffmpegPath }) => {
  ctx = { client, control, ffmpegPath };
  load();
  const now = Date.now();
  state.startedTracking = state.startedTracking || now;
  let gapMin = 0;
  if (state.lastSeen && now - state.lastSeen > GAP_THRESHOLD_MIN * 60000) {
    gapMin = Math.round((now - state.lastSeen) / 60000);
    addGapMinutes(state.days, ['bot', 'music', 'dashboard'], state.lastSeen, now);
    state.minutes = state.minutes || {};
    addGapToMinutes(state.minutes, ['bot', 'music', 'dashboard'], state.lastSeen, now);
    state.incidents.unshift({ id: `gap-${now}`, type: 'incident', title: 'Bot was offline', body: `Offline for ${fmtDuration(gapMin)}.`, start: state.lastSeen, end: now, auto: true });
  }
  state.lastSeen = now;
  save();

  const begin = async () => {
    await probe();
    for (const s of SERVICES) lastLive[s.id] = liveStatus(s.id);
    if (gapMin) announce('✓ Bot is back online', `It was offline for ${fmtDuration(gapMin)}.`, 'operational', { dm: true });
    sample();
    setInterval(sample, SAMPLE_MS).unref?.();
    setInterval(probe, PROBE_MS).unref?.();
    if (process.env.STATUS_PUSH_URL) { pushPublic(); setInterval(pushPublic, PUSH_MS).unref?.(); }
  };
  if (client.isReady()) begin(); else client.once('clientReady', begin);
};

const noteMusicError = () => { lastMusicError = Date.now(); };

// Sends public data to the hosted status page. Its silence is the outage signal.
let pushFailing = false;
const pushPublic = async () => {
  try {
    const r = await fetch(process.env.STATUS_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.STATUS_PUSH_SECRET || ''}` },
      body: JSON.stringify(publicSnapshot()),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    pushFailing = false;
  } catch (e) {
    if (!pushFailing) console.warn('[status] push failed:', e.message);
    pushFailing = true;
  }
};

const publicSnapshot = () => {
  const now = Date.now();
  const dates = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) dates.push(dayKey(now - i * 86400000));
  const services = SERVICES.map((s) => {
    const buckets = dates.map((d) => state.days[d]?.[s.id] || null);
    const o = overrideFor(s.id);
    const log = state.minutes?.[s.id] || {};
    return {
      id: s.id,
      name: s.name,
      status: liveStatus(s.id),
      label: o?.label || null,
      message: o?.message || null,
      uptime: uptimePct(buckets),
      // Minute-by-minute (last 90 min) and hourly (last 24 h) views.
      minutes: minuteSeries(log, now, 90),
      hours: hourSeries(log, now, 24),
      uptimeMinutes: minuteUptime(log, now, 90),
      uptimeHours: minuteUptime(log, now, 24 * 60),
      days: dates.map((date, i) => ({
        date,
        state: dayState(buckets[i]),
        downMin: buckets[i]?.down || 0,
        degradedMin: buckets[i]?.degraded || 0,
        maintMin: buckets[i]?.maint || 0,
      })),
    };
  });
  const worst = services.reduce((a, b) => (SEVERITY[b.status] > SEVERITY[a.status] ? b : a), services[0]);
  return {
    now,
    overall: worst.status,
    overallLabel: worst.label,
    overallMessage: worst.message,
    startedTracking: state.startedTracking,
    ping: ctx?.client?.ws?.ping ?? null,
    services,
    incidents: state.incidents.slice(0, 20).map(({ title, body, start: s, end, type }) => ({ title, body, start: s, end, type })),
  };
};

// ===== HTTP =====
const sendJson = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 65536) { req.destroy(); reject(new Error('Body too large')); } });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } });
  req.on('error', reject);
});
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

const handleAdmin = async (req, res, p) => {
  if (req.method === 'GET' && p === '/api/status/admin') {
    const channels = [];
    for (const g of ctx.client.guilds.cache.values()) {
      for (const c of g.channels.cache.values()) if (c.isTextBased?.() && !c.isVoiceBased?.() && !c.isThread?.()) channels.push({ id: c.id, name: `${g.name} / #${c.name}` });
    }
    return sendJson(res, 200, { settings: state.settings, overrides: state.overrides, incidents: state.incidents.slice(0, 50), services: SERVICES, channels });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST required' });
  const b = await readBody(req);

  if (p === '/api/status/override') {
    const target = b.service === 'all' ? 'all' : SERVICES.find((s) => s.id === b.service)?.id;
    if (!target) return sendJson(res, 400, { error: 'Unknown service' });
    const name = target === 'all' ? 'All systems' : SERVICES.find((s) => s.id === target).name;
    if (b.clear) {
      delete state.overrides[target];
      announce(`✓ ${name}: back to automatic`, 'Manual status cleared.', 'operational');
    } else {
      if (!KINDS.includes(b.kind)) return sendJson(res, 400, { error: 'Unknown status' });
      if (b.kind === 'custom' && !String(b.label || '').trim()) return sendJson(res, 400, { error: 'Custom status needs a label' });
      state.overrides[target] = { kind: b.kind, label: clip(b.label, 80), message: clip(b.message, 300), at: Date.now() };
      announce(`${name}: ${b.label || b.kind}`, b.message || 'Status set manually.', b.kind);
    }
    applyPresence();
    for (const s of SERVICES) lastLive[s.id] = liveStatus(s.id);
    save();
    return sendJson(res, 200, { ok: true });
  }
  if (p === '/api/status/incident') {
    if (b.deleteId) {
      state.incidents = state.incidents.filter((i) => i.id !== b.deleteId);
    } else {
      if (!String(b.title || '').trim()) return sendJson(res, 400, { error: 'Title required' });
      const inc = {
        id: `man-${Date.now()}`,
        type: b.type === 'scheduled' ? 'scheduled' : 'incident',
        title: clip(b.title, 120),
        body: clip(b.body, 1000) || '',
        start: Number(b.start) || Date.now(),
        end: Number(b.end) || null,
      };
      state.incidents.unshift(inc);
      announce(`${inc.type === 'scheduled' ? '🗓 Scheduled maintenance' : '📝 Incident'}: ${inc.title}`, inc.body || ' ', inc.type === 'scheduled' ? 'maintenance' : 'degraded');
    }
    save();
    return sendJson(res, 200, { ok: true });
  }
  if (p === '/api/status/settings') {
    if ('channelId' in b) state.settings.channelId = b.channelId ? String(b.channelId).replace(/\D/g, '') : null;
    if ('dmAlerts' in b) state.settings.dmAlerts = !!b.dmAlerts;
    save();
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'Not found' });
};

// Returns true if this module handled the request. Runs before the dashboard's
// auth check, so everything except the public page and data checks the token.
const handleHttp = (req, res, p, control) => {
  if (p === '/status' || p === '/status-admin') {
    const file = p === '/status' ? 'status.html' : 'status-admin.html';
    fs.readFile(path.join(PUBLIC_DIR, file), (err, buf) => {
      if (err) return sendJson(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }).end(buf);
    });
    return true;
  }
  if (p === '/api/status/public') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('Access-Control-Allow-Credentials');
    sendJson(res, 200, publicSnapshot());
    return true;
  }
  if (p.startsWith('/api/status/')) {
    const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    // With no CONTROL_TOKEN set, allow only same-origin requests from this PC,
    // so a random website can't change the status through the browser.
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const origin = req.headers.origin;
    const sameOrigin = !origin || origin === `http://${req.headers.host}`;
    const allowed = control.authToken ? m?.[1] === control.authToken : loopback && sameOrigin;
    if (!allowed) {
      sendJson(res, 401, { error: 'Wrong or missing token' });
      return true;
    }
    handleAdmin(req, res, p).catch((e) => sendJson(res, 400, { error: e.message }));
    return true;
  }
  return false;
};

// For the panel (Control room → Status posts).
const getSettings = () => ({ ...state.settings });
const setSettings = (patch = {}) => {
  if ('channelId' in patch) state.settings.channelId = patch.channelId ? String(patch.channelId).replace(/\D/g, '') || null : null;
  if ('dmAlerts' in patch) state.settings.dmAlerts = !!patch.dmAlerts;
  save();
  return getSettings();
};
const testPost = () => announce('🧪 Status posts are working', 'This channel will get a message when something goes down or comes back.', 'operational');

module.exports = { start, noteMusicError, handleHttp, publicSnapshot, dayKey, dayState, uptimePct, addGapMinutes, getSettings, setSettings, testPost,
  addGapToMinutes, minuteSeries, hourSeries, hourState, minuteUptime };
