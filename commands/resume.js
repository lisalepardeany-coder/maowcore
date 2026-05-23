const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const presence = require('../lib/presence');

module.exports = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume the transmission'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    if (!queue.paused) return interaction.reply({ content: '▶ Already transmitting.', flags: MessageFlags.Ephemeral });
    queue.resume();
    presence.refresh(interaction.client, queue);
    return interaction.reply('▶  Transmission resumed.');
  },
};
