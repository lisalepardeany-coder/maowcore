// Cloudflare Worker: hosts the public status page, stores what the bot pushes,
// and raises the alarm by itself when the pushes stop (bot or PC down).
const STALE_MS = 6 * 60 * 1000;
const OUTAGE_SERVICES = new Set(['bot', 'music', 'dashboard']);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const applyStaleness = (snap, receivedAt, now) => {
  if (now - receivedAt <= STALE_MS) return { ...snap, stale: false, now };
  const services = snap.services.map((s) => (OUTAGE_SERVICES.has(s.id)
    ? { ...s, status: 'offline', label: null, message: 'No heartbeat from the bot.' }
    : s));
  return { ...snap, services, overall: 'offline', overallLabel: 'The bot is not responding', overallMessage: `Last heartbeat ${new Date(receivedAt).toUTCString()}`, stale: true, now };
};

const notify = async (env, content) => {
  if (!env.DISCORD_WEBHOOK_URL) return;
  await fetch(env.DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
};

export const checkHeartbeat = async (env, now = Date.now()) => {
  const receivedAt = Number(await env.STATUS.get('receivedAt'));
  if (!receivedAt) return;
  const stale = now - receivedAt > STALE_MS;
  const alerted = (await env.STATUS.get('alerted')) === '1';
  if (stale && !alerted) {
    await notify(env, '🔴 **MaowCore is offline.** No heartbeat for over 6 minutes.');
    await env.STATUS.put('alerted', '1');
  } else if (!stale && alerted) {
    await notify(env, '🟢 **MaowCore is back online.**');
    await env.STATUS.put('alerted', '0');
  }
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/push' && req.method === 'POST') {
      if (!env.PUSH_SECRET || req.headers.get('authorization') !== `Bearer ${env.PUSH_SECRET}`) return json({ error: 'Unauthorized' }, 401);
      const text = await req.text();
      JSON.parse(text);
      await env.STATUS.put('snapshot', text);
      await env.STATUS.put('receivedAt', String(Date.now()));
      return json({ ok: true });
    }
    if (url.pathname === '/api/status/public') {
      const text = await env.STATUS.get('snapshot');
      if (!text) return json({ error: 'No data yet' }, 503);
      const receivedAt = Number(await env.STATUS.get('receivedAt'));
      return json(applyStaleness(JSON.parse(text), receivedAt, Date.now()));
    }
    if (url.pathname === '/' || url.pathname === '/status') {
      return env.ASSETS.fetch(new Request(new URL('/status.html', url), req));
    }
    return json({ error: 'Not found' }, 404);
  },
  async scheduled(_event, env) {
    await checkHeartbeat(env);
  },
};
