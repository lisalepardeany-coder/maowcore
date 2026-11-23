const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const automod = require('../lib/automod');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure automated moderation (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('antispam').setDescription('Toggle anti-spam (5 msgs/5s → 5min timeout)'))
    .addSubcommand((s) => s.setName('invites').setDescription('Toggle Discord-invite filter'))
    .addSubcommand((s) => s.setName('links').setDescription('Toggle all-external-links filter'))
    .addSubcommand((s) => s.setName('antiraid').setDescription('Toggle anti-raid (5 joins/10s detection)'))
    .addSubcommand((s) => s.setName('addword').setDescription('Add a banned word')
      .addStringOption((o) => o.setName('word').setDescription('Word/phrase to block').setRequired(true)))
    .addSubcommand((s) => s.setName('removeword').setDescription('Remove a banned word')
      .addStringOption((o) => o.setName('word').setDescription('Word to remove').setRequired(true)))
    .addSubcommand((s) => s.setName('toggleword').setDescription('Enable/disable word filter'))
    .addSubcommand((s) => s.setName('caps').setDescription('Toggle the shouting filter (mostly CAPITALS)'))
    .addSubcommand((s) => s.setName('mentions').setDescription('Toggle the mass-mention filter')
      .addIntegerOption((o) => o.setName('limit').setDescription('Mentions in one message that count as too many (default 5)').setMinValue(3).setMaxValue(30)))
    .addSubcommand((s) => s.setName('repeats').setDescription('Toggle the repeated-message filter (same text 3× in 30 s)'))
    .addSubcommand((s) => s.setName('autowarn').setDescription('Toggle: filter hits also give a warning (counts toward /warn rules)'))
    .addSubcommand((s) => s.setName('show').setDescription('Show current automod config')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = getGuild(interaction.guildId);
    const am = cfg.automod || {};

    const flip = (key) => {
      const next = automod.setAutomod(interaction.guildId, { [key]: !am[key] });
      return interaction.reply({
        content: `${next[key] ? '✦' : '✕'}  ${key} ${next[key] ? 'enabled' : 'disabled'}.`,
        flags: MessageFlags.Ephemeral,
      });
    };

    if (sub === 'antispam') return flip('antiSpam');
    if (sub === 'invites')  return flip('inviteFilter');
    if (sub === 'links')    return flip('linkFilter');
    if (sub === 'antiraid') return flip('antiRaid');
    if (sub === 'toggleword') return flip('wordFilter');
    if (sub === 'caps') return flip('capsFilter');
    if (sub === 'repeats') return flip('dupFilter');
    if (sub === 'autowarn') return flip('autoWarn');
    if (sub === 'mentions') {
      const limit = interaction.options.getInteger('limit');
      if (limit) { automod.setAutomod(interaction.guildId, { mentionFilter: true, mentionLimit: limit }); return interaction.reply({ content: `✦  Mass-mention filter on at ${limit}+ mentions.`, flags: MessageFlags.Ephemeral }); }
      return flip('mentionFilter');
    }

    if (sub === 'addword') {
      const word = interaction.options.getString('word').toLowerCase().trim();
      const banned = [...(am.bannedWords || [])];
      if (!banned.includes(word)) banned.push(word);
      automod.setAutomod(interaction.guildId, { bannedWords: banned });
      return interaction.reply({ content: `✦  Added word filter for **${word}**. ${banned.length} total.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'removeword') {
      const word = interaction.options.getString('word').toLowerCase().trim();
      const banned = (am.bannedWords || []).filter((w) => w !== word);
      automod.setAutomod(interaction.guildId, { bannedWords: banned });
      return interaction.reply({ content: `✕  Removed word filter for **${word}**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'show') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setAuthor({ name: '⌬  AUTOMOD CONFIG' })
        .setDescription([
          `**Anti-spam:** ${am.antiSpam ? '✦ on' : '✕ off'}`,
          `**Invite filter:** ${am.inviteFilter ? '✦ on' : '✕ off'}`,
          `**Link filter:** ${am.linkFilter ? '✦ on' : '✕ off'}`,
          `**Anti-raid:** ${am.antiRaid ? '✦ on' : '✕ off'}`,
          `**Word filter:** ${am.wordFilter ? '✦ on' : '✕ off'} (${(am.bannedWords || []).length} words)`,
          `**Shouting filter:** ${am.capsFilter ? '✦ on' : '✕ off'}`,
          `**Mass mentions:** ${am.mentionFilter ? `✦ on (${am.mentionLimit || 5}+)` : '✕ off'}`,
          `**Repeated messages:** ${am.dupFilter ? '✦ on' : '✕ off'}`,
          `**Auto-warn on filter hits:** ${am.autoWarn ? '✦ on' : '✕ off'}`,
          `**Modlog channel:** ${cfg.modlogChannelId ? `<#${cfg.modlogChannelId}>` : '*not set*'}`,
        ].join('\n'));
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
