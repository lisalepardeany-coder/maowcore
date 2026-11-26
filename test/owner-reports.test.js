// v3.17.0: error digest, start check, unused commands, cleanup of servers the bot left.
const test = require('node:test');
const assert = require('node:assert/strict');

const DAY = 86_400_000;

// ── error digest ────────────────────────────────────────────────────────────
test('groupKey puts the same error with different details together', () => {
  const { groupKey } = require('../lib/error-digest');
  const a = groupKey("✕ /play failed (812ms): Video 'abc' is unavailable");
  const b = groupKey("✕ /play failed (90ms): Video 'xyz' is unavailable");
  assert.equal(a, b);
  assert.notEqual(a, groupKey('✕ /lyrics failed (5ms): Genius timeout'));
  assert.equal(groupKey('user 123456789012345678 left'), groupKey('user 987654321098765432 left'));
});

test('digest counts per day, names the busiest server, sends finished days only', async () => {
  const d = require('../lib/error-digest');
  const day1 = new Date(2026, 10, 25, 12).getTime();
  const day2 = new Date(2026, 10, 26, 9).getTime();
  d._reset();
  for (let i = 0; i < 3; i++) d.note({ text: `✕ /lyrics failed (${i}ms): timeout`, meta: { guild: 'Cats' } }, day1);
  d.note({ text: '✕ /play failed (1ms): no results', meta: { guild: 'Dogs' } }, day1);
  d.note({ text: '✕ today only' }, day2);
  const sent = [];
  const prevOwner = process.env.OWNER_USER_ID;
  process.env.OWNER_USER_ID = '111111111111111111';
  try {
    const client = { isReady: () => true, users: { fetch: async () => ({ send: async (m) => sent.push(m) }) } };
    assert.equal(await d.sendDue(client, day2), 1);
    assert.equal(sent.length, 1);
    const e = sent[0].embeds[0];
    assert.match(e.title, /^🧾 4 errors on 2026-11-25/);
    assert.match(e.description.split('\n')[0], /×3.*lyrics.*mostly in Cats/);
    assert.equal(await d.sendDue(client, day2), 0);   // yesterday is gone, today waits
  } finally {
    if (prevOwner === undefined) delete process.env.OWNER_USER_ID; else process.env.OWNER_USER_ID = prevOwner;
  }
});

// ── start check ─────────────────────────────────────────────────────────────
test('self-check reports each part and catches missing commands', async () => {
  const sc = require('../lib/self-check');
  const os = require('node:os');
  const guild = { name: 'Cats', commands: { fetch: async () => new Map([['a', 1]]) } };
  const client = { isReady: () => true, ws: { ping: 42 }, guilds: { cache: Object.assign(new Map([['1', guild]]), { first: () => guild }) } };
  const db = { isAvailable: true, raw: { prepare: () => ({ get: () => 1 }) } };
  const r = await sc.run(client, { db, dataDir: os.tmpdir(), deploy: { buildCommandsArray: () => [1, 2, 3] } });
  assert.equal(r.ok, false);
  const by = Object.fromEntries(r.checks.map((c) => [c.name, c]));
  assert.equal(by.Discord.ok, true);
  assert.equal(by.Database.ok, true);
  assert.equal(by['Data folder'].ok, true);
  assert.equal(by['Slash commands'].ok, false);
  assert.match(by['Slash commands'].detail, /1 of 3/);
  assert.match(sc.summary(r), /✕ Slash commands/);
});

// ── unused commands across all servers ──────────────────────────────────────
test('unusedEverywhere only lists commands no server used lately', () => {
  const usage = require('../lib/command-usage');
  const cmd = (name) => ({ data: { toJSON: () => ({ name, options: [] }) } });
  const commands = new Map(['play', 'pet', 'tours'].map((n) => [n, cmd(n)]));
  const now = Date.UTC(2026, 10, 26);
  usage._reset({ _since: now - 90 * DAY });
  usage.record('g1', 'play', true, now);
  usage.record('g2', 'tours', true, now - 80 * DAY);
  assert.deepEqual(usage.unusedEverywhere(commands, now), ['pet', 'tours']);
  usage._reset({ _since: now - 2 * DAY });
  assert.deepEqual(usage.unusedEverywhere(commands, now), []);       // too early to tell
});

// ── cleanup of servers the bot left ─────────────────────────────────────────
test('guild cleanup waits 30 days and cancels when the bot comes back', () => {
  const gc = require('../lib/guild-cleanup');
  const now = Date.UTC(2026, 10, 26);
  assert.deepEqual(gc.due({ a: now - 31 * DAY, b: now - 5 * DAY, c: now - 40 * DAY }, new Set(['c']), now), ['a']);

  const removedFrom = [];
  const cfg = { ids: ['111111111111111111', '222222222222222222', '333333333333333333'] };
  const deps = {
    config: { guildIds: () => cfg.ids, removeGuild: (g) => { removedFrom.push(`cfg:${g}`); return true; } },
    usage: { forget: () => false },
    stores: { forgetGuild: (g) => [`polls.json:${g}`] },
  };
  const client = { guilds: { cache: new Map([['111111111111111111', {}]]) } };
  gc._reset({ '222222222222222222': now - 31 * DAY });
  const r = gc.sweep(client, deps, now);
  assert.deepEqual(r.map((x) => x.gid), ['222222222222222222']);
  assert.deepEqual(r[0].what, ['settings', 'polls.json:222222222222222222']);
  // 333… has settings but no mark (left while offline): its 30 days start now.
  assert.deepEqual(gc.sweep(client, deps, now + 29 * DAY), []);
  assert.deepEqual(gc.sweep(client, deps, now + 30 * DAY).map((x) => x.gid), ['333333333333333333']);
});
