const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireQueue } = require('../lib/guards');

module.exports = {
  data: new SlashCommandBuilder().setName('previous').setDescription('Replay the previous signal'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const history = queue.previousSongs || [];
    if (history.length === 0) {
      return interaction.reply({ content: '◌ No previous signal in the log.', flags: MessageFlags.Ephemeral });
    }
    const last = history[history.length - 1];
    await interaction.deferReply();
    try {
      // Queue.previous() may not exist in older distube installs — re-queue at the front as a fallback.
      if (typeof queue.previous === 'function') {
        await queue.previous();
      } else {
        queue.songs.unshift(last);
        await queue.skip();
      }
      return interaction.editReply(`◁  Replaying previous signal — **${last.name}**`);
    } catch (err) {
      return interaction.editReply(`▲ Could not replay: ${err.message || err}`);
    }
  },
};
