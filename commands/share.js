const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const playlists = require('../lib/playlists');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('share')
    .setDescription('Export a saved playlist as a portable file friends can /importpl')
    .addStringOption((opt) => opt.setName('name').setDescription('Playlist name').setRequired(true).setAutocomplete(true)),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const userLists = playlists.listFor(interaction.guildId, interaction.user.id);
    const names = Object.keys(userLists).filter((n) => n.toLowerCase().includes(focused));
    await interaction.respond(names.slice(0, 25).map((n) => ({ name: n, value: n })));
  },
  async execute(interaction) {
    const name = interaction.options.getString('name');
    let urls;
    try {
      urls = playlists.load(interaction.guildId, interaction.user.id, name);
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
    const bundle = { version: 1, name, urls, sharedBy: interaction.user.username, ts: Date.now() };
    const buf = Buffer.from(JSON.stringify(bundle, null, 2));
    // Filesystem-safe attachment filename — playlists names allow spaces,
    // slashes, and other chars that produce confusing or unsafe downloads.
    const safeFile = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'playlist';
    return interaction.reply({
      content: `✦  Shareable export of **${name}** — ${urls.length} signals. Hand the file to a friend; they run \`/importpl\` to add it to their own collection.`,
      files: [new AttachmentBuilder(buf, { name: `${safeFile}.maowpl.json` })],
      flags: MessageFlags.Ephemeral,
    });
  },
};
