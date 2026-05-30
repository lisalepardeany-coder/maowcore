const test = require('node:test');
const assert = require('node:assert/strict');
const { Diagnostics, CATEGORIES, BOOT_STEPS } = require('../lib/diagnostics');

test('Diagnostics: boot timeline starts with all steps pending', () => {
  const d = new Diagnostics();
  const snap = d.snapshot();
  assert.equal(snap.boot.length, BOOT_STEPS.length);
  for (const step of snap.boot) {
    assert.equal(step.status, 'pending');
    assert.equal(step.durationMs, null);
  }
});

test('Diagnostics: bootStart → bootOk records duration', async () => {
  const d = new Diagnostics();
  d.bootStart('env');
  await new Promise((r) => setTimeout(r, 5));
  d.bootOk('env', 'token present');
  const env = d.snapshot().boot.find((s) => s.key === 'env');
  assert.equal(env.status, 'ok');
  assert.equal(env.detail, 'token present');
  assert.ok(env.durationMs >= 4, `expected at least 4ms, got ${env.durationMs}`);
});

test('Diagnostics: bootFail captures error message', () => {
  const d = new Diagnostics();
  d.bootStart('login');
  d.bootFail('login', new Error('Invalid token'));
  const login = d.snapshot().boot.find((s) => s.key === 'login');
  assert.equal(login.status, 'fail');
  assert.equal(login.detail, 'Invalid token');
});

test('Diagnostics: bootSkip marks step as skip with reason', () => {
  const d = new Diagnostics();
  d.bootSkip('deploy', 'run separately');
  const dep = d.snapshot().boot.find((s) => s.key === 'deploy');
  assert.equal(dep.status, 'skip');
  assert.equal(dep.detail, 'run separately');
});

test('Diagnostics: record() counts events per category in 1m + 5m windows', () => {
  const d = new Diagnostics();
  const now = Date.now();
  d.record({ ts: now,            category: 'command', level: 'info' });
  d.record({ ts: now,            category: 'command', level: 'info' });
  d.record({ ts: now - 30000,    category: 'command', level: 'info' }); // 30s ago — in 1m
  d.record({ ts: now - 90000,    category: 'command', level: 'info' }); // 1.5m ago — only in 5m
  d.record({ ts: now - 90000,    category: 'play',    level: 'error' });
  const snap = d.snapshot();
  assert.equal(snap.counters.m1.command, 3);
  assert.equal(snap.counters.m5.command, 4);
  assert.equal(snap.counters.m5.play,    1);
  assert.equal(snap.counters.m5.error,   1);
});

test('Diagnostics: events older than 10 minutes are pruned', () => {
  const d = new Diagnostics();
  const now = Date.now();
  d.record({ ts: now - 11 * 60 * 1000, category: 'command', level: 'info' }); // 11 min ago
  d.record({ ts: now,                  category: 'command', level: 'info' });
  assert.equal(d.events.length, 1, 'old event should have been pruned');
});

test('Diagnostics: unknown category falls back to "system"', () => {
  const d = new Diagnostics();
  d.record({ ts: Date.now(), category: 'nonsense', level: 'info' });
  assert.equal(d.events[0].category, 'system');
});

test('Diagnostics: recent errors are stored per subsystem (cap 10)', () => {
  const d = new Diagnostics();
  for (let i = 0; i < 15; i++) {
    d.record({
      ts: Date.now(),
      category: 'discord',
      level: 'error',
      text: `boom ${i}`,
      subsystem: 'discord',
    });
  }
  assert.equal(d.errors.discord.length, 10);
  // The newest (boom 14) should be at the end.
  assert.equal(d.errors.discord[d.errors.discord.length - 1].text, 'boom 14');
});

test('Diagnostics: health reports ok / degraded / down', () => {
  const d = new Diagnostics();
  let h = d.health();
  assert.equal(h.discord, 'ok');
  // Warn → degraded
  d.record({ ts: Date.now(), category: 'discord', level: 'warn' });
  h = d.health();
  assert.equal(h.discord, 'degraded');
  // Error → down (errors take precedence)
  d.record({
    ts: Date.now(),
    category: 'discord',
    level: 'error',
    text: 'gateway lost',
    subsystem: 'discord',
  });
  h = d.health();
  assert.equal(h.discord, 'down');
});

test('Diagnostics: boot failure cascades to subsystem health', () => {
  const d = new Diagnostics();
  d.bootStart('login');
  d.bootFail('login', new Error('Invalid token'));
  const h = d.health();
  assert.equal(h.discord, 'down');
});

test('Diagnostics: CATEGORIES export includes the expected set', () => {
  for (const cat of ['startup', 'discord', 'command', 'search', 'play', 'voice', 'install', 'upload', 'library', 'http', 'ws', 'system']) {
    assert.ok(CATEGORIES.includes(cat), `expected category ${cat} in CATEGORIES`);
  }
});
