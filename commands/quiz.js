const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../lib/theme');

// Per-channel quiz state (single in-flight quiz per channel).
const activeQuizzes = new Map();

const CLIP_SECONDS = 12;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Start a guess-the-song mini-game in this channel')
    .addIntegerOption((o) => o.setName('rounds').setDescription('Rounds (default 5)').setMinValue(1).setMaxValue(15))
    .addStringOption((o) => o.setName('playlist').setDescription('Optional source playlist URL')),
  async execute(interaction) {
    if (activeQuizzes.has(interaction.channelId)) {
      return interaction.reply({ content: '🎯 A quiz is already running in this channel.', flags: MessageFlags.Ephemeral });
    }
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    const rounds = interaction.options.getInteger('rounds') || 5;
    const playlistUrl = interaction.options.getString('playlist');

    // Build a song pool — either from given playlist or from default top YouTube hits
    let pool = [];
    try {
      if (playlistUrl) {
        // Use yt-dlp via the existing search infrastructure
        const results = await interaction.client.youtubePlugin.search(playlistUrl, { limit: 10 });
        pool = results;
      } else {
        const results = await interaction.client.youtubePlugin.search('top hits 2024', { limit: 20 });
        pool = results;
      }
    } catch (e) {
      return interaction.reply({ content: `▲ Couldn't build a song pool: ${e.message}`, flags: MessageFlags.Ephemeral });
    }
    if (pool.length < rounds) {
      return interaction.reply({ content: `◌ Need at least ${rounds} songs in the pool.`, flags: MessageFlags.Ephemeral });
    }

    const state = {
      rounds, current: 0, scores: new Map(), pool,
      currentSong: null, listener: null,
    };
    activeQuizzes.set(interaction.channelId, state);

    await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '🎯 Music Quiz' }).setDescription(`Starting a **${rounds}-round** quiz!\nType your guess as a plain message. First correct wins the round.`)] });

    const nextRound = async () => {
      if (state.current >= rounds) return endQuiz();
      state.current++;
      // Pick a random unused song
      const idx = Math.floor(Math.random() * state.pool.length);
      const song = state.pool.splice(idx, 1)[0];
      state.currentSong = song;
      state.roundStarted = Date.now();
      const expected = song.name.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
      try {
        await interaction.client.distube.play(voice, song.url, { textChannel: interaction.channel });
        // Seek to the middle of the song for variety
        setTimeout(() => {
          const q = interaction.client.distube.getQueue(interaction.guildId);
          if (q && song.duration > 30) { try { q.seek(Math.floor(song.duration / 2)); } catch {} }
        }, 1500);
      } catch (e) {
        interaction.channel.send(`▲ Round ${state.current} skipped: ${e.message}`);
        return setTimeout(nextRound, 500);
      }
      interaction.channel.send(`**Round ${state.current}/${rounds}** — guess the song! (${CLIP_SECONDS}s clip)`);

      // Listen for messages
      const collector = interaction.channel.createMessageCollector({ time: CLIP_SECONDS * 1000 });
      state.listener = collector;
      collector.on('collect', (m) => {
        if (m.author.bot) return;
        const guess = m.content.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        // Match if guess contains any 3+ consecutive words of the song name
        const words = expected.split(' ');
        const matched = words.length >= 3 ? guess.includes(words.slice(0, 3).join(' ')) :
                        words.length >= 2 ? guess.includes(words.slice(0, 2).join(' ')) :
                                            guess === expected;
        if (matched) {
          state.scores.set(m.author.id, (state.scores.get(m.author.id) || 0) + 1);
          interaction.channel.send(`✅ **${m.author.username}** got it! It was **${song.name}**. (+1)`);
          collector.stop('answered');
        }
      });
      collector.on('end', (_collected, reason) => {
        if (reason !== 'answered') interaction.channel.send(`⏰ Time's up! It was **${song.name}**.`);
        const q = interaction.client.distube.getQueue(interaction.guildId);
        if (q) try { q.skip().catch(() => q.stop()); } catch {}
        setTimeout(nextRound, 2000);
      });
    };

    const endQuiz = () => {
      activeQuizzes.delete(interaction.channelId);
      const ranked = [...state.scores.entries()].sort((a, b) => b[1] - a[1]);
      const lines = ranked.length
        ? ranked.map(([id, score], i) => `${i + 1}. <@${id}> — **${score}**`).join('\n')
        : '*— no winners —*';
      interaction.channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '🏆 Quiz over!' }).setDescription(lines)] });
    };

    nextRound();
  },
};
