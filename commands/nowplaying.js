const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const { COLORS } = require('../lib/theme');
const { fmtClock, progressBar, loopLabel } = require('../lib/format');

const energyLabel = (e) => {
  if (e == null) return '—';
  if (e >= 0.75) return `${Math.round(e * 100)}% — high`;
  if (e >= 0.45) return `${Math.round(e * 100)}% — medium`;
  return `${Math.round(e * 100)}% — low`;
};

module.exports = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Inspect the current signal'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const song = queue.songs[0];
    const cur = queue.currentTime || 0;
    const total = song.duration || 0;
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: '◆  NOW TRANSMITTING' })
      .setTitle(song.name)
      .setURL(song.url || null)
      .setDescription(`\`${fmtClock(cur)}\` ${progressBar(cur, total)} \`${song.formattedDuration}\``)
      .addFields(
        { name: '✦ requested', value: `${song.user}`, inline: true },
        { name: '⌬ amplitude', value: `${queue.volume}%`, inline: true },
        { name: '↻ loop', value: loopLabel(queue.repeatMode), inline: true },
      )
      .setThumbnail(song.thumbnail || null)
      .setFooter({ text: '✧  Stellar uplink stable' });

    if (song.features) {
      embed.addFields(
        { name: '♪ tempo', value: `${song.features.tempo} BPM`, inline: true },
        { name: '♫ key', value: song.features.key, inline: true },
        { name: '⚡ energy', value: energyLabel(song.features.energy), inline: true },
      );
    }
    return interaction.reply({ embeds: [embed] });
  },
};
