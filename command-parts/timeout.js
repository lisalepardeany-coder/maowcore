const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member (admin/mod only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Member to timeout').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Duration (1–10080 minutes = up to 1 week)').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') || 'No reason given.';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '◌ Member not found.', flags: MessageFlags.Ephemeral });
    try {
      await member.timeout(minutes * 60 * 1000, reason);
      return interaction.reply(`🔇  Timed out **${user.tag}** for ${minutes} min. Reason: ${reason}`);
    } catch (e) {
      return interaction.reply({ content: `▲ Could not timeout: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
