const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Toggle "Now playing" announcements in this text channel (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const cfg = getGuild(interaction.guildId);
    const next = !cfg.announce;
    updateGuild(interaction.guildId, { announce: next });
    return interaction.reply({
      content: next
        ? '📢  Song announcements **enabled** — bot will post "Now playing: …" in the text channel for each new song.'
        : '🔇  Song announcements **disabled**.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
