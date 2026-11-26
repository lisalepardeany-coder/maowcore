// Merged slash commands (lib/command-group.js): /sound, /mod, /playlist.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { group } = require('../lib/command-group');

// A fake part that records what it was asked to do.
const fakePart = (name, { subs, perm } = {}) => {
  const json = { name, description: `${name} desc`, options: subs ? subs.map((s) => ({ type: 1, name: s, description: s, options: [] })) : [{ type: 3, name: 'x', description: 'x' }] };
  if (perm != null) json.default_member_permissions = String(perm);
  const calls = [];
  return { calls, data: { toJSON: () => json }, execute: async (i) => { calls.push(i.options.getSubcommand(false)); return 'ran'; }, autocomplete: async () => { calls.push('auto'); } };
};
const interaction = ({ group: g = null, sub, perms = PermissionsBitField.All }) => {
  const replies = [];
  return {
    replies,
    inGuild: () => true,
    memberPermissions: new PermissionsBitField(perms),
    options: { getSubcommandGroup: () => g, getSubcommand: () => sub },
    reply: async (m) => { replies.push(m); },
    respond: async () => {},
  };
};

test('builds subcommands, groups and flat parts; keeps the default permission', () => {
  const g = group({
    name: 'x', description: 'X', defaultPermission: PermissionFlagsBits.ModerateMembers,
    parts: [
      { name: 'plain', module: fakePart('plain'), description: 'Plain one' },
      { name: 'grouped', module: fakePart('grouped', { subs: ['a', 'b'] }) },
      { name: 'tools', module: fakePart('tools', { subs: ['t1', 't2'] }), flat: true },
    ],
  });
  const j = g.data.toJSON();
  assert.equal(g.data.name, 'x');
  assert.deepEqual(j.options.map((o) => [o.name, o.type]), [['plain', 1], ['grouped', 2], ['t1', 1], ['t2', 1]]);
  assert.equal(j.options[0].description, 'Plain one');
  assert.equal(j.options[0].options[0].name, 'x');
  assert.equal(j.default_member_permissions, String(PermissionFlagsBits.ModerateMembers));
});

test('routes to the right part (plain, grouped, flat)', async () => {
  const plain = fakePart('plain'); const grouped = fakePart('grouped', { subs: ['a', 'b'] }); const tools = fakePart('tools', { subs: ['t1'] });
  const g = group({ name: 'x', description: 'X', parts: [{ name: 'plain', module: plain }, { name: 'grouped', module: grouped }, { name: 'tools', module: tools, flat: true }] });
  await g.execute(interaction({ sub: 'plain' }));
  await g.execute(interaction({ group: 'grouped', sub: 'b' }));
  await g.execute(interaction({ sub: 't1' }));
  await g.autocomplete(interaction({ sub: 'plain' }));
  assert.deepEqual(plain.calls, ['plain', 'auto']);
  assert.deepEqual(grouped.calls, ['b']);
  assert.deepEqual(tools.calls, ['t1']);
});

test("checks each part's own permission", async () => {
  const ban = fakePart('ban', { perm: PermissionFlagsBits.BanMembers });
  const g = group({ name: 'mod', description: 'M', parts: [{ name: 'ban', module: ban }] });
  const denied = interaction({ sub: 'ban', perms: PermissionFlagsBits.ModerateMembers });
  await g.execute(denied);
  assert.equal(ban.calls.length, 0);
  assert.match(denied.replies[0].content, /Ban Members/);
  await g.execute(interaction({ sub: 'ban', perms: PermissionFlagsBits.BanMembers }));
  assert.deepEqual(ban.calls, ['ban']);
});

test('the real /sound, /mod and /playlist are valid and route every option', () => {
  for (const name of ['sound', 'mod', 'playlist']) {
    const c = require(`../commands/${name}`);
    const j = c.data.toJSON();
    assert.equal(j.name, name);
    assert.ok(j.options.length > 0 && j.options.length <= 25, `${name} option count`);
    for (const o of j.options) assert.ok(c.parts.has(o.name), `/${name} ${o.name} has a part`);
  }
  const mod = require('../commands/mod').data.toJSON();
  for (const s of ['kick', 'ban', 'timeout', 'tempban', 'history', 'modmail']) assert.ok(mod.options.some((o) => o.name === s), s);
});
