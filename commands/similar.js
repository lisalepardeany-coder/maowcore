const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { addSimilar } = require('../lib/song-radio');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('similar')
    .setDescription('Song radio: queue songs like the one playing now')
    .addIntegerOption((o) => o.setName('songs').setDescription('How many (default 5)').setMinValue(1).setMaxValue(15)),
  async execute(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guildId);
    if (!queue?.songs?.length) return interaction.reply({ content: '◌ Nothing is playing.', flags: MessageFlags.Ephemeral });
    if (interaction.member?.voice?.channelId !== queue.voice.channelId) {
      return interaction.reply({ content: '◌ Join the bot\'s voice channel first.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    try {
      const r = await addSimilar(interaction.client, queue, { count: interaction.options.getInteger('songs') || 5, member: interaction.member });
      return interaction.editReply(`📻  More like **${r.seed}** — added **${r.added}**:\n${r.names.map((n, i) => `\`${i + 1}\` ${n}`).join('\n')}`.slice(0, 1900));
    } catch (e) {
      return interaction.editReply(`▲ ${e.message}`);
    }
  },
};
