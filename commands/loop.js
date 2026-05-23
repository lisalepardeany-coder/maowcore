const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const { loopLabel } = require('../lib/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set trajectory loop mode')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: 'off', value: '0' },
          { name: 'signal (current song)', value: '1' },
          { name: 'queue (whole manifest)', value: '2' },
        ),
    ),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const mode = Number(interaction.options.getString('mode'));
    queue.setRepeatMode(mode);
    return interaction.reply(`↻  Trajectory loop: **${loopLabel(mode, 'long')}**.`);
  },
};
