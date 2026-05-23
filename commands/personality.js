const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const { TONES } = require('../lib/personality');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('personality')
    .setDescription("Set the bot's response tone (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) => opt.setName('tone').setDescription('Tone preset').setRequired(true)
      .addChoices(...TONES.map((t) => ({ name: t, value: t })))),
  async execute(interaction) {
    const tone = interaction.options.getString('tone');
    updateGuild(interaction.guildId, { tone });
    return interaction.reply({ content: `✦  Bot tone set to **${tone}**.`, flags: MessageFlags.Ephemeral });
  },
};
