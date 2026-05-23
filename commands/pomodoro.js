const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const pomodoro = require('../lib/pomodoro');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pomodoro')
    .setDescription('Alternate focus + break music — Pomodoro technique')
    .addSubcommand((sub) =>
      sub.setName('start').setDescription('Start a Pomodoro session')
        .addIntegerOption((o) => o.setName('focus').setDescription('Focus minutes (default 25)').setMinValue(1).setMaxValue(120))
        .addIntegerOption((o) => o.setName('break').setDescription('Break minutes (default 5)').setMinValue(1).setMaxValue(60))
        .addStringOption((o) => o.setName('focusurl').setDescription('Focus music URL (default lofi)'))
        .addStringOption((o) => o.setName('breakurl').setDescription('Break music URL (default ambient)')))
    .addSubcommand((sub) => sub.setName('stop').setDescription('Stop the session')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'stop') {
      pomodoro.stop(interaction.guildId);
      return interaction.reply('🍅  Pomodoro stopped.');
    }
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    const opts = {
      focusMin: interaction.options.getInteger('focus') || 25,
      breakMin: interaction.options.getInteger('break') || 5,
      focusUrl: interaction.options.getString('focusurl') || pomodoro.PRESET_FOCUS,
      breakUrl: interaction.options.getString('breakurl') || pomodoro.PRESET_BREAK,
    };
    pomodoro.start(interaction.client.distube, interaction.guildId, voice, interaction.channel, interaction.member, opts);
    return interaction.reply(`🍅  Pomodoro started — ${opts.focusMin}m focus / ${opts.breakMin}m break.`);
  },
};
