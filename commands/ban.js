const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const modlog = require('../lib/modlog');

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
    try {
      await user.send(`You were banned from **${interaction.guild.name}**. Reason: ${reason}`).catch(() => {});
      await interaction.guild.bans.create(user.id, { reason, deleteMessageSeconds: purgeDays * 86400 });
      modlog.post(interaction.guild, { action: 'ban', target: user, mod: interaction.user, reason });
      return interaction.reply(`🔨  Banned **${user.tag}**. Reason: ${reason}`);
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
