// ===== Dashboard https =====
// The dashboard speaks https on its own port with a certificate the bot makes
// itself (self-signed). Browsers warn once ("connection is not private");
// after "Advanced > Proceed" the connection is encrypted like any https site.
//
// A trusted certificate can't be made here: Let's Encrypt has to reach the
// server on port 80 or 443 (or edit the domain's DNS), and a panel server only
// gets its own port. So:
//   * data/tls/cert.pem + key.pem  → used as they are (bring your own, e.g. one
//     the host made). Never touched by the bot.
//   * otherwise data/tls/selfsigned-*.pem, made on first start and remade when
//     it is about to expire or doesn't cover the dashboard's address.
//
// PANEL_HTTPS: auto (default: https on Pterodactyl, plain http on a PC), on, off.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');

const DIR = path.join(__dirname, '..', 'data', 'tls');
const VALID_DAYS = 365;
const RENEW_DAYS = 30;            // remake when fewer days than this are left
const DAY = 86400000;

// Should the dashboard use https? (pure)
const wanted = (env = process.env) => {
  const v = String(env.PANEL_HTTPS || 'auto').trim().toLowerCase();
  if (['1', 'on', 'true', 'yes'].includes(v)) return true;
  if (['0', 'off', 'false', 'no'].includes(v)) return false;
  return !!env.P_SERVER_UUID;
};

// Addresses the certificate must name (pure): always localhost, plus the host
// of PANEL_PUBLIC_URL and the panel's SERVER_IP when they are real addresses.
const hostsFor = (env = process.env) => {
  const hosts = new Set(['localhost', '127.0.0.1']);
  try {
    const u = String(env.PANEL_PUBLIC_URL || '').trim();
    if (u) hosts.add(new URL(u).hostname.replace(/^\[|\]$/g, '').toLowerCase());
  } catch { /* not a URL */ }
  const ip = String(env.SERVER_IP || '').trim();
  if (net.isIP(ip) && ip !== '0.0.0.0' && ip !== '::') hosts.add(ip);
  return [...hosts];
};

// Does a certificate need to be (re)made? (pure) meta = what was saved with it.
const needsNew = (meta, hosts, now = Date.now()) => {
  if (!meta || !meta.notAfter || !Array.isArray(meta.hosts)) return true;
  if (new Date(meta.notAfter).getTime() - now < RENEW_DAYS * DAY) return true;
  return hosts.some((h) => !meta.hosts.includes(h));
};

const altName = (h) => (net.isIP(h) ? { type: 7, ip: h } : { type: 2, value: h });

const generate = async (hosts, now = Date.now()) => {
  const selfsigned = require('selfsigned');
  const notBefore = new Date(now - DAY);   // a day back: clocks that run slow still accept it
  const notAfter = new Date(now + VALID_DAYS * DAY);
  const pems = await selfsigned.generate([{ name: 'commonName', value: hosts.find((h) => h !== 'localhost' && h !== '127.0.0.1') || 'localhost' }, { name: 'organizationName', value: 'MaowCore' }], {
    keyType: 'ec', curve: 'P-256', algorithm: 'sha256',
    notBeforeDate: notBefore, notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: hosts.map(altName) },
    ],
  });
  return { key: pems.private, cert: pems.cert, meta: { hosts, notAfter: notAfter.toISOString(), made: new Date(now).toISOString() } };
};

// SHA-256 fingerprint as shown by browsers (AB:CD:…).
const fingerprint = (certPem) => {
  try { return new crypto.X509Certificate(certPem).fingerprint256; } catch { return null; }
};

// Returns { key, cert, source: 'custom' | 'self-signed', fingerprint, hosts, notAfter }.
async function load({ dir = DIR, env = process.env, now = Date.now(), log = console.log } = {}) {
  const custom = { cert: path.join(dir, 'cert.pem'), key: path.join(dir, 'key.pem') };
  if (fs.existsSync(custom.cert) && fs.existsSync(custom.key)) {
    const cert = fs.readFileSync(custom.cert, 'utf8');
    let notAfter = null;
    try { notAfter = new Date(new crypto.X509Certificate(cert).validTo).toISOString(); } catch { /* checked by tls */ }
    return { key: fs.readFileSync(custom.key, 'utf8'), cert, source: 'custom', fingerprint: fingerprint(cert), hosts: null, notAfter };
  }
  const files = { cert: path.join(dir, 'selfsigned-cert.pem'), key: path.join(dir, 'selfsigned-key.pem'), meta: path.join(dir, 'selfsigned.json') };
  const hosts = hostsFor(env);
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(files.meta, 'utf8')); } catch { /* none yet */ }
  const have = fs.existsSync(files.cert) && fs.existsSync(files.key);
  if (!have || needsNew(meta, hosts, now)) {
    // Keep addresses the old certificate had, so a URL change never drops one people use.
    const all = [...new Set([...hosts, ...((have && meta?.hosts) || [])])];
    const made = await generate(all, now);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(files.key, made.key, { mode: 0o600 });
    fs.writeFileSync(files.cert, made.cert);
    fs.writeFileSync(files.meta, JSON.stringify(made.meta, null, 2));
    meta = made.meta;
    log(`[https] Made a new dashboard certificate for ${all.join(', ')} (valid until ${meta.notAfter.slice(0, 10)}).`);
  }
  const cert = fs.readFileSync(files.cert, 'utf8');
  return { key: fs.readFileSync(files.key, 'utf8'), cert, source: 'self-signed', fingerprint: fingerprint(cert), hosts: meta.hosts, notAfter: meta.notAfter };
}

module.exports = { wanted, hostsFor, needsNew, generate, fingerprint, load, DIR, RENEW_DAYS };
