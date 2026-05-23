const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Show a member's avatar")
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const url = user.displayAvatarURL({ size: 4096 });
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: user.tag })
      .setImage(url)
      .setURL(url);
    return interaction.reply({ embeds: [embed] });
  },
};
