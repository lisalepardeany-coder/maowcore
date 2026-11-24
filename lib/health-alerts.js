// Health alerts: DM the owner (OWNER_USER_ID) when something is actually wrong,
// instead of them finding out when music stops working.
//
//   • the bot came back after a crash (supervisor's data/.last-exit.json)
//   • an uncaught error
//   • music keeps failing (3+ errors in 10 min — usually yt-dlp needs an update)
//   • Discord connection down for more than 2 minutes
//
// Each kind is sent at most once per 30 minutes. HEALTH_ALERTS=0 turns it off.
// The owner can also mute it from the panel (Settings → "Health alerts").
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXIT_FILE = path.join(ROOT, 'data', '.last-exit.json');
const COOLDOWN_MS = 30 * 60 * 1000;
const MUSIC_WINDOW_MS = 10 * 60 * 1000;
const MUSIC_THRESHOLD = 3;
const DOWN_AFTER_MS = 2 * 60 * 1000;

const lastSent = new Map();
const recent = [];        // last alerts, shown in the panel
let musicErrors = [];
let client = null;
let downTimer = null;

const owners = require('./owners');
const enabled = () => process.env.HEALTH_ALERTS !== '0' && !!owners.primary();

// Pure: should this kind be sent now? (unit tested)
const shouldSend = (kind, now = Date.now(), map = lastSent) => {
  if (map.has(kind) && now - map.get(kind) < COOLDOWN_MS) return false;
  map.set(kind, now);
  return true;
};

// Pure: does the exit record describe a crash? Code 0 = normal restart.
const wasCrash = (rec) => !!rec && rec.code !== 0 && rec.code !== null && rec.code !== undefined;

// Quiet hours (panel → Settings): alerts wait and arrive as one DM afterwards.
const held = [];
const quietNow = () => { try { const op = require('./owner-prefs'); return op.isQuiet() && op.get().quiet.holdAlerts; } catch { return false; } };
const flushHeld = async () => {
  if (!held.length || quietNow() || !enabled() || !client?.isReady?.()) return;
  const list = held.splice(0, held.length);
  try {
    const user = await client.users.fetch(owners.primary());
    await user.send({ embeds: [{
      color: 0xf59e0b,
      title: `🌙 While quiet hours were on (${list.length})`,
      description: list.map((a) => `**${a.title}** · <t:${Math.floor(a.ts / 1000)}:t>\n${String(a.text).slice(0, 300)}`).join('\n\n').slice(0, 3900),
      footer: { text: 'MaowCore health alerts' },
    }] });
  } catch (e) { console.warn('[health-alerts] summary DM failed:', e.message); held.unshift(...list); }
};
setInterval(() => flushHeld().catch(() => {}), 60000).unref?.();

// opts: { color, icon } — e.g. a finished download is green with ⬇ instead of the red 🩺
const alert = async (kind, title, text, opts = {}) => {
  recent.unshift({ ts: Date.now(), kind, title, text: String(text).slice(0, 300) });
  recent.length = Math.min(recent.length, 30);
  if (!enabled() || !client?.isReady?.() || !shouldSend(kind)) return false;
  if (quietNow()) {
    held.push({ ts: Date.now(), kind, title, text });
    if (held.length > 30) held.shift();
    return 'held';
  }
  try {
    const user = await client.users.fetch(owners.primary());
    await user.send({
      embeds: [{
        color: opts.color ?? 0xef4444,
        title: `${opts.icon || '🩺'} ${title}`,
        description: String(text).slice(0, 1800),
        footer: { text: 'MaowCore health alert · mute with HEALTH_ALERTS=0 or in the panel' },
        timestamp: new Date().toISOString(),
      }],
    });
    return true;
  } catch (e) {
    console.warn('[health-alerts] DM failed:', e.message);
    return false;
  }
};

const noteMusicError = (message) => {
  const now = Date.now();
  musicErrors = musicErrors.filter((t) => now - t < MUSIC_WINDOW_MS);
  musicErrors.push(now);
  if (musicErrors.length >= MUSIC_THRESHOLD) {
    musicErrors = [];
    alert('music', 'Music keeps failing',
      `${MUSIC_THRESHOLD}+ songs failed in the last 10 minutes.\nLast error: \`${String(message || '').slice(0, 300)}\`\n\n`
      + 'This is usually YouTube changing something. Try **Control room → Update** in the panel (it updates yt-dlp too).');
  }
};

const start = (c) => {
  client = c;
  // Crash check once Discord is ready (we need it to send the DM).
  c.once('clientReady', () => {
    let rec = null;
    try { rec = JSON.parse(fs.readFileSync(EXIT_FILE, 'utf8')); fs.unlinkSync(EXIT_FILE); } catch { /* no record */ }
    if (wasCrash(rec)) {
      const mins = Math.round((rec.uptimeMs || 0) / 60000);
      alert('crash', 'I crashed and restarted',
        `The bot stopped unexpectedly (exit code ${rec.code}${rec.signal ? `, ${rec.signal}` : ''}) after running ${mins} min, and the supervisor started it again.\n`
        + `Crashed at <t:${Math.floor(rec.at / 1000)}:f>. Check \`bot.err.log\` for details.`);
    }
  });
  c.on('shardDisconnect', () => {
    clearTimeout(downTimer);
    downTimer = setTimeout(() => {
      // Can't DM while disconnected; queue it for when we're back.
      const since = Date.now() - DOWN_AFTER_MS;
      c.once('shardResume', () => alert('discord', 'Discord connection was down',
        `I lost my connection to Discord at <t:${Math.floor(since / 1000)}:t> for more than 2 minutes. I'm back now.`));
    }, DOWN_AFTER_MS);
  });
  c.on('shardResume', () => clearTimeout(downTimer));
  c.on('shardReady', () => clearTimeout(downTimer));
};

module.exports = { start, alert, noteMusicError, shouldSend, wasCrash, recent: () => recent.slice(), enabled, heldCount: () => held.length };
