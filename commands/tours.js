const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const { COLORS } = require('../lib/theme');

// Bandsintown free endpoint — no key needed if you use the public "preferr=" app param.
// (Heuristic: returns upcoming events for an artist.)
const fetchEvents = async (artist) => {
  const url = `https://rest.bandsintown.com/artists/${encodeURIComponent(artist)}/events?app_id=maowcore`;
  const res = await fetch(url, { headers: { 'User-Agent': 'MaowCore/1.0' } });
  if (!res.ok) return [];
  return res.json();
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tours')
    .setDescription('Show upcoming concerts for the current song\'s artist')
    .addStringOption((o) => o.setName('artist').setDescription('Override artist').setRequired(false)),
  async execute(interaction) {
    let artist = interaction.options.getString('artist');
    if (!artist) {
      const queue = await requireQueue(interaction);
      if (!queue) return;
      const song = queue.songs[0];
      artist = song.uploader?.name?.replace(/\s*-?\s*topic$/i, '').trim();
      if (!artist) return interaction.reply({ content: '◌ Could not detect artist. Pass `artist:` manually.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    const events = await fetchEvents(artist);
    if (!Array.isArray(events) || events.length === 0) {
      return interaction.editReply(`◌ No upcoming events found for **${artist}**.`);
    }
    const top5 = events.slice(0, 5).map((e) => {
      const v = e.venue || {};
      const when = new Date(e.datetime).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
      return `**${when}** — ${v.name || 'Unknown venue'}, ${v.city || ''} ${v.country || ''}\n› [tickets](${e.url || '#'})`;
    }).join('\n\n');
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: `🎤  Tours — ${artist}` })
      .setDescription(top5)
      .setFooter({ text: 'Source: Bandsintown' });
    return interaction.editReply({ embeds: [embed] });
  },
};
