const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { updateGuild } = require('../lib/config');
const { LOCALES } = require('../lib/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Set the server language (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) => opt.setName('locale').setDescription('Language code').setRequired(true)
      .addChoices(...LOCALES.map((l) => ({ name: l, value: l })))),
  async execute(interaction) {
    const locale = interaction.options.getString('locale');
    updateGuild(interaction.guildId, { locale });
    return interaction.reply({ content: `🌐  Language set to **${locale}**.`, flags: MessageFlags.Ephemeral });
  },
};
