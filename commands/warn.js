const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const warnings = require('../lib/warnings');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member or list/clear warnings (mod only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) => s.setName('add').setDescription('Add a warning')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show warnings for a member')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand((s) => s.setName('clear').setDescription('Clear warnings for a member')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');
    if (sub === 'add') {
      const reason = interaction.options.getString('reason');
      const count = warnings.add(interaction.guildId, user.id, reason, interaction.user.id);
      return interaction.reply(`⚠️  Warned **${user.tag}** — now has **${count}** warning${count === 1 ? '' : 's'}. Reason: ${reason}`);
    }
    if (sub === 'list') {
      const list = warnings.list(interaction.guildId, user.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setAuthor({ name: `⚠️  Warnings — ${user.tag}` })
        .setDescription(list.length
          ? list.map((w, i) => `\`${i + 1}.\` <t:${Math.floor(w.ts / 1000)}:R> — ${w.reason}`).join('\n')
          : '*No warnings.*');
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'clear') {
      warnings.clear(interaction.guildId, user.id);
      return interaction.reply({ content: `✕  Cleared all warnings for **${user.tag}**.`, flags: MessageFlags.Ephemeral });
    }
  },
};
