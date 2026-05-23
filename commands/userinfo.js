const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show info about a member (or yourself)')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const roles = member ? [...member.roles.cache.values()].filter((r) => r.id !== interaction.guild.id).sort((a, b) => b.position - a.position) : [];
    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || COLORS.COSMIC)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Bot', value: user.bot ? 'yes' : 'no', inline: true },
        { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        ...(member ? [
          { name: 'Joined server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: 'Display name', value: member.displayName, inline: true },
          { name: 'Highest role', value: member.roles.highest.toString(), inline: true },
          { name: `Roles (${roles.length})`, value: roles.slice(0, 20).map((r) => r.toString()).join(' ') || '*none*' },
        ] : [{ name: 'Member', value: '*Not in this server*' }]),
      );
    return interaction.reply({ embeds: [embed] });
  },
};
