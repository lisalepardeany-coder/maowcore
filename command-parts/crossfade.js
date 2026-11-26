const { SlashCommandBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crossfade')
    .setDescription('Toggle smooth song changes: fade out at the end, fade in at the start'),
  async execute(interaction) {
    const cfg = getGuild(interaction.guildId);
    const next = !cfg.crossfade;
    updateGuild(interaction.guildId, { crossfade: next });
    if (!next) require('../lib/fader').clear(interaction.guildId);
    return interaction.reply(next
      ? '🎚  Crossfade on — songs fade out over their last 5 s and the next one fades in. (Starts with the next song.)'
      : '✕  Crossfade off.');
  },
};
