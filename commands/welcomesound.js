const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcomesound')
    .setDescription('Set or clear welcome/leave sounds played when the bot joins/leaves voice (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName('which').setDescription('Welcome or leave').setRequired(true)
      .addChoices({ name: 'welcome', value: 'welcome' }, { name: 'leave', value: 'leave' }))
    .addStringOption((o) => o.setName('url').setDescription('Short audio URL (omit to clear)').setRequired(false)),
  async execute(interaction) {
    const which = interaction.options.getString('which');
    const url = interaction.options.getString('url');
    const key = which === 'welcome' ? 'welcomeSoundUrl' : 'leaveSoundUrl';
    updateGuild(interaction.guildId, { [key]: url || null });
    return interaction.reply({
      content: url ? `🔔  ${which} sound set.` : `✕  ${which} sound cleared.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
