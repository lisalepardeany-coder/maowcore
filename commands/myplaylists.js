const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const playlists = require('../lib/playlists');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder().setName('myplaylists').setDescription('Show your saved playlists'),
  async execute(interaction) {
    const userLists = playlists.listFor(interaction.guildId, interaction.user.id);
    const entries = Object.entries(userLists);
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: '✦  YOUR SAVED PLAYLISTS' });
    if (!entries.length) {
      embed.setDescription('*— archive empty —*\nUse `/save name:...` while a queue is active to store one.');
    } else {
      embed.setDescription(
        entries
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, urls]) => `✧ **${name}** — \`${urls.length}\` signal${urls.length === 1 ? '' : 's'}`)
          .join('\n'),
      );
    }
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
