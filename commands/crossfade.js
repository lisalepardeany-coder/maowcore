const { SlashCommandBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crossfade')
    .setDescription('Toggle a 5-second fade-in on every new song (simulated crossfade)'),
  async execute(interaction) {
    const cfg = getGuild(interaction.guildId);
    const next = !cfg.crossfade;
    updateGuild(interaction.guildId, { crossfade: next });
    return interaction.reply(next ? '🎚  Crossfade engaged — 5s fade-in on each new song.' : '✕  Crossfade disengaged.');
  },
};
