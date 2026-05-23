const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const ratings = require('../lib/ratings');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rate')
    .setDescription('Rate the currently playing signal (1–5 stars), or view top/lowest rated')
    .addSubcommand((sub) =>
      sub.setName('current').setDescription('Rate the current song')
        .addIntegerOption((opt) => opt.setName('stars').setDescription('1–5').setRequired(true).setMinValue(1).setMaxValue(5)))
    .addSubcommand((sub) => sub.setName('top').setDescription('Show top-rated signals'))
    .addSubcommand((sub) => sub.setName('low').setDescription('Show lowest-rated signals')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'current') {
      const queue = await requireQueue(interaction);
      if (!queue) return;
      const stars = interaction.options.getInteger('stars');
      try {
        ratings.rate(interaction.guildId, interaction.user.id, queue.songs[0], stars);
        return interaction.reply({ content: `★ Rated **${queue.songs[0].name}** — ${stars}/5.`, flags: MessageFlags.Ephemeral });
      } catch (e) {
        return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
      }
    }
    const list = sub === 'top' ? ratings.topRated(interaction.guildId) : ratings.lowestRated(interaction.guildId);
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: sub === 'top' ? '★  TOP-RATED SIGNALS' : '★  LOWEST-RATED SIGNALS' });
    if (!list.length) {
      embed.setDescription('*— no ratings yet —*\nRate songs with `/rate current stars:<1-5>`.');
    } else {
      embed.setDescription(list.map((e, i) => `\`${i + 1}.\`  ${'★'.repeat(Math.round(e.avg))}${'☆'.repeat(5 - Math.round(e.avg))}  **${e.name}** *(avg ${e.avg.toFixed(2)}, ${e.count} votes)*`).join('\n'));
    }
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
