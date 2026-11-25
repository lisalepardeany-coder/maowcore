// Dashboard https: lib/tls-cert.js (certificate) and the one-port http/https
// routing in lib/control-server.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const crypto = require('node:crypto');
const tlsCert = require('../lib/tls-cert');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'maow-tls-'));
const DAY = 86400000;

test('wanted: auto follows Pterodactyl, on/off override', () => {
  assert.equal(tlsCert.wanted({}), false);
  assert.equal(tlsCert.wanted({ P_SERVER_UUID: 'x' }), true);
  assert.equal(tlsCert.wanted({ P_SERVER_UUID: 'x', PANEL_HTTPS: 'off' }), false);
  assert.equal(tlsCert.wanted({ PANEL_HTTPS: 'on' }), true);
  assert.equal(tlsCert.wanted({ PANEL_HTTPS: 'AUTO' }), false);
});

test('hostsFor: localhost + public URL host + real SERVER_IP', () => {
  assert.deepEqual(tlsCert.hostsFor({}), ['localhost', '127.0.0.1']);
  assert.deepEqual(tlsCert.hostsFor({ PANEL_PUBLIC_URL: 'https://203.0.113.5:25570/', SERVER_IP: '0.0.0.0' }), ['localhost', '127.0.0.1', '203.0.113.5']);
  assert.deepEqual(tlsCert.hostsFor({ PANEL_PUBLIC_URL: 'https://Bot.Example.com', SERVER_IP: '198.51.100.7' }), ['localhost', '127.0.0.1', 'bot.example.com', '198.51.100.7']);
  assert.deepEqual(tlsCert.hostsFor({ PANEL_PUBLIC_URL: 'not a url' }), ['localhost', '127.0.0.1']);
});

test('needsNew: missing, expiring soon, or an address not covered', () => {
  const now = Date.now();
  const meta = { hosts: ['localhost', '1.2.3.4'], notAfter: new Date(now + 100 * DAY).toISOString() };
  assert.equal(tlsCert.needsNew(null, ['localhost'], now), true);
  assert.equal(tlsCert.needsNew(meta, ['localhost', '1.2.3.4'], now), false);
  assert.equal(tlsCert.needsNew(meta, ['localhost', '5.6.7.8'], now), true);
  assert.equal(tlsCert.needsNew({ ...meta, notAfter: new Date(now + 10 * DAY).toISOString() }, ['localhost'], now), true);
});

test('load: makes a certificate once, reuses it, remakes it for a new address', async () => {
  const dir = tmpDir();
  const quiet = () => {};
  const a = await tlsCert.load({ dir, env: { PANEL_PUBLIC_URL: 'https://203.0.113.5:25570' }, log: quiet });
  assert.equal(a.source, 'self-signed');
  assert.match(a.fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  const x = new crypto.X509Certificate(a.cert);
  assert.match(x.subjectAltName, /IP Address:203\.0\.113\.5/);
  assert.match(x.subjectAltName, /DNS:localhost/);
  assert.ok(x.checkPrivateKey(crypto.createPrivateKey(a.key)));

  const b = await tlsCert.load({ dir, env: { PANEL_PUBLIC_URL: 'https://203.0.113.5:25570' }, log: quiet });
  assert.equal(b.fingerprint, a.fingerprint, 'same certificate on the next start');

  const c = await tlsCert.load({ dir, env: { PANEL_PUBLIC_URL: 'https://198.51.100.7:25570' }, log: quiet });
  assert.notEqual(c.fingerprint, a.fingerprint);
  const sans = new crypto.X509Certificate(c.cert).subjectAltName;
  assert.match(sans, /198\.51\.100\.7/);
  assert.match(sans, /203\.0\.113\.5/, 'keeps the address it had before');

  // Close to expiring → remade.
  const d = await tlsCert.load({ dir, env: { PANEL_PUBLIC_URL: 'https://198.51.100.7:25570' }, now: Date.now() + 340 * DAY, log: quiet });
  assert.notEqual(d.fingerprint, c.fingerprint);
});

test('load: data/tls/cert.pem + key.pem (your own) win and are left alone', async () => {
  const dir = tmpDir();
  const own = await tlsCert.generate(['own.example.com']);
  fs.writeFileSync(path.join(dir, 'cert.pem'), own.cert);
  fs.writeFileSync(path.join(dir, 'key.pem'), own.key);
  const r = await tlsCert.load({ dir, env: {}, log: () => {} });
  assert.equal(r.source, 'custom');
  assert.equal(r.cert, own.cert);
  assert.equal(fs.existsSync(path.join(dir, 'selfsigned-cert.pem')), false);
});

test('one port: https answers, http is redirected, the bot itself keeps plain http', async (t) => {
  const { ControlServer } = require('../lib/control-server');
  const creds = await tlsCert.generate(['localhost', '127.0.0.1']);
  const ctx = {};
  const answer = (req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(req.socket.encrypted ? 'secure' : 'plain'); };
  ctx.httpsServer = https.createServer({ key: creds.key, cert: creds.cert }, answer);
  // Same rule as the constructor's http handler, with "is it the bot itself" decided by a header here
  // (every test request comes from 127.0.0.1).
  ctx.httpServer = http.createServer((req, res) => (req.headers['x-test-visitor'] ? ControlServer.prototype._toHttps.call(ctx, req, res) : answer(req, res)));
  const srv = net.createServer((s) => ControlServer.prototype._routeSocket.call(ctx, s));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  const port = srv.address().port;

  const get = (mod, headers = {}) => new Promise((resolve, reject) => {
    mod.get({ host: '127.0.0.1', port, path: '/x?y=1', headers, rejectUnauthorized: false, agent: false }, (res) => {
      let body = ''; res.on('data', (d) => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, body, location: res.headers.location }));
    }).on('error', reject);
  });

  const s = await get(https);
  assert.deepEqual([s.status, s.body], [200, 'secure']);
  const p = await get(http);
  assert.deepEqual([p.status, p.body], [200, 'plain']);
  const v = await get(http, { 'x-test-visitor': '1' });
  assert.equal(v.status, 301);
  assert.equal(v.location, `https://127.0.0.1:${port}/x?y=1`);
});
