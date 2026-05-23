const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const lastUsed = new Map(); // userId -> timestamp
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anonymous')
    .setDescription('Queue a song without revealing the requester (1/hour)')
    .addStringOption((opt) => opt.setName('query').setDescription('URL or search').setRequired(true)),
  async execute(interaction) {
    const last = lastUsed.get(interaction.user.id) || 0;
    const remaining = COOLDOWN_MS - (Date.now() - last);
    if (remaining > 0) {
      const mins = Math.ceil(remaining / 60000);
      return interaction.reply({ content: `◌ Anonymity cooldown active — try again in ${mins} min.`, flags: MessageFlags.Ephemeral });
    }
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    const query = interaction.options.getString('query');
    await interaction.reply({ content: '✦  Your request is on its way (anonymously).', flags: MessageFlags.Ephemeral });
    try {
      await interaction.client.distube.play(voice, query, {
        textChannel: interaction.channel,
        // Don't pass `member` — keeps requester anonymous in the bot's view.
      });
      lastUsed.set(interaction.user.id, Date.now());
    } catch (err) {
      await interaction.followUp({ content: `▲ Anonymous transmission failed: ${err.message || err}`, flags: MessageFlags.Ephemeral });
    }
  },
};
