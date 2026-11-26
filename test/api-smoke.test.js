// Smoke test for the dashboard: GET every /api route the router knows about
// (taken from the source, so new routes are covered automatically) against a
// fake Discord server, and load every file dashboard.html links to.
//
// Fails on: a crash (500), no answer within 5 s, or a dashboard file that
// isn't served. 4xx answers are fine: missing parameters, POST-only routes.
// Every route that changes something requires POST, so GET is safe to send.
// Internet calls are blocked, so routes that need the network fail fast.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ROUTER_FILES = ['control-server', 'panel-extras', 'panel-features', 'status-monitor'];

function routes() {
  const out = new Set();
  for (const f of ROUTER_FILES) {
    const src = fs.readFileSync(path.join(ROOT, 'lib', `${f}.js`), 'utf8');
    for (const m of src.matchAll(/=== '(\/api\/[\w\-/.]+)'/g)) out.add(m[1]);
  }
  return [...out].sort();
}

test('dashboard API: no route crashes or hangs', { timeout: 120_000 }, async (t) => {
  const prev = { token: process.env.CONTROL_TOKEN, https: process.env.PANEL_HTTPS };
  process.env.CONTROL_TOKEN = 'smoke-token';
  process.env.PANEL_HTTPS = 'off';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, o) => (/^https?:\/\/127\.0\.0\.1[:/]/.test(String(u)) ? realFetch(u, o) : Promise.reject(new Error('network blocked in test')));

  const { fakeClient, GID } = require('./helpers/fake-discord');
  const { ControlServer } = require('../lib/control-server');
  const { client, distube } = fakeClient();
  const cs = new ControlServer({ port: 0, host: '127.0.0.1', distube, client });
  cs.authToken = 'smoke-token';
  t.after(() => {
    globalThis.fetch = realFetch;
    try { cs.httpServer.close(); cs.wss?.close(); } catch { /* */ }
    clearInterval(cs.ticker); clearInterval(cs.pingTimer);
    for (const [k, v] of [['CONTROL_TOKEN', prev.token], ['PANEL_HTTPS', prev.https]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
  if (!cs.httpServer.listening) await new Promise((r) => cs.httpServer.once('listening', r));
  const base = `http://127.0.0.1:${cs.httpServer.address().port}`;

  const get = async (p, auth = true) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await realFetch(base + p, { headers: auth ? { authorization: 'Bearer smoke-token' } : {}, signal: ctrl.signal });
      return { status: r.status, body: (await r.text()).slice(0, 200) };
    } catch (e) {
      return { status: 'no answer', body: e.message };
    } finally { clearTimeout(timer); }
  };

  const list = routes();
  assert.ok(list.length > 100, `found only ${list.length} routes; did the router change shape?`);
  const bad = [];
  for (const q of [`?guildId=${GID}`, '?guildId=123456789012345678', '']) {
    for (const p of list) {
      const r = await get(p + q);
      if (r.status === 'no answer' || r.status >= 500) bad.push(`${r.status} GET ${p}${q} → ${r.body}`);
    }
  }
  assert.deepEqual(bad, [], `routes that crashed or hung:\n${bad.join('\n')}`);

  // Every local file the dashboard page loads must be served without a token
  // (the page loads them before anyone signs in).
  const html = fs.readFileSync(path.join(ROOT, 'public', 'dashboard.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/?[\w\-./]+\.(?:js|css|svg|png|ico|webmanifest))"/g)]
    .map((m) => (m[1].startsWith('/') ? m[1] : `/${m[1]}`));
  assert.ok(assets.length > 3, 'dashboard.html assets not found');
  const missing = [];
  for (const a of new Set(['/dashboard.html', ...assets])) {
    const r = await get(a, false);
    if (r.status !== 200) missing.push(`${r.status} ${a}`);
  }
  assert.deepEqual(missing, [], `dashboard files not served:\n${missing.join('\n')}`);
});
