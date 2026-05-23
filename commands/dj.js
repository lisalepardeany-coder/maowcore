const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dj')
    .setDescription('Configure DJ role / vote-skip ratio (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('role').setDescription('Set or clear the DJ role')
        .addRoleOption((o) => o.setName('role').setDescription('Role; omit to clear').setRequired(false)))
    .addSubcommand((sub) =>
      sub.setName('ratio').setDescription('Set the vote-skip threshold (default 0.5 = half)')
        .addNumberOption((o) => o.setName('value').setDescription('0.1–1.0').setRequired(true).setMinValue(0.1).setMaxValue(1.0)))
    .addSubcommand((sub) => sub.setName('show').setDescription('Show current DJ settings')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = getGuild(interaction.guildId);
    if (sub === 'role') {
      const role = interaction.options.getRole('role');
      updateGuild(interaction.guildId, { djRoleId: role?.id || null });
      return interaction.reply({ content: role ? `✦  DJ role set to ${role}.` : '✕  DJ role cleared (everyone can skip).', flags: MessageFlags.Ephemeral });
    }
    if (sub === 'ratio') {
      const v = interaction.options.getNumber('value');
      updateGuild(interaction.guildId, { voteSkipRatio: v });
      return interaction.reply({ content: `✦  Vote-skip ratio set to **${(v * 100).toFixed(0)}%**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'show') {
      const lines = [
        `**DJ role:** ${cfg.djRoleId ? `<@&${cfg.djRoleId}>` : '*none — everyone can skip*'}`,
        `**Vote-skip ratio:** ${(cfg.voteSkipRatio ?? 0.5) * 100}%`,
      ];
      return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    }
  },
};
