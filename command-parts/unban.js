const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const modlog = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName('userid').setDescription('User ID').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)),
  async execute(interaction) {
    const id = interaction.options.getString('userid');
    const reason = interaction.options.getString('reason') || 'No reason given.';
    try {
      await interaction.guild.bans.remove(id, reason);
      modlog.post(interaction.guild, { action: 'unban', target: id, mod: interaction.user, reason });
      return interaction.reply(`✦  Unbanned <@${id}>. Reason: ${reason}`);
    } catch (e) {
      return interaction.reply({ content: `▲ Not banned, or invalid ID. ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
