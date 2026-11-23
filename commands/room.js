const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuild } = require('../lib/config');

// Controls for the auto voice rooms (join the "Create Room" channel → you get
// your own room). The owner is whoever has Manage Channels on the room.
const isTempRoom = (ch, cfg) => {
  if (!ch || ch.type !== ChannelType.GuildVoice || !cfg.autoVoiceRoomId || ch.id === cfg.autoVoiceRoomId) return false;
  const trigger = ch.guild.channels.cache.get(cfg.autoVoiceRoomId);
  return !!trigger && ch.parentId === trigger.parentId && ch.name.startsWith('🎙 ');
};
const ownerId = (ch) => ch.permissionOverwrites.cache.find((o) => o.type === 1 && o.allow.has(PermissionFlagsBits.ManageChannels))?.id || null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('room')
    .setDescription('Control your auto voice room')
    .addSubcommand((s) => s.setName('rename').setDescription('Rename your room').addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true).setMaxLength(80)))
    .addSubcommand((s) => s.setName('limit').setDescription('Max people (0 = no limit)').addIntegerOption((o) => o.setName('people').setDescription('0–99').setRequired(true).setMinValue(0).setMaxValue(99)))
    .addSubcommand((s) => s.setName('lock').setDescription('Nobody new can join'))
    .addSubcommand((s) => s.setName('unlock').setDescription('Anyone can join again'))
    .addSubcommand((s) => s.setName('kick').setDescription('Remove someone from your room').addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s.setName('transfer').setDescription('Give the room to someone in it').addUserOption((o) => o.setName('user').setDescription('New owner').setRequired(true)))
    .addSubcommand((s) => s.setName('claim').setDescription('Take over a room whose owner left'))
    .addSubcommand((s) => s.setName('info').setDescription('Who owns this room?')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = getGuild(interaction.guildId);
    const ch = interaction.member?.voice?.channel;
    const eph = { flags: MessageFlags.Ephemeral };
    if (!isTempRoom(ch, cfg)) return interaction.reply({ content: '◌ Join your auto voice room first (join the "Create Room" channel to get one).', ...eph });
    const owner = ownerId(ch);
    if (sub === 'info') return interaction.reply({ content: `🎙 **${ch.name}** · owner: ${owner ? `<@${owner}>` : 'nobody'} · limit: ${ch.userLimit || 'none'}`, ...eph, allowedMentions: { users: [] } });
    if (sub === 'claim') {
      if (owner && ch.members.has(owner)) return interaction.reply({ content: `◌ <@${owner}> is still here — ask them to \`/room transfer\`.`, ...eph, allowedMentions: { users: [] } });
      if (owner) await ch.permissionOverwrites.delete(owner).catch(() => {});
      await ch.permissionOverwrites.edit(interaction.user.id, { ManageChannels: true, MoveMembers: true, MuteMembers: true });
      return interaction.reply({ content: '👑 The room is yours now.', ...eph });
    }
    if (owner !== interaction.user.id) return interaction.reply({ content: '◌ Only the room owner can do that.', ...eph });
    try {
      if (sub === 'rename') { await ch.setName(`🎙 ${interaction.options.getString('name')}`.slice(0, 100)); return interaction.reply({ content: '✓ Renamed. (Discord allows 2 renames per 10 minutes.)', ...eph }); }
      if (sub === 'limit') { const n = interaction.options.getInteger('people'); await ch.setUserLimit(n); return interaction.reply({ content: n ? `✓ Max ${n} people.` : '✓ No limit.', ...eph }); }
      if (sub === 'lock' || sub === 'unlock') {
        await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: sub === 'lock' ? false : null });
        if (sub === 'lock') for (const m of ch.members.values()) await ch.permissionOverwrites.edit(m.id, { Connect: true }).catch(() => {});
        return interaction.reply({ content: sub === 'lock' ? '🔒 Locked — people already inside can rejoin.' : '🔓 Unlocked.', ...eph });
      }
      if (sub === 'kick') {
        const u = interaction.options.getUser('user');
        const m = ch.members.get(u.id);
        if (!m) return interaction.reply({ content: '◌ They\'re not in your room.', ...eph });
        await m.voice.disconnect('Kicked from voice room by owner');
        await ch.permissionOverwrites.edit(u.id, { Connect: false }).catch(() => {});
        return interaction.reply({ content: `👢 Removed ${u.username} (they can't rejoin this room).`, ...eph });
      }
      if (sub === 'transfer') {
        const u = interaction.options.getUser('user');
        if (!ch.members.has(u.id) || u.bot) return interaction.reply({ content: '◌ The new owner has to be in the room.', ...eph });
        await ch.permissionOverwrites.edit(u.id, { ManageChannels: true, MoveMembers: true, MuteMembers: true });
        await ch.permissionOverwrites.delete(interaction.user.id).catch(() => {});
        return interaction.reply({ content: `👑 ${u} owns the room now.`, allowedMentions: { users: [] } });
      }
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, ...eph });
    }
    return null;
  },
  _test: { isTempRoom, ownerId },
};
