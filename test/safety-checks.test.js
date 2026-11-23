const test = require('node:test');
const assert = require('node:assert/strict');
const { findProblems } = require('../lib/safety-checks');
const ids = (env) => findProblems(env).map((p) => p.id).sort();

test('safety: a dashboard open to other computers without a working lock is flagged', () => {
  assert.deepEqual(ids({ P_SERVER_UUID: 'x', OWNER_USER_ID: '1' }), ['open-dashboard']);
  assert.deepEqual(ids({ CONTROL_HOST: '0.0.0.0', OWNER_USER_ID: '1' }), ['open-dashboard']);
});

test('safety: the lock "on" without Discord sign-in set up is flagged (it silently does nothing)', () => {
  assert.deepEqual(ids({ P_SERVER_UUID: 'x', PANEL_REQUIRE_LOGIN: '1', OWNER_USER_ID: '1' }), ['lock-broken', 'open-dashboard']);
});

test('safety: a working lock, a CONTROL_TOKEN, or a local-only dashboard is fine', () => {
  const ok = { PANEL_REQUIRE_LOGIN: '1', DISCORD_CLIENT_ID: 'a', DISCORD_CLIENT_SECRET: 'b', OWNER_USER_ID: '1' };
  assert.deepEqual(ids({ ...ok, P_SERVER_UUID: 'x' }), []);
  assert.deepEqual(ids({ P_SERVER_UUID: 'x', CONTROL_TOKEN: 't', OWNER_USER_ID: '1' }), []);
  assert.deepEqual(ids({ CONTROL_HOST: '127.0.0.1', OWNER_USER_ID: '1' }), []);
  assert.deepEqual(ids({ OWNER_USER_ID: '1' }), []); // default host is local
});

test('safety: no owner set is a note', () => {
  assert.deepEqual(ids({}), ['no-owner']);
  assert.equal(findProblems({}).find((p) => p.id === 'no-owner').level, 'warn');
});
