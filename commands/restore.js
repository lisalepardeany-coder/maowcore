const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const session = require('../lib/session');
const { updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Resume the last saved session (after bot restart or crash)'),
  async execute(interaction) {
    const snap = session.get(interaction.guildId);
    if (!snap?.songs?.length) {
      return interaction.reply({ content: '◌ No saved session for this server.', flags: MessageFlags.Ephemeral });
    }
    const voice =
      interaction.member.voice.channel ||
      interaction.guild.channels.cache.get(snap.voiceChannelId);
    if (!voice) {
      return interaction.reply({
        content: '◌ Join a voice channel first — or rejoin the original one.',
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply();
    let added = 0;
    for (const url of snap.songs) {
      try {
        await interaction.client.distube.play(voice, url, {
          textChannel: interaction.channel,
          member: interaction.member,
        });
        added++;
      } catch { /* skip broken urls */ }
    }
    if (typeof snap.volume === 'number') updateGuild(interaction.guildId, { volume: snap.volume });
    session.clear(interaction.guildId);
    return interaction.editReply(`⌬  Restored last session — ${added} signal${added === 1 ? '' : 's'} re-queued.`);
  },
};
