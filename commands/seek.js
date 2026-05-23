const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a mark in the current signal')
    .addIntegerOption((opt) =>
      opt.setName('seconds').setDescription('Position in seconds').setRequired(true).setMinValue(0),
    ),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const secs = interaction.options.getInteger('seconds');
    await queue.seek(secs);
    return interaction.reply(`⏵  Synchronized to **${secs}s** mark.`);
  },
};
