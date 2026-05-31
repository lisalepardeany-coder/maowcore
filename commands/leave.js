const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder().setName('leave').setDescription('Disengage from voice'),
  async execute(interaction) {
    const distube = interaction.client.distube;
    const queue = distube.getQueue(interaction.guildId);
    const voice = distube.voices.get(interaction.guildId);
    if (!queue && !voice) {
      return interaction.reply({ content: '◌ Not docked in a voice channel.', flags: MessageFlags.Ephemeral });
    }
    const cfg = getGuild(interaction.guildId);
    const voiceChannel = voice?.channel;
    const leaveUrl = cfg.leaveSoundUrl;
    // If a leave sound is configured AND no music is currently playing,
    // play it briefly before disconnecting. Skipped during active playback
    // so we don't trample the song.
    if (leaveUrl && voiceChannel && (!queue || queue.songs.length === 0)) {
      await interaction.reply('⌬  Playing leave sound…');
      try {
        await distube.play(voiceChannel, leaveUrl);
        // DisTube will autoDisconnect when the sound finishes if no 24/7
        // mode is configured. If 24/7 IS on, we still want /leave to actually
        // leave — give the sound ~10s to play, then force disconnect.
        setTimeout(() => {
          try { distube.voices.get(interaction.guildId)?.leave(); } catch { /* */ }
        }, 10_000);
      } catch (e) {
        try { distube.voices.get(interaction.guildId)?.leave(); } catch { /* */ }
        return interaction.editReply(`⌬  Leave sound failed (${e.message}). Disengaged anyway.`);
      }
      return;
    }
    if (queue) queue.stop();
    voice?.leave();
    return interaction.reply('⌬  Disengaging — returning to the void.');
  },
};
