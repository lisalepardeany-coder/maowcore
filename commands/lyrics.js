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
const { translate } = require('../lib/translate');
const { findUserQueue } = require('../lib/guards');
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

const normalize = (s) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// LRCLIB: free, keyless lyrics API. Primary source because Genius answers
// server requests with an HTML 403 block page.
const searchLrclib = async (query) => {
  const q = normalize(query);
  if (!q) return null;
  const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'MaowCore Discord bot' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`LRCLIB returned HTTP ${res.status}`);
  const results = (await res.json()).filter((r) => r.plainLyrics && !r.instrumental);
  if (!results.length) return null;
  // Rank by how many query words appear in the artist + title.
  const words = q.split(' ');
  const score = (r) => {
    const hay = normalize(`${r.artistName} ${r.trackName}`).split(' ');
    return words.filter((w) => hay.includes(w)).length;
  };
  const best = results.reduce((a, b) => (score(b) > score(a) ? b : a));
  return {
    song: {
      title: best.trackName,
      artist: { name: best.artistName },
      url: null,
      thumbnail: null,
      source: 'LRCLIB',
    },
    lyrics: best.plainLyrics,
  };
};

const searchGenius = async (query) => {
  const [first] = await genius.songs.search(query);
  if (!first) return null;
  first.source = 'Genius';
  return { song: first, lyrics: await first.lyrics() };
};

// Try each query against LRCLIB, then fall back to Genius.
const findLyrics = async (queries) => {
  let lastError = null;
  for (const q of queries) {
    try {
      const hit = await searchLrclib(q);
      if (hit) return hit;
    } catch (e) { lastError = e; }
  }
  for (const q of queries) {
    try {
      const hit = await searchGenius(q);
      if (hit) return hit;
    } catch (e) { lastError = e; }
  }
  if (lastError && !/not valid JSON/.test(lastError.message || '')) throw lastError;
  return null;
};

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
    .setFooter({ text: `Page ${idx + 1}/${pages.length} · source: ${song.source}${moodFromSentiment(sent)}` });

const buildNav = (idx, total) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lyrics:prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(idx === 0),
    new ButtonBuilder().setCustomId('lyrics:next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(idx >= total - 1),
    new ButtonBuilder().setCustomId('lyrics:translate').setLabel('🌐 Translate').setStyle(ButtonStyle.Primary),
  );

module.exports = {
  findLyrics,
  everywhere: true,
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Fetch lyric transmission for the current (or a specific) signal')
    .addStringOption((opt) =>
      opt.setName('query').setDescription('Song to search for (defaults to currently playing)').setRequired(false),
    ),
  async execute(interaction) {
    let query = interaction.options.getString('query');
    const queries = [];
    if (query) queries.push(query);
    if (!query) {
      const queue = findUserQueue(interaction);
      const song = queue?.songs?.[0];
      if (!song) {
        return interaction.reply({
          content: '◌ No active signal — pass a song name as `query`.',
          flags: MessageFlags.Ephemeral,
        });
      }
      query = cleanQuery(`${song.name} ${song.uploader?.name || ''}`);
      // Uploader names are often channel names that hurt matching, so retry without.
      queries.push(query, cleanQuery(song.name));
    }
    await interaction.deferReply();
    let song;
    let lyrics;
    try {
      const hit = await findLyrics(queries);
      if (!hit) return interaction.editReply(`◌ No lyrics found for \`${query}\` — try \`artist song\` as the query.`);
      song = hit.song;
      lyrics = stripBrackets(hit.lyrics);
    } catch (err) {
      return interaction.editReply(`▲ Lyrics scan failed: ${err.message || err}`);
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
