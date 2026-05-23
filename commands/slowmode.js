const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const modlog = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set the channel\'s slowmode (0 = off, max 21600 = 6h)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) => o.setName('seconds').setDescription('Seconds between messages (0–21600)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  async execute(interaction) {
    const sec = interaction.options.getInteger('seconds');
    await interaction.channel.setRateLimitPerUser(sec);
    modlog.post(interaction.guild, { action: 'slowmode', target: interaction.channel.name, mod: interaction.user, reason: `${sec}s` });
    return interaction.reply(sec ? `🐌  Slowmode set to **${sec}s** in **#${interaction.channel.name}**.` : `✦  Slowmode disabled in **#${interaction.channel.name}**.`);
  },
};
