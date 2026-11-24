const { SlashCommandBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Keep playing similar songs when the queue runs out (remembered for this server)'),
  async execute(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guildId);
    // With a queue, flip what's playing now; without one, flip the saved choice.
    const next = !(queue ? queue.autoplay : getGuild(interaction.guildId).autoplay);
    if (queue && queue.autoplay !== next) queue.toggleAutoplay();
    updateGuild(interaction.guildId, { autoplay: next });
    return interaction.reply(
      next
        ? '📻  Autoplay **on**: when the queue runs out I keep playing similar songs. Remembered for next time.'
        : '✕  Autoplay **off**: the music stops when the queue ends.',
    );
  },
};
