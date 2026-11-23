const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const warnings = require('../lib/warnings');
const modlog = require('../lib/modlog');
const tools = require('../lib/mod-tools');
const automod = require('../lib/automod');
const { updateGuild } = require('../lib/config');
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
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand((s) => s.setName('rules').setDescription('Automatic timeouts at a number of warnings')
      .addStringOption((o) => o.setName('set').setDescription('e.g. 3=10m, 5=1h, 7=1d   ·   "off" to turn off   ·   "default"'))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'rules') {
      const text = interaction.options.getString('set');
      if (text) {
        const t = text.trim().toLowerCase();
        try {
          if (t === 'off') updateGuild(interaction.guildId, { warnRules: { ...tools.warnRules(interaction.guildId), enabled: false } });
          else if (t === 'default') updateGuild(interaction.guildId, { warnRules: { enabled: true, rules: tools.DEFAULT_RULES } });
          else updateGuild(interaction.guildId, { warnRules: { enabled: true, rules: tools.parseRules(text) } });
        } catch (e) { return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral }); }
      }
      const r = tools.warnRules(interaction.guildId);
      return interaction.reply({
        content: r.enabled ? `⏱ Automatic timeouts: ${r.rules.map((x) => `**${x.at}** warnings → ${tools.fmtMin(x.minutes)}`).join(' · ')}` : '⏱ Automatic timeouts are **off**.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const user = interaction.options.getUser('user');
    if (sub === 'add') {
      const reason = interaction.options.getString('reason');
      const count = warnings.add(interaction.guildId, user.id, reason, interaction.user.id);
      modlog.post(interaction.guild, { action: 'warn', target: user, mod: interaction.user, reason: `${reason} (warning ${count})` });
      // Auto-escalation: the dashboard ladder, or else the /warn rules timeouts (see automod.escalate).
      let escalated = null;
      try {
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member) escalated = await automod.escalate(interaction.guild, member, count, modlog);
      } catch { /* */ }
      return interaction.reply(`⚠️  Warned **${user.tag}** — now has **${count}** warning${count === 1 ? '' : 's'}. Reason: ${reason}`
        + (escalated ? `\n⚖️  Auto-escalation: **${escalated}** applied at ${count} warnings.` : ''));
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
      modlog.record(interaction.guildId, { action: 'warn', target: user, mod: interaction.user, reason: 'Warnings cleared' });
      return interaction.reply({ content: `✕  Cleared all warnings for **${user.tag}**.`, flags: MessageFlags.Ephemeral });
    }
    return null;
  },
};
