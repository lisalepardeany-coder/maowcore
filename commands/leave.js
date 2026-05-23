const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('leave').setDescription('Disengage from voice'),
  async execute(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guildId);
    const voice = interaction.client.distube.voices.get(interaction.guildId);
    if (!queue && !voice) {
      return interaction.reply({ content: '◌ Not docked in a voice channel.', flags: MessageFlags.Ephemeral });
    }
    if (queue) queue.stop();
    voice?.leave();
    return interaction.reply('⌬  Disengaging — returning to the void.');
  },
};
