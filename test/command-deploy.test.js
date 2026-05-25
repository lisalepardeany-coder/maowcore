// Tests for lib/command-deploy.js — the auto-deploy-on-startup/join logic.
// Mocks client.rest so no actual Discord API calls fire.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Point the hash file at a sandbox so we don't trash real data/command-deploy.json.
const SANDBOX_FILE = path.join(__dirname, '..', 'data', 'command-deploy.json');
const cleanHashFile = () => { try { fs.unlinkSync(SANDBOX_FILE); } catch {} };
test.beforeEach(() => {
  cleanHashFile();
  const { _resetCache } = require('../lib/command-deploy');
  _resetCache();
});

// Tiny fake client: a `commands` Collection-shape, a `user.id`, and a `rest`
// with a `put` stub we can spy on.
const makeClient = ({ guildIds = [], commands = [{ name: 'foo' }, { name: 'bar' }] } = {}) => {
  const putCalls = [];
  const commandsMap = new Map();
  commands.forEach((c, i) => commandsMap.set(`cmd${i}`, {
    data: { toJSON: () => c },
    execute: async () => {},
  }));
  const guildCache = new Map();
  guildIds.forEach((id) => guildCache.set(id, { name: `Guild-${id}` }));
  const client = {
    user: { id: 'app-id-test' },
    commands: commandsMap,
    guilds: { cache: guildCache },
    rest: {
      put: async (route, opts) => {
        putCalls.push({ route, body: opts?.body });
        return [];
      },
    },
  };
  return { client, putCalls };
};

test('buildCommandsArray filters out invalid command entries', () => {
  const { buildCommandsArray } = require('../lib/command-deploy');
  const client = {
    commands: new Map([
      ['ok', { data: { toJSON: () => ({ name: 'ok' }) }, execute: () => {} }],
      ['no-execute', { data: { toJSON: () => ({ name: 'broken' }) } }],  // missing execute
      ['no-data', { execute: () => {} }],                                  // missing data
    ]),
  };
  const out = buildCommandsArray(client);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'ok');
});

test('commandsHash is stable and order-sensitive', () => {
  const { commandsHash } = require('../lib/command-deploy');
  const a = commandsHash([{ name: 'x' }, { name: 'y' }]);
  const b = commandsHash([{ name: 'x' }, { name: 'y' }]);
  const c = commandsHash([{ name: 'y' }, { name: 'x' }]);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('deployToGuild pushes commands on first call, skips on second (same payload)', async () => {
  const { deployToGuild } = require('../lib/command-deploy');
  const { client, putCalls } = makeClient();
  const first = await deployToGuild(client, 'guild-1');
  assert.equal(first.ok, true);
  assert.equal(first.deployed, true);
  assert.equal(first.count, 2);
  assert.equal(putCalls.length, 1);
  // Second call: same payload → cache hit → no API call.
  const second = await deployToGuild(client, 'guild-1');
  assert.equal(second.ok, true);
  assert.equal(second.deployed, false);
  assert.equal(putCalls.length, 1, 'should not have called REST again');
});

test('deployToGuild re-deploys when commands change', async () => {
  const { deployToGuild } = require('../lib/command-deploy');
  const { client, putCalls } = makeClient();
  await deployToGuild(client, 'guild-1');
  // Mutate the command set
  client.commands.set('new', { data: { toJSON: () => ({ name: 'baz' }) }, execute: () => {} });
  const second = await deployToGuild(client, 'guild-1');
  assert.equal(second.deployed, true);
  assert.equal(second.count, 3);
  assert.equal(putCalls.length, 2);
});

test('deployToGuild force=true bypasses cache', async () => {
  const { deployToGuild } = require('../lib/command-deploy');
  const { client, putCalls } = makeClient();
  await deployToGuild(client, 'guild-1');
  assert.equal(putCalls.length, 1);
  const r = await deployToGuild(client, 'guild-1', { force: true });
  assert.equal(r.deployed, true);
  assert.equal(putCalls.length, 2);
});

test('deployToGuild surfaces REST errors as { ok: false, error }', async () => {
  const { deployToGuild } = require('../lib/command-deploy');
  const { client } = makeClient();
  client.rest.put = async () => { throw new Error('rate limit pls slow down'); };
  const r = await deployToGuild(client, 'guild-x');
  assert.equal(r.ok, false);
  assert.match(r.error, /rate limit/);
});

test('deployToAll iterates every guild in client.guilds.cache', async () => {
  const { deployToAll } = require('../lib/command-deploy');
  const { client, putCalls } = makeClient({ guildIds: ['g1', 'g2', 'g3'] });
  const results = await deployToAll(client);
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => r.guildId).sort(), ['g1', 'g2', 'g3']);
  assert.ok(results.every((r) => r.ok && r.deployed));
  assert.equal(putCalls.length, 3);
  // Re-run: cache should make all of them skip.
  const second = await deployToAll(client);
  assert.ok(second.every((r) => r.ok && !r.deployed));
  assert.equal(putCalls.length, 3, 'cached run made no new REST calls');
});

test('deployToAll uses applicationGuildCommands route (not global)', async () => {
  const { deployToAll } = require('../lib/command-deploy');
  const { client, putCalls } = makeClient({ guildIds: ['g1'] });
  await deployToAll(client);
  // Route should mention guild-specific endpoint, not the global one.
  assert.match(putCalls[0].route, /applications\/app-id-test\/guilds\/g1\/commands/);
});

test('forgetGuild removes the cached hash so the next deploy re-pushes', async () => {
  const { deployToGuild, forgetGuild } = require('../lib/command-deploy');
  const { client, putCalls } = makeClient();
  await deployToGuild(client, 'guild-1');
  assert.equal(putCalls.length, 1);
  forgetGuild('guild-1');
  const r = await deployToGuild(client, 'guild-1');
  assert.equal(r.deployed, true);
  assert.equal(putCalls.length, 2);
});

test('cache survives a process restart (hash persisted to disk)', async () => {
  const { deployToGuild, _resetCache } = require('../lib/command-deploy');
  const { client, putCalls } = makeClient();
  await deployToGuild(client, 'guild-persist');
  assert.equal(putCalls.length, 1);
  // Simulate restart — drop in-memory cache; on-disk hash should still be there.
  _resetCache();
  const r = await deployToGuild(client, 'guild-persist');
  assert.equal(r.deployed, false, 'cache should hit from disk after restart');
  assert.equal(putCalls.length, 1, 'no new REST call after restart with same commands');
});

test.afterEach(() => {
  cleanHashFile();
  const { _resetCache } = require('../lib/command-deploy');
  _resetCache();
});
