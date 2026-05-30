// Observability for v3.0.0 — alert dispatch + error budget tracking.
//
// Designed to be lightweight and operator-friendly. Two things:
//
//   1. Alert pipeline — when something serious goes wrong (uncaughtException,
//      prolonged disconnect, dead WS for N minutes, etc.), fire-and-forget
//      a POST to ALERT_WEBHOOK_URL. Standard Discord webhook format so you
//      can pipe alerts straight into a #ops channel.
//
//   2. Error budget — count errors per 5-minute window. Define a budget
//      (e.g. "≤ 10 errors per 5 minutes"). When the rate breaches budget,
//      emit an alert with the top error types. Otherwise stay quiet.

const ALERT_URL = process.env.ALERT_WEBHOOK_URL || null;
const BOT_INSTANCE_NAME = process.env.BOT_INSTANCE_NAME || 'MaowCore';
const BUDGET_ERRORS_PER_5MIN = Number(process.env.ERROR_BUDGET_5MIN) || 10;

let recentErrors = [];   // [{ ts, message, category, subsystem }]
let lastAlertAt = 0;     // throttle: at most one alert per 5 min

// Push a Discord webhook payload. Best-effort, never throws.
const sendAlert = async ({ title, description, color = 0xF23F43, fields = [] }) => {
  if (!ALERT_URL) return;
  try {
    await fetch(ALERT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `${BOT_INSTANCE_NAME} · alerts`,
        embeds: [{
          title,
          description,
          color,
          fields: fields.slice(0, 25),
          timestamp: new Date().toISOString(),
          footer: { text: BOT_INSTANCE_NAME },
        }],
      }),
    });
  } catch (e) {
    console.warn('[observability] alert dispatch failed:', e.message);
  }
};

// Called by ControlServer.log() on every error-level entry.
const recordError = (entry) => {
  recentErrors.push({
    ts: entry.ts || Date.now(),
    message: entry.text,
    category: entry.category || 'system',
    subsystem: entry.subsystem || 'system',
  });
  // Drop anything older than 60 minutes — budget checks only look at the
  // last 5 anyway.
  const cutoff = Date.now() - 60 * 60 * 1000;
  recentErrors = recentErrors.filter((e) => e.ts >= cutoff);
  maybeAlert();
};

// Fire an alert if we've blown the 5-min error budget AND haven't alerted
// recently (cooldown so we don't spam #ops).
const maybeAlert = () => {
  if (!ALERT_URL) return;
  const cutoff = Date.now() - 5 * 60 * 1000;
  const last5 = recentErrors.filter((e) => e.ts >= cutoff);
  if (last5.length < BUDGET_ERRORS_PER_5MIN) return;
  if (Date.now() - lastAlertAt < 5 * 60 * 1000) return;   // 5-min cooldown
  lastAlertAt = Date.now();
  // Top error categories
  const byCat = {};
  for (const e of last5) byCat[e.category] = (byCat[e.category] || 0) + 1;
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const samples = last5.slice(-5).map((e) => `• ${e.message.slice(0, 100)}`).join('\n');
  sendAlert({
    title: '▲ Error budget breached',
    description: `${last5.length} errors in last 5 min (budget: ${BUDGET_ERRORS_PER_5MIN}).`,
    color: 0xF23F43,
    fields: [
      { name: 'Top categories', value: topCats.map(([k, v]) => `\`${k}\` ×${v}`).join(' · ') || '—' },
      { name: 'Recent samples', value: '```\n' + (samples || '(none)') + '\n```' },
    ],
  });
};

const status = () => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const last5 = recentErrors.filter((e) => e.ts >= cutoff);
  return {
    alertConfigured: !!ALERT_URL,
    budget5min: BUDGET_ERRORS_PER_5MIN,
    errors5min: last5.length,
    burnRatePct: Math.round((last5.length / BUDGET_ERRORS_PER_5MIN) * 100),
    lastAlertAt: lastAlertAt || null,
  };
};

const fireManual = (title, description) =>
  sendAlert({ title, description, color: 0xFBBF24 });

module.exports = { recordError, status, sendAlert, fireManual };
