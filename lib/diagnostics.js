// =============================================================================
// MaowCore diagnostics — boot timeline + per-category counters + health.
// =============================================================================
//
// The control-server already broadcasts free-form log lines to dashboards. This
// module adds *structure* on top of that:
//
//   • A boot timeline — every startup step (env → ffmpeg → yt-dlp → DisTube
//     plugins → library → control server → Discord login → ready → commands
//     deployed) recorded with timestamp + outcome. Lets the operator see at a
//     glance exactly where startup hung or failed.
//
//   • Per-category rolling counters — `command`, `search`, `play`, `voice`,
//     `discord`, `http`, `install`, `upload`, `library`, `system`, `error`,
//     `warn`. Each tracks total + 1-minute / 5-minute windows so the dashboard
//     can render error-rate badges, throughput, and a quick "is anything on
//     fire right now" health summary.
//
//   • Subsystem health — derived from the counters + recent errors per system:
//     discord / distube / voice / ytdlp / ffmpeg / http / library. Each is
//     'ok', 'degraded' (any warn in the last 5 min), or 'down' (any error in
//     the last 5 min, OR a stuck boot step).
//
// Categories are intentionally a small fixed set so the UI can render filter
// chips without surprises. `meta` is free-form per-entry data the UI can show
// on hover (command name, duration, guild, error stack, etc.).
// =============================================================================

const CATEGORIES = [
  'startup', 'discord', 'command', 'search', 'play',
  'voice', 'install', 'upload', 'library', 'http', 'ws', 'system',
];

// Steps the boot timeline tracks (in order). Each transitions through
// 'pending' → 'ok' / 'fail' / 'skip'. The dashboard renders them top-down
// so a hung start shows the exact step it stalled on.
const BOOT_STEPS = [
  { key: 'env',         label: 'Load environment',         optional: false },
  { key: 'ffmpeg',      label: 'Locate ffmpeg',            optional: false },
  { key: 'ytdlp',       label: 'Locate yt-dlp',            optional: false },
  { key: 'distube',     label: 'Initialize DisTube',       optional: false },
  { key: 'plugins',     label: 'Load DisTube plugins',     optional: false },
  { key: 'library',     label: 'Load song library',        optional: false },
  { key: 'commands',    label: 'Load slash commands',      optional: false },
  { key: 'control',     label: 'Start control server',     optional: false },
  { key: 'login',       label: 'Discord login',            optional: false },
  { key: 'ready',       label: 'Discord ready',            optional: false },
  { key: 'deploy',      label: 'Deploy slash commands',    optional: true  },
];

const ONE_MIN = 60 * 1000;
const FIVE_MIN = 5 * ONE_MIN;

// Cap recent-error lists per subsystem so we never grow unbounded if a hot
// loop keeps failing. The dashboard only needs the latest handful.
const MAX_RECENT_ERRORS = 10;

class Diagnostics {
  constructor() {
    this.startedAt = Date.now();

    // Boot timeline — preserves declaration order.
    this.boot = BOOT_STEPS.map((s) => ({
      ...s,
      status: 'pending',
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      detail: null,
    }));

    // Per-category timestamp ring (just the ts, level, category — for rate
    // computation). We don't store the full text here — the control server's
    // logHistory already does that.
    this.events = []; // { ts, category, level }

    // Per-subsystem recent errors (newest last).
    this.errors = {
      discord: [], distube: [], voice: [], ytdlp: [],
      ffmpeg: [], http: [], library: [], system: [],
    };
  }

  // --- Boot timeline -------------------------------------------------------

  bootStart(key, detail = null) {
    const step = this.boot.find((s) => s.key === key);
    if (!step) return;
    step.status = 'running';
    step.startedAt = Date.now();
    step.detail = detail;
  }

  bootOk(key, detail = null) {
    const step = this.boot.find((s) => s.key === key);
    if (!step) return;
    const now = Date.now();
    step.status = 'ok';
    step.finishedAt = now;
    step.durationMs = step.startedAt ? now - step.startedAt : null;
    if (detail != null) step.detail = detail;
  }

  bootFail(key, error) {
    const step = this.boot.find((s) => s.key === key);
    if (!step) return;
    const now = Date.now();
    step.status = 'fail';
    step.finishedAt = now;
    step.durationMs = step.startedAt ? now - step.startedAt : null;
    step.detail = error?.message || String(error || 'unknown error');
  }

  bootSkip(key, why = null) {
    const step = this.boot.find((s) => s.key === key);
    if (!step) return;
    step.status = 'skip';
    step.finishedAt = Date.now();
    step.detail = why;
  }

