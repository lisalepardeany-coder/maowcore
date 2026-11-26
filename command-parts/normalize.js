const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');

module.exports = {
  data: new SlashCommandBuilder().setName('normalize').setDescription('Toggle EBU R128 volume normalization (loud + quiet songs sound equal)'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const active = queue.filters.names.includes('normalize');
    if (active) queue.filters.remove('normalize');
    else queue.filters.add('normalize');
    return interaction.reply(active ? '✕  Normalization disengaged.' : '⚖️  Loudness normalization engaged — all tracks even.');
  },
};
