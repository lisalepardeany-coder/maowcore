// A small fake Discord client with one server, good enough for the dashboard
// API to answer (test/api-smoke.test.js). Uses discord.js's own Collection so
// .map/.filter/.find/.first work like the real thing.
const { Collection, ChannelType, PermissionsBitField } = require('discord.js');

const GID = '900000000000000001';
const BOT_ID = '800000000000000001';
const USER_ID = '700000000000000001';

const perms = () => new PermissionsBitField(PermissionsBitField.All);

function fakeClient() {
  const roles = new Collection();
  const channels = new Collection();
  const members = new Collection();
  const guild = {
    id: GID, name: 'Test Server', ownerId: USER_ID, memberCount: 2, available: true,
    iconURL: () => null, createdTimestamp: Date.now() - 86_400_000, createdAt: new Date(),
    channels: { cache: channels, fetch: async () => channels },
    roles: { cache: roles, everyone: null, fetch: async () => roles },
    members: { cache: members, me: null, fetch: async () => members },
    commands: { fetch: async () => new Collection() },
    bans: { fetch: async () => new Collection() },
    emojis: { cache: new Collection() },
    voiceStates: { cache: new Collection() },
    fetchAuditLogs: async () => ({ entries: new Collection() }),
  };
  const role = (id, name, position) => ({
    id, name, position, color: 0, hexColor: '#000000', hoist: false, mentionable: false, managed: false,
    permissions: perms(), members: new Collection(), guild, editable: true, toString: () => `<@&${id}>`,
  });
  roles.set(GID, role(GID, '@everyone', 0));
  roles.set('200000000000000001', role('200000000000000001', 'Member', 1));
  guild.roles.everyone = roles.get(GID);
  const chan = (id, name, type, position) => ({
    id, name, type, position, rawPosition: position, guild, guildId: GID, parent: null, parentId: null,
    topic: null, nsfw: false, rateLimitPerUser: 0, members: new Collection(),
    permissionsFor: () => perms(), isTextBased: () => type === ChannelType.GuildText,
    isVoiceBased: () => type === ChannelType.GuildVoice, toString: () => `<#${id}>`,
    messages: { fetch: async () => new Collection() },
  });
  channels.set('100000000000000001', chan('100000000000000001', 'general', ChannelType.GuildText, 0));
  channels.set('100000000000000002', chan('100000000000000002', 'Voice', ChannelType.GuildVoice, 1));
  const user = (id, username, bot) => ({
    id, username, tag: username, globalName: username, bot, displayAvatarURL: () => '', avatarURL: () => null, createdTimestamp: Date.now(),
  });
  const member = (u, roleIds) => ({
    id: u.id, user: u, guild, displayName: u.username, nickname: null, joinedTimestamp: Date.now(), joinedAt: new Date(),
    permissions: perms(), voice: { channel: null, channelId: null },
    roles: { cache: new Collection(roleIds.map((r) => [r, roles.get(r)])), highest: roles.get(roleIds[roleIds.length - 1]) },
    displayAvatarURL: () => '', presence: null, communicationDisabledUntilTimestamp: null,
  });
  const botUser = user(BOT_ID, 'TestBot', true);
  const owner = user(USER_ID, 'owner', false);
  members.set(BOT_ID, member(botUser, [GID, '200000000000000001']));
  members.set(USER_ID, member(owner, [GID]));
  guild.members.me = members.get(BOT_ID);

  const guilds = new Collection([[GID, guild]]);
  const users = new Collection([[BOT_ID, botUser], [USER_ID, owner]]);
  const client = {
    ws: { ping: 1, status: 0, shards: { size: 1 } },
    user: botUser, application: { id: BOT_ID },
    guilds: { cache: guilds },
    users: { cache: users, fetch: async (id) => users.get(id) || owner },
    channels: { cache: channels, fetch: async (id) => channels.get(id) || null },
    commands: new Collection(),
    readyTimestamp: Date.now(), uptime: 60_000, isReady: () => true,
    rest: { get: async () => ({}) },
  };
  const distube = {
    queues: { collection: new Map() },
    voices: { collection: new Map(), get: () => null },
    getQueue: () => null,
    on() { return this; },
  };
  return { client, distube, guild };
}

module.exports = { fakeClient, GID, BOT_ID, USER_ID };
