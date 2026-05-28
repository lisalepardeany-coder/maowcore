const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { COLORS } = require('../lib/theme');
const library = require('../lib/library');

const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('library')
    .setDescription('Play or manage songs uploaded via the dashboard')
    .addSubcommand((sub) =>
      sub.setName('play').setDescription('Play an uploaded song')
        .addStringOption((o) => o.setName('name').setDescription('Uploaded song').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub.setName('list').setDescription('List uploaded songs'))
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Delete an uploaded song')
        .addStringOption((o) => o.setName('name').setDescription('Song to delete').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const songs = library.list().filter((s) => s.name.toLowerCase().includes(focused));
    await interaction.respond(
      songs.slice(0, 25).map((s) => ({ name: s.name.slice(0, 100), value: s.id })),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const songs = library.list();
      if (!songs.length) {
        return interaction.reply({
          content: '◌ Library is empty. Upload songs via the dashboard (Library → Uploads).',
          flags: MessageFlags.Ephemeral,
        });
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setAuthor({ name: '≡  UPLOADED LIBRARY' })
        .setDescription(
          songs.slice(0, 25).map((s, i) => `\`${i + 1}.\` **${s.name}** · \`${s.ext}\` · ${fmtSize(s.size)}`).join('\n'),
        )
        .setFooter({ text: `${songs.length} song${songs.length === 1 ? '' : 's'} · upload more via the dashboard` });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove') {
      const id = interaction.options.getString('name');
      const entry = library.get(id);
      const ok = library.remove(id);
      return interaction.reply({
        content: ok ? `✕  Deleted **${entry?.name || 'song'}** from the library.` : '◌ Song not found.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // play
    const id = interaction.options.getString('name');
    const entry = library.get(id);
    if (!entry || !library.getPath(id)) {
      return interaction.reply({ content: '◌ Song not found (file may have been deleted).', flags: MessageFlags.Ephemeral });
    }
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    try {
      // Stream over the control server's HTTP endpoint. yt-dlp resolves
      // http(s) URLs but NOT local file paths (it reads "C:/" as a bad url
      // scheme), so we can't hand DisTube the raw path.
      const fileUrl = interaction.client.control._libraryUrl(entry.file);
      await interaction.client.distube.play(voice, fileUrl, {
        textChannel: interaction.channel,
        member: interaction.member,
        metadata: { localName: entry.name, durationSec: entry.durationSec },
      });
      return interaction.editReply(`♫  Playing uploaded song **${entry.name}**.`);
    } catch (err) {
      return interaction.editReply(`▲ Could not play: ${err.message || err}`);
    }
  },
};
