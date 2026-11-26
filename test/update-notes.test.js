// Update notes DM: picking CHANGELOG sections between two versions (lib/update-notes.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChannelType } = require('discord.js');
const { cmpVersion, sectionsBetween, formatNotes, postsOn, pingsOn, run } = require('../lib/update-notes');

const MD = [
  '# Changelog', '', '## [Unreleased]', '', '- not yet', '',
  '## [3.13.2] — 2026-11-26', '', '### Fixed', '- Create Room', '',
  '## [3.13.1] — 2026-11-25', '', '### Fixed', '- token gate', '',
  '## [3.13.0] — 2026-11-25', '', '### Added', '- https', '',
  '## [3.10.0] — 2026-11-20', '', '- old', '',
].join('\r\n');

test('cmpVersion compares numerically, not as text', () => {
  assert.equal(cmpVersion('3.10.0', '3.9.9'), 1);
  assert.equal(cmpVersion('3.13.2', '3.13.2'), 0);
  assert.equal(cmpVersion('3.13', '3.13.1'), -1);
});

test('sectionsBetween: newer than from, up to current, newest first, no Unreleased', () => {
  assert.deepEqual(sectionsBetween(MD, '3.13.0', '3.13.2').map((s) => s.version), ['3.13.2', '3.13.1']);
  assert.deepEqual(sectionsBetween(MD, '3.9.0', '3.13.1').map((s) => s.version), ['3.13.1', '3.13.0', '3.10.0']);
  assert.deepEqual(sectionsBetween(MD, '3.13.2', '3.13.2'), []);
});

test('formatNotes turns ### headings into underlined text', () => {
  const out = formatNotes(sectionsBetween(MD, '3.13.1', '3.13.2'), '3.13.1');
  assert.match(out, /^\*\*v3\.13\.2\*\*\n__Fixed__\n- Create Room$/);
});

test('formatNotes stays under the embed limit and says what it left out', () => {
  const big = Array.from({ length: 10 }, (_, i) => ({ version: `3.${20 - i}.0`, body: '- x'.repeat(300) }));
  const out = formatNotes(big, '3.10.0');
  assert.ok(out.length <= 4096);
  assert.match(out, /and \d+ older versions since v3\.10\.0\.$/);
  const huge = formatNotes([{ version: '4.0.0', body: 'y'.repeat(9000) }], '3.0.0');
  assert.ok(huge.length <= 4096 && huge.startsWith('**v4.0.0**'));
});

test('postsOn: on by default only with an updates channel; the switch wins', () => {
  assert.equal(postsOn({}), false);
  assert.equal(postsOn({ updatesChannelId: '1' }), true);
  assert.equal(postsOn({ updatesChannelId: '1', updateNotesEnabled: false }), false);
  assert.equal(pingsOn({}), true);
  assert.equal(pingsOn({ updateNotesPing: false }), false);
});

// Fake Discord: guilds with one updates channel each, recording what's sent.
const fakeClient = (guildCfgs, sent, dms) => {
  const guilds = new Map();
  for (const id of Object.keys(guildCfgs)) {
    const ch = {
      id: `c${id}`, type: ChannelType.GuildText,
      permissionsFor: () => ({ has: () => true }),
      send: async (m) => { sent.push({ guild: id, ...m }); },
    };
    guilds.set(id, {
      id, name: `g${id}`, members: { me: {} },
      roles: { cache: new Map([['r1', {}]]) },
      channels: { cache: new Map([[ch.id, ch]]) },
    });
  }
  return { guilds: { cache: guilds }, users: { fetch: async () => ({ send: async (m) => { dms.push(m); } }) } };
};

test('run: first start only records; an update posts once per server and DMs the owner', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maow-un-'));
  const statePath = path.join(dir, 'last.json');
  const cfgs = {
    a: { updatesChannelId: 'ca', updatePingRoleId: 'r1' },   // on, pings
    b: { updatesChannelId: 'cb', updateNotesEnabled: false }, // switched off
    c: {},                                                    // no channel
    d: { updatesChannelId: 'cd', lastUpdateAnnounced: '3.13.1', updateNotesPing: false }, // /announceupdate showed 3.13.1
    e: { updatesChannelId: 'ce', lastUpdateAnnounced: '3.13.2' },                        // already saw 3.13.2
  };
  const config = { getGuild: (id) => cfgs[id], updateGuild: (id, p) => Object.assign(cfgs[id], p) };
  const sent = []; const dms = [];
  const client = fakeClient(cfgs, sent, dms);
  const base = { statePath, changelog: MD, config, owner: 'owner1', gap: 0 };

  assert.deepEqual(await run(client, { ...base, version: '3.13.0' }), { sent: false, posted: 0 });
  assert.equal(sent.length + dms.length, 0);

  const r = await run(client, { ...base, version: '3.13.2' });
  assert.equal(r.sent, true);
  assert.equal(r.posted, 2);
  assert.deepEqual(sent.map((s) => s.guild).sort(), ['a', 'd']);
  const a = sent.find((s) => s.guild === 'a');
  assert.equal(a.content, '<@&r1>');
  assert.match(a.embeds[0].description, /v3\.13\.2[\s\S]*v3\.13\.1/);
  const d = sent.find((s) => s.guild === 'd');
  assert.equal(d.content, undefined);   // ping off
  assert.doesNotMatch(d.embeds[0].description, /v3\.13\.1/);   // only what it hasn't seen
  assert.equal(cfgs.a.lastUpdateAnnounced, '3.13.2');
  assert.equal(dms.length, 1);
  assert.match(dms[0].embeds[0].title, /v3\.13\.0 → v3\.13\.2/);

  // restart on the same version: nothing again
  await run(client, { ...base, version: '3.13.2' });
  assert.equal(sent.length, 2);
  assert.equal(dms.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
