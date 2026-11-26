const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');

const FILTERS = [
  '3d', 'bassboost', 'echo', 'flanger', 'gate', 'haas', 'karaoke',
  'nightcore', 'reverse', 'vaporwave', 'mcompand', 'phaser',
  'tremolo', 'surround', 'earwax',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Audio filter array — modulate the transmission')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Engage a filter')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Filter to engage')
            .setRequired(true)
            .addChoices(...FILTERS.map((f) => ({ name: f, value: f }))),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Disengage a filter')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Filter to disengage')
            .setRequired(true)
            .addChoices(...FILTERS.map((f) => ({ name: f, value: f }))),
        ),
    )
    .addSubcommand((sub) => sub.setName('clear').setDescription('Disengage all filters'))
    .addSubcommand((sub) => sub.setName('list').setDescription('Show active filters')),

  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      const name = interaction.options.getString('name');
      queue.filters.add(name);
      return interaction.reply(`✦  Filter engaged: **${name}** · active: \`${queue.filters.names.join(', ') || 'none'}\``);
    }
    if (sub === 'remove') {
      const name = interaction.options.getString('name');
      queue.filters.remove(name);
      return interaction.reply(`✕  Filter disengaged: **${name}** · active: \`${queue.filters.names.join(', ') || 'none'}\``);
    }
    if (sub === 'clear') {
      queue.filters.clear();
      return interaction.reply('✕  All filters disengaged.');
    }
    if (sub === 'list') {
      const active = queue.filters.names;
      return interaction.reply(
        active.length
          ? `✦  Active filters: ${active.map((n) => `\`${n}\``).join(' · ')}`
          : '◌ No filters engaged.',
      );
    }
  },
};
