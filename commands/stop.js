const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const undo = require('../lib/undo');

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Engines offline · jettison queue (use /undo to restore)'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    undo.capture(interaction.guildId, queue);
    queue.stop();
    return interaction.reply('⏹  Engines offline. Queue jettisoned — `/undo` to restore within 5 minutes.');
  },
};
