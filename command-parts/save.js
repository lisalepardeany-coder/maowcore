const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const playlists = require('../lib/playlists');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('save')
    .setDescription('Save the current queue as a named playlist')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Playlist name (1–32 chars)').setRequired(true),
    ),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const name = interaction.options.getString('name');
    const urls = queue.songs.map((s) => s.url).filter(Boolean);
    try {
      const n = playlists.save(interaction.guildId, interaction.user.id, name, urls);
      return interaction.reply({
        content: `✦  Saved **${name}** — ${n} signal${n === 1 ? '' : 's'} stored.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
