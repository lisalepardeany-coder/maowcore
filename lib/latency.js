// ===== Ping to Discord, measured properly =====
// The bot used to show either Discord's heartbeat (client.ws.ping: one sample
// every ~41 s, -1 until the first one, and inflated whenever the bot is busy)
// or, as a fallback, a REST request through discord.js (its queue plus a fresh
// HTTPS handshake made it read 4-7x too high). The dashboard switched between
// the two, so the number jumped around and rarely matched reality.
//
// Now there is one source for every place that shows ping:
//   network   - the real round trip: time to open a TCP connection to Discord's
//               gateway (one network round trip, no Discord processing, no
//               discord.js queue). Every 10 s, median of the last 6.
//   heartbeat - Discord's own heartbeat ack time, median of the last 5 acks
//               (each sample is one ack, so a single slow one doesn't show).
//   ms        - what to display: network, else heartbeat, else null (unknown;
//               never a fake 0 or -1).
const net = require('node:net');
const dns = require('node:dns').promises;

const HOST = 'gateway.discord.gg';
const PORT = 443;
const EVERY_MS = 10_000;
const DNS_EVERY_MS = 10 * 60_000;
const KEEP_NET = 6;
const KEEP_BEAT = 5;

// Pure (unit tested): median of the numbers in a list, ignoring junk; null if none.
const median = (list) => {
  const v = list.filter((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

// Pure (unit tested): the latency in a discord.js debug line, or null.
// e.g. "[WS => Shard 0] Heartbeat acknowledged, latency of 42ms."
const heartbeatFromDebug = (line) => {
  const m = /Heartbeat acknowledged, latency of (\d+(?:\.\d+)?)ms/.exec(String(line || ''));
  return m ? Number(m[1]) : null;
};

const state = {
  network: [], heartbeat: [], ip: null, ipAt: 0, lastError: null, updatedAt: null, timer: null,
};

const push = (list, value, keep) => { list.push(value); if (list.length > keep) list.shift(); };

// One TCP handshake to the gateway, in ms (null on failure).
const tcpRoundTrip = (ip, timeoutMs = 3000) => new Promise((resolve) => {
  const started = process.hrtime.bigint();
  const sock = net.connect({ host: ip, port: PORT });
  const done = (value) => { sock.destroy(); resolve(value); };
  sock.once('connect', () => done(Number(process.hrtime.bigint() - started) / 1e6));
  sock.once('error', () => done(null));
  sock.setTimeout(timeoutMs, () => done(null));
});

const sampleNetwork = async () => {
  try {
    if (!state.ip || Date.now() - state.ipAt > DNS_EVERY_MS) {
      state.ip = (await dns.lookup(HOST)).address; // DNS kept out of the timing
      state.ipAt = Date.now();
    }
    const ms = await tcpRoundTrip(state.ip);
    if (ms == null) { state.lastError = 'gateway did not answer'; state.ip = null; return; }
    push(state.network, ms, KEEP_NET);
    state.lastError = null;
    state.updatedAt = Date.now();
  } catch (e) {
    state.lastError = e.message;
    state.ip = null;
  }
};

const round = (x) => (x == null ? null : Math.round(x));

// Everything a display needs. Safe to call before start() (all null).
const get = () => {
  const network = median(state.network);
  const heartbeat = median(state.heartbeat);
  const ms = network ?? heartbeat;
  return {
    ms: round(ms),
    source: network != null ? 'network' : heartbeat != null ? 'heartbeat' : null,
    network: round(network),
    heartbeat: round(heartbeat),
    samples: { network: state.network.length, heartbeat: state.heartbeat.length },
    updatedAt: state.updatedAt,
    error: state.lastError,
  };
};

// "9 ms", or "—" when unknown.
const label = () => { const { ms } = get(); return ms == null ? '—' : `${ms} ms`; };

let started = false;
const start = (client) => {
  if (started) return module.exports;
  started = true;
  // Heartbeat acks: discord.js reports each one on the client's debug channel.
  client?.on?.('debug', (line) => {
    const ms = heartbeatFromDebug(line);
    if (ms != null) push(state.heartbeat, ms, KEEP_BEAT);
  });
  sampleNetwork();
  state.timer = setInterval(sampleNetwork, EVERY_MS);
  state.timer.unref?.();
  return module.exports;
};

const _reset = () => {
  if (state.timer) clearInterval(state.timer);
  Object.assign(state, { network: [], heartbeat: [], ip: null, ipAt: 0, lastError: null, updatedAt: null, timer: null });
  started = false;
};

module.exports = { start, get, label, median, heartbeatFromDebug, _state: state, _reset };
