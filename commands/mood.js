const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const moods = require('../lib/moods');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mood')
    .setDescription('Auto-DJ: queue songs for a mood, based on what this server likes')
    .addStringOption((o) => o.setName('mood').setDescription('Pick a mood').setRequired(true)
      .addChoices(...Object.entries(moods.MOODS).map(([value, m]) => ({ name: `${m.emoji} ${m.label}`, value }))))
    .addIntegerOption((o) => o.setName('songs').setDescription('How many (default 8)').setMinValue(3).setMaxValue(15)),
  async execute(interaction) {
    const voice = interaction.member?.voice?.channel;
    if (!voice) return interaction.reply({ content: '◌ Join a voice channel first.', flags: MessageFlags.Ephemeral });
    const mood = interaction.options.getString('mood');
    const size = interaction.options.getInteger('songs') || 8;
    await interaction.deferReply();
    const p = moods.forGuild(mood, interaction.guildId, { size });
    const tracks = await moods.resolve(interaction.client.youtubePlugin, p);
    if (!tracks.length) return interaction.editReply('▲ I couldn\'t find songs for that mood right now. Try again in a bit.');
    // One playlist = one "queued" message instead of one per song.
    let added = 0;
    try {
      const pl = await interaction.client.distube.createCustomPlaylist(tracks.map((t) => t.url), {
        member: interaction.member, parallel: true, name: `${p.mood.emoji} ${p.mood.label} mix`,
      });
      added = pl.songs.length;
      await interaction.client.distube.play(voice, pl, { textChannel: interaction.channel, member: interaction.member });
    } catch (e) {
      return interaction.editReply(`▲ Couldn't queue the mix: ${e.message || e}`);
    }
    const lines = tracks.slice(0, 15).map((t, i) => `\`${i + 1}\` ${t.name ? t.name.slice(0, 60) : 'one of your favourites'} · *${t.why}*`);
    return interaction.editReply(`${p.mood.emoji}  **${p.mood.label}** mode: queued **${added}** songs.\n${lines.join('\n')}`.slice(0, 1900));
  },
};
