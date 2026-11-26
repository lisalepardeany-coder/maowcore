const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const modlog = require('../lib/modlog');
const { appealDm } = require('../lib/mod-tools');
const hierarchy = require('../lib/hierarchy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user (works on members and recently-banned IDs)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    .addIntegerOption((o) => o.setName('purge_days').setDescription('Delete N days of messages (0-7)').setMinValue(0).setMaxValue(7)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason given.';
    const purgeDays = interaction.options.getInteger('purge_days') ?? 0;
    // Check everything before the DM below, so nobody is told they were banned
    // when the ban then fails.
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member && !member.bannable) return interaction.reply({ content: '◌ I cannot ban this member (role hierarchy).', flags: MessageFlags.Ephemeral });
    if (!hierarchy.canModerate(await hierarchy.actorOf(interaction), member)) return interaction.reply({ content: hierarchy.MOD_MSG, flags: MessageFlags.Ephemeral });
    try {
      // DM first (with an Appeal button when /appeals is on) — after the ban we may not share a server any more.
      await user.send(appealDm(interaction.guild, reason)).catch(() => {});
      await interaction.guild.bans.create(user.id, { reason, deleteMessageSeconds: purgeDays * 86400 });
      modlog.post(interaction.guild, { action: 'ban', target: user, mod: interaction.user, reason });
      return interaction.reply(`🔨  Banned **${user.tag}**. Reason: ${reason}`);
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
