const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');

// 10-band ISO graphic EQ. Each option is dB gain ±12.
const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const PRESETS = {
  flat:       [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass:       [ 8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  treble:     [ 0, 0, 0, 0, 0, 0, 2, 4, 6, 8],
  rock:       [ 4, 3, 2, 0,-2, 0, 2, 3, 4, 4],
  pop:        [-1, 0, 2, 4, 4, 2, 0,-1,-1,-1],
  vocal:      [-3,-2,-1, 1, 3, 4, 4, 3, 1, 0],
  loudness:   [ 6, 4, 0, 0,-2, 0, 0, 0, 4, 6],
};

const buildEQFilter = (gains) => {
  // ffmpeg `superequalizer` accepts gains 0–20 per band, default 10.
  // We map -12..+12 dB → 0..20. (10 = unity).
  const mapped = gains.map((g) => Math.max(0, Math.min(20, 10 + g * 0.83)));
  const args = mapped.map((g, i) => `${i + 1}b=${g.toFixed(2)}`).join(':');
  return `superequalizer=${args}`;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eq')
    .setDescription('10-band graphic equalizer')
    .addSubcommand((sub) => sub.setName('preset').setDescription('Apply a preset')
      .addStringOption((o) => o.setName('name').setDescription('Preset').setRequired(true)
        .addChoices(...Object.keys(PRESETS).map((n) => ({ name: n, value: n })))))
    .addSubcommand((sub) => sub.setName('off').setDescription('Disable the equalizer')),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const sub = interaction.options.getSubcommand();
    queue.filters.remove('_eq');
    if (sub === 'off') return interaction.reply('✕  EQ disengaged.');
    const name = interaction.options.getString('name');
    queue.client.distube.filters._eq = buildEQFilter(PRESETS[name]);
    queue.filters.add('_eq');
    return interaction.reply(`🎚  EQ preset **${name}** engaged.`);
  },
};
