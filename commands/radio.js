const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { PRESETS, byName } = require('../lib/radio');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Tune into a preset internet radio station')
    .addStringOption((opt) =>
      opt.setName('station').setDescription('Station name').setRequired(true).setAutocomplete(true),
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = PRESETS.filter((p) => p.name.includes(focused) || p.title.toLowerCase().includes(focused));
    await interaction.respond(matches.slice(0, 25).map((p) => ({ name: `${p.name} — ${p.title}`, value: p.name })));
  },
  async execute(interaction) {
    const name = interaction.options.getString('station').toLowerCase();
    const station = byName[name];
    if (!station) {
      return interaction.reply({
        content: `◌ Unknown station. Available: ${PRESETS.map((p) => p.name).join(', ')}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    try {
      await interaction.client.distube.play(voice, station.url, {
        textChannel: interaction.channel,
        member: interaction.member,
      });
      return interaction.editReply(`📻  Tuned to **${station.title}**.`);
    } catch (err) {
      return interaction.editReply(`▲ Station failed to tune: ${err.message || err}`);
    }
  },
};
