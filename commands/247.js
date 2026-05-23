const { SlashCommandBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggle 24/7 stay mode — bot stays in voice forever until /leave'),
  async execute(interaction) {
    const cfg = getGuild(interaction.guildId);
    const next = !cfg.stay247;
    updateGuild(interaction.guildId, { stay247: next });
    return interaction.reply(
      next
        ? '⌬  24/7 mode **engaged** — auto-disengage disabled.'
        : '⌬  24/7 mode **disengaged** — auto-disconnect restored.',
    );
  },
};
