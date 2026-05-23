const { SlashCommandBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sponsorblock')
    .setDescription('Toggle SponsorBlock — auto-skip sponsor/intro/outro segments in YouTube videos'),
  async execute(interaction) {
    const cfg = getGuild(interaction.guildId);
    const next = !cfg.sponsorblock;
    updateGuild(interaction.guildId, { sponsorblock: next });
    return interaction.reply(
      next
        ? '✦  SponsorBlock **engaged** — sponsor, intro, outro, and self-promo segments will auto-skip.'
        : '✕  SponsorBlock **disengaged**.',
    );
  },
};
