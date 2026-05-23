const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Toggle autoplay — queue related signals when manifest empties'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const next = !queue.autoplay;
    queue.toggleAutoplay ? queue.toggleAutoplay(next) : (queue.autoplay = next);
    return interaction.reply(
      next
        ? '✦  Autoplay **engaged** — manifest will extend itself when exhausted.'
        : '✕  Autoplay **disengaged** — manifest will end naturally.',
    );
  },
};
