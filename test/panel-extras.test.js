const test = require('node:test');
const assert = require('node:assert/strict');
const x = require('../lib/panel-extras');

test('permissions: public paths need no rank', () => {
  for (const p of ['/', '/status', '/style.css', '/sounds/a.mp3', '/api/health', '/api/status/public', '/api/auth/me']) {
    assert.equal(x.requiredRank('GET', p), null, p);
  }
});

test('permissions: dangerous routes need high ranks', () => {
  assert.equal(x.requiredRank('POST', '/api/dev/db/query'), 'owner');
  assert.equal(x.requiredRank('GET', '/api/dev/db/tables'), 'owner');
  assert.equal(x.requiredRank('POST', '/api/control/restart'), 'owner');
  assert.equal(x.requiredRank('POST', '/api/backup/restore'), 'owner');
  assert.equal(x.requiredRank('POST', '/api/roles/grant'), 'owner');
  assert.equal(x.requiredRank('POST', '/api/backup/create'), 'admin');
  assert.equal(x.requiredRank('POST', '/api/status/override'), 'admin');
  assert.equal(x.requiredRank('POST', '/api/admin/role-create'), 'admin');
  assert.equal(x.requiredRank('GET', '/api/panel-audit'), 'admin');
  assert.equal(x.requiredRank('POST', '/api/mod/ban'), 'moderator');
  assert.equal(x.requiredRank('POST', '/api/sounds/play'), 'moderator');
  assert.equal(x.requiredRank('GET', '/api/history'), 'member');
  assert.equal(x.requiredRank('POST', '/api/social/rate'), 'member');
});

test('permissions: ladder comparison', () => {
  assert.equal(x.rankAtLeast('admin', 'moderator'), true);
  assert.equal(x.rankAtLeast('member', 'moderator'), false);
  assert.equal(x.rankAtLeast('banned', 'member'), false);
});

test('lyrics: LRC parsing sorts lines and handles repeated stamps', () => {
  assert.deepEqual(x.parseLrc('[00:10.50] two\n[ar:someone]\n[00:01.00][00:20.00] one'), [
    { t: 1, text: 'one' }, { t: 10.5, text: 'two' }, { t: 20, text: 'one' },
  ]);
  assert.deepEqual(x.parseLrc(null), []);
});

test('lyrics: titles lose video noise', () => {
  assert.equal(x.cleanTitle('Alan Walker - Void (Official Lyric Video) [4K]'), 'Alan Walker - Void');
  assert.equal(x.cleanTitle('Kill Me Once ▶ FNAF SONG'), 'Kill Me Once FNAF SONG');
});

test('lyrics: picks the matching artist and length, skips instrumental', () => {
  const a = { artistName: 'Other', trackName: 'Void', duration: 100, plainLyrics: 'x' };
  const b = { artistName: 'Alan Walker', trackName: 'Void', duration: 200, syncedLyrics: '[00:01.00] y' };
  const c = { artistName: 'Alan Walker', trackName: 'Void', duration: 200, instrumental: true, plainLyrics: 'z' };
  assert.equal(x.pickLyrics([a, c, b], 'Alan Walker Void', 200), b);
  assert.equal(x.pickLyrics([c], 'Alan Walker Void', 200), null);
});

test('sounds: file names are made safe', () => {
  assert.equal(x.safeSoundName('honk.mp3'), 'honk.mp3');
  assert.equal(x.safeSoundName('..\\..\\evil.mp3'), 'evil.mp3');
  assert.equal(x.safeSoundName('../../index.js'), null);
  assert.equal(x.safeSoundName('.mp3'), null);
});

test('status worker: stale data reports an outage, fresh data does not', async () => {
  const { applyStaleness } = await import('../deploy/status-worker/worker.mjs');
  const snap = { overall: 'operational', services: [{ id: 'bot', status: 'operational' }, { id: 'youtube', status: 'operational' }] };
  assert.equal(applyStaleness(snap, 1000, 2000).overall, 'operational');
  const stale = applyStaleness(snap, 0, 10 * 60 * 1000);
  assert.equal(stale.overall, 'offline');
  assert.equal(stale.services[0].status, 'offline');
  assert.equal(stale.services[1].status, 'operational');
});

test('status worker: alerts once when down and once when back', async () => {
  const { checkHeartbeat } = await import('../deploy/status-worker/worker.mjs');
  const kv = new Map([['receivedAt', '0']]);
  const env = { STATUS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } }, DISCORD_WEBHOOK_URL: 'https://example.invalid/hook' };
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (_u, o) => { sent.push(JSON.parse(o.body).content); return new Response('{}'); };
  try {
    kv.set('receivedAt', '1');
    await checkHeartbeat(env, 10 * 60 * 1000);
    await checkHeartbeat(env, 11 * 60 * 1000);
    assert.equal(sent.length, 1);
    kv.set('receivedAt', String(12 * 60 * 1000));
    await checkHeartbeat(env, 12 * 60 * 1000 + 1000);
    assert.equal(sent.length, 2);
    assert.match(sent[1], /back online/);
  } finally { global.fetch = realFetch; }
});
