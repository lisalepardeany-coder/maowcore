const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');

// Shift pitch in semitones by resampling to a different rate then tempo-correcting back.
// asetrate=48000*2^(semitones/12) , atempo=2^(-semitones/12)
const buildPitchChain = (semitones) => {
  const ratio = Math.pow(2, semitones / 12);
  const inv = 1 / ratio;
  // chain atempo if inv outside [0.5, 2]
  const chain = [`asetrate=48000*${ratio.toFixed(6)}`];
  let remaining = inv;
  while (remaining > 2.0) { chain.push('atempo=2.0'); remaining /= 2.0; }
  while (remaining < 0.5) { chain.push('atempo=0.5'); remaining /= 0.5; }
  chain.push(`atempo=${remaining.toFixed(6)}`);
  return chain.join(',');
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pitch')
    .setDescription('Shift pitch in semitones. 0 resets. ±12 = one octave.')
    .addIntegerOption((opt) => opt.setName('semitones').setDescription('Semitones (-12 to +12)').setRequired(true).setMinValue(-12).setMaxValue(12)),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const semis = interaction.options.getInteger('semitones');
    // Per-guild filter slot — see commands/eq.js for rationale.
    const slot = `_pitch_${interaction.guildId}`;
    queue.filters.remove(slot);
    if (semis === 0) {
      delete queue.client.distube.filters[slot];
      return interaction.reply('🎼  Pitch reset to 0 (no shift).');
    }
    queue.client.distube.filters[slot] = buildPitchChain(semis);
    queue.filters.add(slot);
    return interaction.reply(`🎼  Pitch shifted **${semis > 0 ? '+' : ''}${semis}** semitones.`);
  },
};
