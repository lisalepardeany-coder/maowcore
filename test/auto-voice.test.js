// Auto voice rooms: finding the "Create Room" trigger channel (lib/auto-voice.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');
const { findTrigger, looksLikeTrigger } = require('../lib/auto-voice');

const fakeGuild = (chans) => {
  const map = new Map(chans.map((c) => [c.id, c]));
  map.find = (fn) => [...map.values()].find(fn);
  return { channels: { cache: map } };
};
const voice = (id, name) => ({ id, name, type: ChannelType.GuildVoice });

test('looksLikeTrigger matches the usual names', () => {
  for (const n of ['➕ Create Room', 'create-room', 'Create a Room', '🔊 Join to Create']) assert.ok(looksLikeTrigger(n), n);
  for (const n of ['General', '🎙 Lisa\'s Room', 'Room 1', 'Creative']) assert.ok(!looksLikeTrigger(n), n);
});

test('saved ID wins when the channel exists', () => {
  const g = fakeGuild([voice('1', '➕ Create Room'), voice('2', 'Lounge')]);
  let saved = null;
  assert.equal(findTrigger(g, { autoVoiceRoomId: '2' }, (id) => { saved = id; }).id, '2');
  assert.equal(saved, null);
});

test('missing or stale ID falls back to the name and saves it', () => {
  const g = fakeGuild([voice('1', 'General'), voice('5', '➕ Create Room')]);
  for (const cfg of [{}, { autoVoiceRoomId: '999' }]) {
    let saved = null;
    assert.equal(findTrigger(g, cfg, (id) => { saved = id; }).id, '5');
    assert.equal(saved, '5');
  }
});

test('text channel named create-room is not a trigger', () => {
  const g = fakeGuild([{ id: '3', name: 'create-room', type: ChannelType.GuildText }]);
  assert.equal(findTrigger(g, {}, () => {}), null);
});
