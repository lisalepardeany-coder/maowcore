const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireQueue } = require('../lib/guards');

// FFmpeg's atempo is limited to [0.5, 2.0] per filter; chain to extend if needed.
const buildAtempoChain = (factor) => {
  const chain = [];
  let remaining = factor;
  while (remaining > 2.0) { chain.push('atempo=2.0'); remaining /= 2.0; }
  while (remaining < 0.5) { chain.push('atempo=0.5'); remaining /= 0.5; }
  chain.push(`atempo=${remaining.toFixed(4)}`);
  return chain.join(',');
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('speed')
    .setDescription('Adjust playback speed (preserves pitch). 1.0 is normal.')
    .addNumberOption((opt) => opt.setName('factor').setDescription('Speed factor: 0.5 = half, 1.0 = normal, 2.0 = double').setRequired(true).setMinValue(0.25).setMaxValue(3.0)),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const factor = interaction.options.getNumber('factor');
    // Remove any previous speed filter; we attach a custom one named "_speed".
    queue.filters.remove('_speed');
    if (Math.abs(factor - 1.0) < 0.001) {
      return interaction.reply('⏵  Speed reset to 1.0×.');
    }
    queue.client.distube.filters._speed = buildAtempoChain(factor);
    queue.filters.add('_speed');
    return interaction.reply(`⏵  Playback speed set to **${factor.toFixed(2)}×** (pitch preserved).`);
  },
};
