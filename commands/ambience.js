const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ambience = require('../lib/ambience');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ambience')
    .setDescription('Play a calm looping background sound in voice')
    .addSubcommand((s) => s.setName('play').setDescription('Start an ambience loop')
      .addStringOption((o) => o.setName('sound').setDescription('Which sound').setRequired(true)
        .addChoices(...Object.entries(ambience.PRESETS).map(([value, p]) => ({ name: `${p.emoji} ${p.label}`, value }))))
      .addIntegerOption((o) => o.setName('volume').setDescription('5–100 (default 35)').setMinValue(5).setMaxValue(100)))
    .addSubcommand((s) => s.setName('stop').setDescription('Stop the ambience')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'stop') {
      const q = interaction.client.distube.getQueue(interaction.guildId);
      if (!q?.songs?.[0]?.metadata?.ambience) return interaction.reply({ content: '◌ No ambience is playing.', flags: MessageFlags.Ephemeral });
      await q.stop();
      return interaction.reply({ content: '⏹  Ambience stopped.', flags: MessageFlags.Ephemeral });
    }
    const voice = interaction.member?.voice?.channel;
    if (!voice) return interaction.reply({ content: '◌ Join a voice channel first.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const p = await ambience.playIn(interaction.client, voice, interaction.options.getString('sound'), {
        volume: interaction.options.getInteger('volume') || 35, textChannel: interaction.channel, member: interaction.member,
      });
      return interaction.editReply(`${p.emoji}  Playing **${p.label}** on loop. Stop it with \`/ambience stop\`.`);
    } catch (e) {
      return interaction.editReply(`▲ ${e.message}`);
    }
  },
};
