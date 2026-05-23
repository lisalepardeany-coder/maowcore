const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const { updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Adjust transmission amplitude (0-150)')
    .addIntegerOption((opt) =>
      opt.setName('level').setDescription('0-150').setRequired(true).setMinValue(0).setMaxValue(150),
    ),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const level = interaction.options.getInteger('level');
    queue.setVolume(level);
    updateGuild(interaction.guildId, { volume: level });
    return interaction.reply(`⌬  Amplitude calibrated to **${level}%** · persisted.`);
  },
};
