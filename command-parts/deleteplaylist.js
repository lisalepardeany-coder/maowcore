const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const playlists = require('../lib/playlists');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deleteplaylist')
    .setDescription('Delete one of your saved playlists')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Playlist to delete').setRequired(true).setAutocomplete(true),
    ),
  async autocomplete(interaction) {
    try {
      const focused = String(interaction.options.getFocused() || '').toLowerCase();
      const userLists = playlists.listFor(interaction.guildId, interaction.user.id);
      const names = Object.keys(userLists || {}).filter(
        (n) => typeof n === 'string' && n && n !== 'undefined' && n.toLowerCase().includes(focused),
      );
      await interaction.respond(names.slice(0, 25).map((n) => ({ name: n.slice(0, 100), value: n.slice(0, 100) })));
    } catch {
      try { await interaction.respond([]); } catch { /* ignore */ }
    }
  },
  async execute(interaction) {
    const name = interaction.options.getString('name');
    try {
      playlists.remove(interaction.guildId, interaction.user.id, name);
      return interaction.reply({ content: `✕  Deleted playlist **${name}**.`, flags: MessageFlags.Ephemeral });
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
