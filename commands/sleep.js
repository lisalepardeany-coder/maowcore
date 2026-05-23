const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const sleepTimer = require('../lib/sleep-timer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sleep')
    .setDescription('Schedule a sleep timer — stops + leaves after N minutes (15s fadeout)')
    .addIntegerOption((opt) => opt.setName('minutes').setDescription('Minutes (0 to cancel)').setRequired(true).setMinValue(0).setMaxValue(720)),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const minutes = interaction.options.getInteger('minutes');
    if (minutes === 0) {
      const had = sleepTimer.cancel(interaction.guildId);
      return interaction.reply(had ? '✕  Sleep timer cancelled.' : '◌ No sleep timer was set.');
    }
    sleepTimer.schedule(interaction.client.distube, interaction.guildId, minutes);
    return interaction.reply(`☾  Sleep timer engaged — disengaging in **${minutes} min** with a 15s fade-out.`);
  },
};
