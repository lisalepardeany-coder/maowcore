const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const pomodoro = require('../lib/pomodoro');
const { PRESETS } = require('../lib/ambience');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pomodoro')
    .setDescription('Focus + break timer with music or a calm ambience')
    .addSubcommand((sub) =>
      sub.setName('start').setDescription('Start a Pomodoro session')
        .addIntegerOption((o) => o.setName('focus').setDescription('Focus minutes (default 25)').setMinValue(1).setMaxValue(120))
        .addIntegerOption((o) => o.setName('break').setDescription('Break minutes (default 5)').setMinValue(1).setMaxValue(60))
        .addStringOption((o) => o.setName('ambience').setDescription('Calm loop during focus instead of music')
          .addChoices(...Object.entries(PRESETS).map(([value, p]) => ({ name: `${p.emoji} ${p.label}`, value }))))
        .addStringOption((o) => o.setName('focusurl').setDescription('Focus music URL (default lofi)'))
        .addStringOption((o) => o.setName('breakurl').setDescription('Break music URL (default ambient; "none" for silence)')))
    .addSubcommand((sub) => sub.setName('status').setDescription('Time left in this block'))
    .addSubcommand((sub) => sub.setName('stop').setDescription('Stop the session')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'stop') {
      const had = pomodoro.stop(interaction.guildId, interaction.client.distube);
      return interaction.reply(had ? '🍅  Pomodoro stopped.' : '◌ No Pomodoro is running.');
    }
    if (sub === 'status') {
      const s = pomodoro.status(interaction.guildId);
      return interaction.reply({ content: s ? `🍅 ${s.phase === 'focus' ? `Focus ${s.round}` : 'Break'} — ends <t:${Math.floor(s.endsAt / 1000)}:R>` : '◌ No Pomodoro is running.', flags: MessageFlags.Ephemeral });
    }
    const voice = interaction.member?.voice?.channel;
    if (!voice) return interaction.reply({ content: '◌ Join a voice channel first.', flags: MessageFlags.Ephemeral });
    const breakUrl = interaction.options.getString('breakurl');
    const opts = {
      focusMin: interaction.options.getInteger('focus') || 25,
      breakMin: interaction.options.getInteger('break') || 5,
      ambience: interaction.options.getString('ambience') || null,
      focusUrl: interaction.options.getString('focusurl') || pomodoro.PRESET_FOCUS,
      breakUrl: breakUrl?.toLowerCase() === 'none' ? null : (breakUrl || pomodoro.PRESET_BREAK),
    };
    pomodoro.start(interaction.client.distube, interaction.guildId, voice, interaction.channel, interaction.member, opts);
    return interaction.reply(`🍅  Pomodoro started — ${opts.focusMin} min focus${opts.ambience ? ` with ${PRESETS[opts.ambience].emoji} ${PRESETS[opts.ambience].label}` : ''} / ${opts.breakMin} min break.`);
  },
};
