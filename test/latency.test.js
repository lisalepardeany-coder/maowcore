const test = require('node:test');
const assert = require('node:assert/strict');
const latency = require('../lib/latency');

test('latency.median: middle value, ignores junk like -1 and NaN', () => {
  assert.equal(latency.median([]), null);
  assert.equal(latency.median([-1, NaN, null]), null);
  assert.equal(latency.median([30, 9, 10]), 10);
  assert.equal(latency.median([9, 10, 11, 400]), 10.5); // one slow sample doesn't drag it up
  assert.equal(latency.median([-1, 42]), 42);
});

test('latency.heartbeatFromDebug: reads discord.js heartbeat lines only', () => {
  assert.equal(latency.heartbeatFromDebug('[WS => Shard 0] Heartbeat acknowledged, latency of 42ms.'), 42);
  assert.equal(latency.heartbeatFromDebug('[WS => Shard 0] Sending a heartbeat.'), null);
  assert.equal(latency.heartbeatFromDebug(undefined), null);
});

test('latency.get: unknown is null (never a fake 0 or -1), network wins over heartbeat', () => {
  latency._reset();
  assert.deepEqual([latency.get().ms, latency.get().source, latency.label()], [null, null, '—']);
  latency._state.heartbeat.push(45, 41, 300);
  assert.deepEqual([latency.get().ms, latency.get().source], [45, 'heartbeat']);
  latency._state.network.push(9.4, 9.1, 12.8);
  const p = latency.get();
  assert.deepEqual([p.ms, p.source, p.network, p.heartbeat], [9, 'network', 9, 45]);
  assert.equal(latency.label(), '9 ms');
  latency._reset();
});

test('latency.start: heartbeat acks from the client debug event are collected', () => {
  latency._reset();
  const handlers = {};
  const client = { on: (ev, fn) => { handlers[ev] = fn; } };
  latency.start(client);
  handlers.debug('[WS => Shard 0] Heartbeat acknowledged, latency of 50ms.');
  handlers.debug('[WS => Shard 0] Heartbeat acknowledged, latency of 48ms.');
  handlers.debug('something else');
  assert.deepEqual(latency._state.heartbeat, [50, 48]);
  latency._reset(); // also stops the network timer
});
