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
    .addSubcommand((sub) =>
      sub.setName('folder').setDescription('Play every song in a library folder (a playlist)')
        .addStringOption((o) => o.setName('folder').setDescription('Library folder').setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName('shuffle').setDescription('Shuffle the songs (default: off)')))
    .addSubcommand((sub) => sub.setName('list').setDescription('List uploaded songs'))
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Delete an uploaded song')
        .addStringOption((o) => o.setName('name').setDescription('Song to delete').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) =>
      sub.setName('install').setDescription('Download a song from a URL into the library')
        .addStringOption((o) => o.setName('url').setDescription('YouTube, SoundCloud, Bandcamp, …').setRequired(true))
        .addStringOption((o) => o.setName('format').setDescription('Output format (default: original)').setRequired(false)
          .addChoices(
            { name: 'Original (smallest, preserves source)', value: 'original' },
            { name: 'MP3 320 kbps (universal)', value: 'mp3' },
            { name: 'Opus 256 kbps (smaller, modern)', value: 'opus' },
            { name: 'FLAC (lossless container — see note)', value: 'flac' },
            { name: 'WAV (uncompressed — see note)', value: 'wav' },
          ))
        .addStringOption((o) => o.setName('folder').setDescription('Library folder to save it in (default: none)').setRequired(false).setAutocomplete(true))),

  async autocomplete(interaction) {
    try {
      const opt = interaction.options.getFocused(true);
      const focused = String(opt?.value || '').toLowerCase();
      if (opt?.name === 'folder') {
        const folders = library.listFolders().filter((f) => f.name && f.name.toLowerCase().includes(focused));
        const choices = folders.slice(0, 24).map((f) => ({ name: `📁 ${f.name} (${f.count} song${f.count === 1 ? '' : 's'})`.slice(0, 100), value: f.name }));
        // /library install may name a new folder
        const typed = library.sanitizeFolder(opt.value);
        if (interaction.options.getSubcommand() === 'install' && typed && !folders.some((f) => f.name === typed)) {
          choices.unshift({ name: `➕ New folder: ${typed}`.slice(0, 100), value: typed });
        }
        return await interaction.respond(choices.slice(0, 25));
      }
      // Defensive: drop malformed manifest entries (no name / no id) so the
      // dropdown can't render "undefined / undefined / undefined" rows when
      // a partial install/upload left stale rows in the manifest.
      const songs = library.list().filter((s) =>
        s && typeof s.name === 'string' && s.name.length > 0
          && typeof s.id === 'string' && s.id.length > 0,
      ).filter((s) => s.name.toLowerCase().includes(focused));
      await interaction.respond(
        songs.slice(0, 25).map((s) => ({
          name: `${library.folderOf(s) ? `📁 ${library.folderOf(s)} · ` : ''}${String(s.name)}`.slice(0, 100) || 'Untitled',
          value: String(s.id).slice(0, 100),
        })),
      );
    } catch {
      // Never throw out of autocomplete — Discord will show an empty
      // dropdown which is better than the bot crashing on a malformed entry.
      try { await interaction.respond([]); } catch { /* ignore */ }
    }
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

    if (sub === 'install') {
      const url = interaction.options.getString('url');
      const format = interaction.options.getString('format') || 'original';
      const folder = interaction.options.getString('folder') || '';
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const { entry, alreadyInstalled, copied } = await library.installFromUrl(url, { format, folder });
        const sizeStr = `${(entry.size / 1024 / 1024).toFixed(1)} MB`;
        const where = entry.folder ? ` in 📁 **${entry.folder}**` : '';
        if (alreadyInstalled) {
          return interaction.editReply(`↩  Already installed${where}: **${entry.name}** (${entry.ext}, ${sizeStr})`);
        }
        const flag = entry.losslessInLossyContainer ? '  *(note: lossy source in a lossless container)*' : '';
        return interaction.editReply(`✓  ${copied ? 'Copied' : 'Installed'} **${entry.name}**${where} · ${entry.ext} · ${sizeStr}${flag}`);
      } catch (e) {
        return interaction.editReply(`▲ Install failed: ${e.message}`);
      }
    }

    if (sub === 'folder') {
      const name = library.sanitizeFolder(interaction.options.getString('folder'));
      const songs = library.list().filter((s) => name && library.folderOf(s) === name && library.getPath(s.id));
      if (!songs.length) {
        return interaction.reply({ content: `◌ No songs in a folder called **${name || '?'}**.`, flags: MessageFlags.Ephemeral });
      }
      const voice = interaction.member.voice.channel;
      if (!voice) return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
      // playlist order when it was a playlist download, else oldest first
      const order = songs.slice().sort((a, b) => (a.playlistIndex ?? Infinity) - (b.playlistIndex ?? Infinity) || (a.addedAt || 0) - (b.addedAt || 0));
      if (interaction.options.getBoolean('shuffle')) {
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      }
      await interaction.deferReply();
      let n = 0;
      for (const entry of order) {
        try {
          await interaction.client.distube.play(voice, interaction.client.control._libraryUrl(entry.file), {
            textChannel: interaction.channel,
            member: interaction.member,
            metadata: { localName: entry.name, durationSec: entry.durationSec },
          });
          n++;
          if (n === 1) await interaction.editReply(`♫  Playing 📁 **${name}** (${order.length} songs, adding the rest…)`).catch(() => {});
        } catch { /* skip that one */ }
      }
      return interaction.editReply(n ? `♫  Playing 📁 **${name}**: ${n} song${n === 1 ? '' : 's'} queued${interaction.options.getBoolean('shuffle') ? ', shuffled' : ''}.` : '▲ Could not play any song from that folder.');
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