  // --- Event recording -----------------------------------------------------

  // Called by ControlServer.log() on every log entry. We just keep a
  // timestamped ring of (ts, category, level) for rate computation.
  record({ ts, category, level, text, subsystem, meta }) {
    if (!CATEGORIES.includes(category)) category = 'system';
    this.events.push({ ts: ts || Date.now(), category, level: level || 'info' });
    // Keep events for at most ~10 minutes — anything older isn't useful for
    // the live 1m/5m windows the dashboard shows.
    const cutoff = Date.now() - 10 * ONE_MIN;
    while (this.events.length && this.events[0].ts < cutoff) this.events.shift();

    // Track recent errors per subsystem so the health panel can show what
    // most recently broke.
    if (level === 'error' && subsystem && this.errors[subsystem]) {
      const e = { ts: ts || Date.now(), text, meta };
      this.errors[subsystem].push(e);
      if (this.errors[subsystem].length > MAX_RECENT_ERRORS) {
        this.errors[subsystem].shift();
      }
    }
  }

  // --- Snapshot ------------------------------------------------------------

  // Counts events in the window [now - windowMs, now] matching a predicate.
  // Walks the whole buffer (≤10 min of events, trivial cost) rather than
  // assuming chronological order — out-of-order inserts (e.g. log replay on
  // dashboard reconnect) shouldn't silently undercount.
  _count(windowMs, pred) {
    const cutoff = Date.now() - windowMs;
    let n = 0;
    for (const e of this.events) {
      if (e.ts < cutoff) continue;
      if (pred(e)) n++;
    }
    return n;
  }

  countersByCategory(windowMs) {
    const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    out.warn = 0; out.error = 0;
    const cutoff = Date.now() - windowMs;
    for (const e of this.events) {
      if (e.ts < cutoff) continue;
      if (out[e.category] !== undefined) out[e.category]++;
      if (e.level === 'warn') out.warn++;
      else if (e.level === 'error') out.error++;
    }
    return out;
  }

  health() {
    // A subsystem is 'down' if it logged an error in the last 5 min, 'degraded'
    // if it only logged warnings, otherwise 'ok'. Boot failures pin the
    // matching subsystem to 'down' until a successful event clears them.
    const errs = (sys) => this.errors[sys].some((e) => e.ts > Date.now() - FIVE_MIN);
    const warns = (sys) => this._count(FIVE_MIN, (e) =>
      e.level === 'warn' && this._catMatchesSubsystem(e.category, sys));
    const status = (sys) => {
      if (errs(sys)) return 'down';
      if (warns(sys) > 0) return 'degraded';
      return 'ok';
    };

    // Boot failures cascade into 'down' for the relevant subsystem.
    const bootFailed = (key) => this.boot.find((s) => s.key === key)?.status === 'fail';
    const out = {
      discord:  bootFailed('login') || bootFailed('ready') ? 'down' : status('discord'),
      distube:  bootFailed('distube') || bootFailed('plugins') ? 'down' : status('distube'),
      voice:    status('voice'),
      ytdlp:    bootFailed('ytdlp') ? 'down' : status('ytdlp'),
      ffmpeg:   bootFailed('ffmpeg') ? 'down' : status('ffmpeg'),
      http:     bootFailed('control') ? 'down' : status('http'),
      library:  bootFailed('library') ? 'down' : status('library'),
    };
    return out;
  }

  // Map free-form categories to a subsystem for health derivation. Best-effort
  // — a given log line is allowed to belong to one subsystem only.
  _catMatchesSubsystem(category, sys) {
    switch (sys) {
      case 'discord':  return category === 'discord' || category === 'command';
      case 'distube':  return category === 'play';
      case 'voice':    return category === 'voice';
      case 'http':     return category === 'http' || category === 'ws';
      case 'library':  return category === 'library' || category === 'upload' || category === 'install';
      case 'ytdlp':    return category === 'search' || category === 'install';
      case 'ffmpeg':   return false; // ffmpeg failures are caught elsewhere
      default: return false;
    }
  }

  snapshot() {
    return {
      startedAt: this.startedAt,
      bootedMs: Date.now() - this.startedAt,
      boot: this.boot,
      counters: {
        m1: this.countersByCategory(ONE_MIN),
        m5: this.countersByCategory(FIVE_MIN),
      },
      health: this.health(),
      recentErrors: this.errors,
      categories: CATEGORIES,
    };
  }
}

module.exports = { Diagnostics, CATEGORIES, BOOT_STEPS };
