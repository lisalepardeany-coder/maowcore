const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');
const Genius = require('genius-lyrics');
const { COLORS } = require('../lib/theme');
const lrclib = require('../lib/lrclib');
const { translate } = require('../lib/translate');
const sentiment = require('../lib/sentiment');

const genius = new Genius.Client(process.env.GENIUS_TOKEN || undefined);
const PAGE_SIZE = 1800;

const stripBrackets = (s) =>
  s.replace(/\[.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

const cleanQuery = (s) =>
  s
    .replace(/\(official.*?\)|\[official.*?\]/gi, '')
    .replace(/\(.*?(lyrics?|video|audio|hd|4k|mv).*?\)/gi, '')
    .replace(/lyrics?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const paginate = (text) => {
  const pages = [];
  for (let i = 0; i < text.length; i += PAGE_SIZE) pages.push(text.slice(i, i + PAGE_SIZE));
  return pages.length ? pages : [text];
};

const moodFromSentiment = (s) => {
  if (!s || s.dominant === 'neutral') return '';
  const emoji = { happy: '😊', sad: '😢', angry: '🔥', love: '💜' }[s.dominant] || '';
  return ` · ${emoji} mood: ${s.dominant}`;
};

const buildPage = (song, pages, idx, sent) =>
  new EmbedBuilder()
    .setColor(COLORS.COSMIC)
    .setAuthor({ name: '✦  LYRIC TRANSMISSION' })
    .setTitle(`${song.title} — ${song.artist.name}`)
    .setURL(song.url)
    .setDescription(pages[idx])
    .setThumbnail(song.thumbnail || song.image || null)
    .setFooter({ text: `Page ${idx + 1}/${pages.length} · source: Genius${moodFromSentiment(sent)}` });

const buildNav = (idx, total) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lyrics:prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(idx === 0),
    new ButtonBuilder().setCustomId('lyrics:next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(idx >= total - 1),
    new ButtonBuilder().setCustomId('lyrics:translate').setLabel('🌐 Translate').setStyle(ButtonStyle.Primary),
  );

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Fetch lyric transmission for the current (or a specific) signal')
    .addStringOption((opt) =>
      opt.setName('query').setDescription('Song to search for (defaults to currently playing)').setRequired(false),
    ),
  async execute(interaction) {
    let query = interaction.options.getString('query');
    if (!query) {
      const queue = interaction.client.distube.getQueue(interaction.guildId);
      const song = queue?.songs?.[0];
      if (!song) {
        return interaction.reply({
          content: '◌ No active signal — pass a song name as `query`.',
          flags: MessageFlags.Ephemeral,
        });
      }
      query = cleanQuery(`${song.name} ${song.uploader?.name || ''}`);
    }
    await interaction.deferReply();
    let song;
    try {
      const [first] = await genius.songs.search(query);
      if (!first) return interaction.editReply(`◌ No lyrics found for \`${query}\``);
      song = first;
    } catch (err) {
      return interaction.editReply(`▲ Genius scan failed: ${err.message || err}`);
    }
    let lyrics;
    try {
      lyrics = stripBrackets(await song.lyrics());
    } catch (err) {
      return interaction.editReply(`▲ Could not retrieve lyrics: ${err.message || err}`);
    }
    if (!lyrics) return interaction.editReply('◌ Lyrics came back empty — try a more specific `query`.');

    const sent = sentiment.analyze(lyrics);
    const pages = paginate(lyrics);
    let idx = 0;
    // Always show the nav row so the Translate button is available even on short lyrics.
    const reply = await interaction.editReply({
      embeds: [buildPage(song, pages, idx, sent)],
      components: [buildNav(idx, pages.length)],
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('lyrics:'),
    });
    let translatedPages = null;
    collector.on('collect', async (btn) => {
      if (btn.customId === 'lyrics:next') idx = Math.min(idx + 1, pages.length - 1);
      else if (btn.customId === 'lyrics:prev') idx = Math.max(idx - 1, 0);
      else if (btn.customId === 'lyrics:translate') {
        await btn.deferUpdate();
        if (!translatedPages) {
          try {
            const translated = await translate(lyrics, 'en');
            translatedPages = paginate(translated);
            pages.splice(0, pages.length, ...translatedPages);
            idx = 0;
          } catch (e) {
            await interaction.followUp({
              content: `▲ Translation failed: ${e.message || e}`,
              flags: MessageFlags.Ephemeral,
            }).catch(() => {});
            return;
          }
        } else {
          // Toggle back to original
          translatedPages = null;
          const originalPages = paginate(lyrics);
          pages.splice(0, pages.length, ...originalPages);
          idx = 0;
        }
        return interaction.editReply({
          embeds: [buildPage(song, pages, idx, sent)],
          components: [buildNav(idx, pages.length)],
        });
      }
      await btn.update({
        embeds: [buildPage(song, pages, idx, sent)],
        components: [buildNav(idx, pages.length)],
      });
    });
    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
