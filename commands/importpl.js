const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const playlists = require('../lib/playlists');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('importpl')
    .setDescription('Import a playlist bundle (.maowpl.json) shared by a friend')
    .addAttachmentOption((opt) => opt.setName('bundle').setDescription('Playlist JSON').setRequired(true))
    .addStringOption((opt) => opt.setName('rename').setDescription('Save under a different name').setRequired(false)),
  async execute(interaction) {
    const att = interaction.options.getAttachment('bundle');
    if (!att?.name?.endsWith('.json')) {
      return interaction.reply({ content: '◌ Provide a .json bundle from /share.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const res = await fetch(att.url);
      const data = await res.json();
      if (!data.urls?.length || !data.name) throw new Error('Invalid bundle format.');
      const newName = interaction.options.getString('rename') || data.name;
      const n = playlists.save(interaction.guildId, interaction.user.id, newName, data.urls);
      return interaction.editReply(`✦  Imported **${newName}** — ${n} signals${data.sharedBy ? ` (shared by ${data.sharedBy})` : ''}.`);
    } catch (e) {
      return interaction.editReply(`▲ Import failed: ${e.message}`);
    }
  },
};
