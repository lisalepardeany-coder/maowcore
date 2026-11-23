// /download <link> — download a song, playlist, album or Spotify link into the
// bot's library from Discord. Playlists go through the download queue
// (lib/download-queue.js: survives restarts, waits out YouTube's rate limit)
// and the bot posts in this channel when they're done.
const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const FORMATS = [
  { name: 'Original (best, smallest)', value: 'original' },
  { name: 'MP3 320 kbps', value: 'mp3' },
  { name: 'Opus 256 kbps', value: 'opus' },
  { name: 'FLAC', value: 'flac' },
  { name: 'WAV', value: 'wav' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('download')
    .setDescription('Download a song, playlist, album or Spotify link into the bot library')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName('link').setDescription('YouTube, Spotify, SoundCloud or Bandcamp link').setRequired(true))
    .addStringOption((o) => o.setName('format').setDescription('File format (default: original)').addChoices(...FORMATS)),
  async execute(interaction) {
    const url = interaction.options.getString('link').trim();
    const format = interaction.options.getString('format') || 'original';
    if (!/^https?:\/\//i.test(url)) {
      return interaction.reply({ content: '▲ That needs to be a link (starting with https://).', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const queue = require('../lib/download-queue');
    const library = require('../lib/library');
    try {
      if (queue.isCollectionUrl(url)) {
        const job = await queue.create(url, { format, notify: { channelId: interaction.channelId, userId: interaction.user.id } });
        return interaction.editReply(`⬇ Queued **${job.name}**: ${job.counts.total} song${job.counts.total === 1 ? '' : 's'} (${format}). `
          + 'I\'ll post here when it\'s done. Progress: **⬇ Downloads** in the dashboard.');
      }
      const { entry, alreadyInstalled } = await library.installFromUrl(url, { format });
      const mb = entry.size ? `${(entry.size / 1024 / 1024).toFixed(1)} MB` : '';
      return interaction.editReply(alreadyInstalled
        ? `↩ Already in the library: **${entry.name}**`
        : `✓ Downloaded **${entry.name}** (${entry.ext}${mb ? `, ${mb}` : ''}). Play it with \`/library play\`.`);
    } catch (e) {
      return interaction.editReply(`✕ ${library.explainYtDlpError(e.message).slice(0, 1800)}`);
    }
  },
};
