// v3.2.4 — /follow on|off|status
//
// Per-user opt-in for the "bot follows the requester between voice channels"
// feature. Default off. Each user manages their own preference; admins
// don't need to gate it.

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const voiceFollow = require('../lib/voice-follow');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('follow')
    .setDescription("Toggle whether the bot follows YOU between voice channels (when you're the requester)")
    .addStringOption((o) =>
      o.setName('mode')
        .setDescription('Turn following on, off, or check current status')
        .setRequired(false)
        .addChoices(
          { name: 'on',     value: 'on' },
          { name: 'off',    value: 'off' },
          { name: 'status', value: 'status' },
        ),
    ),
  async execute(interaction) {
    const mode = interaction.options.getString('mode') || 'status';
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (mode === 'status') {
      const on = voiceFollow.isEnabled(guildId, userId);
      return interaction.reply({
        content: on
          ? '✓ **Voice-follow is ON for you.** When you request a song with `/play` and then move to a different voice channel, the bot will hop along.'
          : '✕ Voice-follow is **off** for you. Use `/follow on` to enable it.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (mode === 'on') {
      voiceFollow.setEnabled(guildId, userId, true);
      return interaction.reply({
        content: '🎵 **Voice-follow enabled.** When you `/play` something and then move to a different voice channel, the bot will follow you.\n\n*Caveats:* the bot only follows you while it\'s playing **your** request, won\'t follow into AFK channels, and silently stays put if it lacks permission to join the destination.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (mode === 'off') {
      voiceFollow.setEnabled(guildId, userId, false);
      return interaction.reply({
        content: '✕ Voice-follow disabled for you. The bot will stay put when you change channels.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
