const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Show info about this server'),
  async execute(interaction) {
    const g = interaction.guild;
    const owner = await g.fetchOwner().catch(() => null);
    const bots = [...g.members.cache.values()].filter((m) => m.user.bot).length;
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setTitle(`◆  ${g.name}`)
      .setThumbnail(g.iconURL({ size: 256 }) || null)
      .addFields(
        { name: 'ID', value: g.id, inline: true },
        { name: 'Owner', value: owner ? `${owner.user.username}` : `<@${g.ownerId}>`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Members', value: `${g.memberCount}`, inline: true },
        { name: 'Bots', value: `${bots}`, inline: true },
        { name: 'Channels', value: `${g.channels.cache.size}`, inline: true },
        { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
        { name: 'Emojis', value: `${g.emojis.cache.size}`, inline: true },
        { name: 'Boost tier', value: `${g.premiumTier} (${g.premiumSubscriptionCount} boosts)`, inline: true },
      );
    return interaction.reply({ embeds: [embed] });
  },
};
