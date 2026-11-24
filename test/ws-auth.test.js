const test = require('node:test');
const assert = require('node:assert');

// Stand-in for the login database: one valid session.
const authPath = require.resolve('../lib/dashboard-auth');
require.cache[authPath] = {
  id: authPath, filename: authPath, loaded: true,
  exports: { lookup: (t) => (t === 'good-session' ? { userId: '111' } : null) },
};
const ControlServer = require('../lib/control-server');
const proto = ControlServer.ControlServer?.prototype || ControlServer.prototype;

const check = (url) => {
  const ws = { sent: [], closed: false, send(m) { this.sent.push(m); }, close() { this.closed = true; } };
  const ok = proto._checkWsAuth.call({ authToken: 'tok' }, ws, { url, headers: { host: 'x' } });
  return { ok, closed: ws.closed };
};

test('live connection: the dashboard token is accepted', () => {
  assert.deepStrictEqual(check('/?token=tok'), { ok: true, closed: false });
});

test('live connection: a Discord sign-in is accepted', () => {
  assert.deepStrictEqual(check('/?session=good-session'), { ok: true, closed: false });
});

test('live connection: no or a fake sign-in is refused', () => {
  assert.deepStrictEqual(check('/'), { ok: false, closed: true });
  assert.deepStrictEqual(check('/?session=fake&token=nope'), { ok: false, closed: true });
});
