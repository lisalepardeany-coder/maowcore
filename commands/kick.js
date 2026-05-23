const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const modlog = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason given.';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '◌ Member not found.', flags: MessageFlags.Ephemeral });
    if (!member.kickable) return interaction.reply({ content: '◌ I cannot kick this member (role hierarchy).', flags: MessageFlags.Ephemeral });
    try {
      await user.send(`You were kicked from **${interaction.guild.name}**. Reason: ${reason}`).catch(() => {});
      await member.kick(reason);
      modlog.post(interaction.guild, { action: 'kick', target: user, mod: interaction.user, reason });
      return interaction.reply(`👢  Kicked **${user.tag}**. Reason: ${reason}`);
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
