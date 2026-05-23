const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireQueue } = require('../lib/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Eject a signal from the queue')
    .addIntegerOption((opt) =>
      opt.setName('position').setDescription('Queue position (1 = next)').setRequired(true).setMinValue(1),
    ),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const pos = interaction.options.getInteger('position');
    if (pos < 1 || pos >= queue.songs.length) {
      return interaction.reply({ content: '◌ No signal at that mark.', flags: MessageFlags.Ephemeral });
    }
    const removed = queue.songs.splice(pos, 1)[0];
    return interaction.reply(`✕  Ejected **${removed.name}** into the void.`);
  },
};
