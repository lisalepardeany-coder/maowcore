const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('karaoke')
    .setDescription('Toggle vocal-removal filter — center-channel subtraction for sing-along'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const active = queue.filters.names.includes('karaoke');
    if (active) queue.filters.remove('karaoke');
    else queue.filters.add('karaoke');
    return interaction.reply(
      active
        ? '✕  Karaoke filter disengaged.'
        : '🎤  Karaoke filter engaged — vocals attenuated. Sing on.',
    );
  },
};
