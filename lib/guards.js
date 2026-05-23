const { MessageFlags } = require('discord.js');

const requireQueue = async (interaction, message = '◌ No active transmission.') => {
  const queue = interaction.client.distube.getQueue(interaction.guildId);
  if (!queue) {
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    return null;
  }
  return queue;
};

module.exports = { requireQueue };
