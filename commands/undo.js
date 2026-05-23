const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const undo = require('../lib/undo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('undo')
    .setDescription('Restore the queue from your most recent /stop (within 5 minutes)'),
  async execute(interaction) {
    const snap = undo.get(interaction.guildId);
    if (!snap) {
      return interaction.reply({ content: '◌ Nothing to undo.', flags: MessageFlags.Ephemeral });
    }
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    let added = 0;
    for (const song of snap.songs) {
      try {
        await interaction.client.distube.play(voice, song.url, {
          textChannel: interaction.channel,
          member: interaction.member,
        });
        added++;
      } catch { /* skip broken urls */ }
    }
    undo.clear(interaction.guildId);
    return interaction.editReply(`↶  Restored — ${added} signal${added === 1 ? '' : 's'} re-queued.`);
  },
};
