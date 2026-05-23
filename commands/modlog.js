const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const warnings = require('../lib/warnings');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modlog')
    .setDescription('Show all server warnings (mod only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const all = warnings.listAll(interaction.guildId);
    const entries = Object.entries(all);
    if (!entries.length) {
      return interaction.reply({ content: '✦  Modlog is clean — no warnings on file.', flags: MessageFlags.Ephemeral });
    }
    const lines = entries
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 20)
      .map(([userId, list]) => `<@${userId}> — **${list.length}** warning${list.length === 1 ? '' : 's'}`);
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: '⚠️  Server Modlog' })
      .setDescription(lines.join('\n'));
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
