'use strict';
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const automod = require('../lib/automod');
const { getGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

// toggle choice value → automod config key
const TOGGLES = {
  antispam: 'antiSpam', mentionspam: 'mentionSpam', dupespam: 'dupeSpam', scam: 'scamFilter',
  invites: 'inviteFilter', links: 'linkFilter', words: 'wordFilter', antiraid: 'antiRaid',
  altgate: 'altGate', antinuke: 'antiNuke', escalation: 'escalation',
};
const SETTINGS = {
  spamcount: 'spamCount', mentionlimit: 'mentionLimit', dupelimit: 'dupeLimit',
  raidjoins: 'raidJoinCount', minaccountdays: 'minAccountAgeDays', spamwindowsec: 'spamWindowMs',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure automated moderation (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('toggle').setDescription('Turn a feature on/off')
      .addStringOption((o) => o.setName('feature').setDescription('Which feature').setRequired(true).addChoices(
        { name: 'Anti-spam (flood)', value: 'antispam' }, { name: 'Mass-mention spam', value: 'mentionspam' },
        { name: 'Duplicate spam', value: 'dupespam' }, { name: 'Scam / phishing', value: 'scam' },
        { name: 'Invite filter', value: 'invites' }, { name: 'Link filter', value: 'links' },
        { name: 'Word filter', value: 'words' }, { name: 'Anti-raid', value: 'antiraid' },
        { name: 'Alt / account-age gate', value: 'altgate' }, { name: 'Anti-nuke', value: 'antinuke' },
        { name: 'Warn escalation', value: 'escalation' })))
    .addSubcommand((s) => s.setName('set').setDescription('Set a numeric threshold')
      .addStringOption((o) => o.setName('setting').setDescription('Which setting').setRequired(true).addChoices(
        { name: 'Spam: messages', value: 'spamcount' }, { name: 'Spam: window (seconds)', value: 'spamwindowsec' },
        { name: 'Mention limit', value: 'mentionlimit' }, { name: 'Duplicate limit', value: 'dupelimit' },
        { name: 'Raid: joins to trip', value: 'raidjoins' }, { name: 'Alt gate: min account age (days)', value: 'minaccountdays' }))
      .addIntegerOption((o) => o.setName('value').setDescription('New value').setRequired(true).setMinValue(1).setMaxValue(10000)))
    .addSubcommand((s) => s.setName('escalation').setDescription('Set a warn→punishment rung')
      .addIntegerOption((o) => o.setName('warns').setDescription('Warn count').setRequired(true).setMinValue(1).setMaxValue(50))
      .addStringOption((o) => o.setName('action').setDescription('What happens').setRequired(true).addChoices(
        { name: 'Timeout', value: 'timeout' }, { name: 'Kick', value: 'kick' }, { name: 'Ban', value: 'ban' }, { name: 'Remove rung', value: 'none' })))
    .addSubcommand((s) => s.setName('word').setDescription('Manage the word filter (prefix re: for regex)')
      .addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices(
        { name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }, { name: 'List', value: 'list' }))
      .addStringOption((o) => o.setName('word').setDescription('Word / phrase / re:regex')))
    .addSubcommand((s) => s.setName('domain').setDescription('Manage the link allow-list')
      .addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices(
        { name: 'Allow', value: 'add' }, { name: 'Remove', value: 'remove' }, { name: 'List', value: 'list' }))
      .addStringOption((o) => o.setName('domain').setDescription('e.g. youtube.com')))
    .addSubcommand((s) => s.setName('quarantinerole').setDescription('Role applied for quarantine actions')
      .addRoleOption((o) => o.setName('role').setDescription('Quarantine role').setRequired(true)))
    .addSubcommand((s) => s.setName('show').setDescription('Show the current automod config')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId;
    const am = getGuild(gid).automod || {};
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (sub === 'toggle') {
      const key = TOGGLES[interaction.options.getString('feature')];
      const next = automod.setAutomod(gid, { [key]: !am[key] });
      return reply(`${next[key] ? '✦' : '✕'}  **${key}** ${next[key] ? 'enabled' : 'disabled'}.`);
    }

    if (sub === 'set') {
      const which = interaction.options.getString('setting');
      let value = interaction.options.getInteger('value');
      const key = SETTINGS[which];
      if (which === 'spamwindowsec') value *= 1000; // store ms
      automod.setAutomod(gid, { [key]: value });
      return reply(`✦  **${key}** set to **${interaction.options.getInteger('value')}${which === 'spamwindowsec' ? 's' : ''}**.`);
    }

    if (sub === 'escalation') {
      const warns = interaction.options.getInteger('warns');
      const action = interaction.options.getString('action');
      const ladder = { ...(am.escalationLadder || { 3: 'timeout', 5: 'kick', 7: 'ban' }) };
      if (action === 'none') delete ladder[warns]; else ladder[warns] = action;
      automod.setAutomod(gid, { escalationLadder: ladder });
      const rungs = Object.keys(ladder).map(Number).sort((a, b) => a - b).map((n) => `${n}→${ladder[n]}`).join(' · ') || '*(none)*';
      return reply(`⚖️  Escalation ladder updated: ${rungs}\n${am.escalation ? '' : '⚠️ Enable it with `/automod toggle feature:Warn escalation`.'}`);
    }

    if (sub === 'word') {
      const action = interaction.options.getString('action');
      const word = (interaction.options.getString('word') || '').trim();
      const list = [...(am.bannedWords || [])];
      if (action === 'list') return reply(list.length ? `🚫 Banned (${list.length}):\n${list.map((w) => `\`${w}\``).join(', ')}` : '*No banned words.*');
      if (!word) return reply('▲  Provide a word.');
      if (action === 'add') { if (!list.includes(word)) list.push(word); }
      else { const i = list.indexOf(word); if (i >= 0) list.splice(i, 1); }
      automod.setAutomod(gid, { bannedWords: list });
      return reply(`${action === 'add' ? '✦ Added' : '✕ Removed'} \`${word}\`. ${list.length} total.${am.wordFilter ? '' : '\n⚠️ Enable with `/automod toggle feature:Word filter`.'}`);
    }

    if (sub === 'domain') {
      const action = interaction.options.getString('action');
      const domain = (interaction.options.getString('domain') || '').trim().toLowerCase();
      const list = [...(am.allowedDomains || [])];
      if (action === 'list') return reply(list.length ? `✅ Allowed domains:\n${list.map((d) => `\`${d}\``).join(', ')}` : '*No allow-list (all links blocked when link filter is on).*');
      if (!domain) return reply('▲  Provide a domain.');
      if (action === 'add') { if (!list.includes(domain)) list.push(domain); }
      else { const i = list.indexOf(domain); if (i >= 0) list.splice(i, 1); }
      automod.setAutomod(gid, { allowedDomains: list });
      return reply(`${action === 'add' ? '✦ Allowed' : '✕ Removed'} \`${domain}\`. ${list.length} total.`);
    }

    if (sub === 'quarantinerole') {
      const role = interaction.options.getRole('role');
      automod.setAutomod(gid, { quarantineRoleId: role.id });
      return reply(`✦  Quarantine role set to **${role.name}**. Make sure it denies send/speak in your channels.`);
    }

    if (sub === 'show') {
      const on = (k) => am[k] ? '✦ on' : '✕ off';
      const ladder = am.escalationLadder || { 3: 'timeout', 5: 'kick', 7: 'ban' };
      const rungs = Object.keys(ladder).map(Number).sort((a, b) => a - b).map((n) => `${n}→${ladder[n]}`).join(' · ');
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setAuthor({ name: '⌬  AUTOMOD CONFIG' })
        .addFields(
          { name: 'Spam', value: `Flood: ${on('antiSpam')} (${am.spamCount || 5}/${(am.spamWindowMs || 5000) / 1000}s)\nMention: ${on('mentionSpam')} (≥${am.mentionLimit || 5})\nDuplicate: ${on('dupeSpam')} (≥${am.dupeLimit || 4})`, inline: true },
          { name: 'Filters', value: `Scam: ${on('scamFilter')}\nInvites: ${on('inviteFilter')}\nLinks: ${on('linkFilter')} (${(am.allowedDomains || []).length} allowed)\nWords: ${on('wordFilter')} (${(am.bannedWords || []).length})`, inline: true },
          { name: 'Gates', value: `Anti-raid: ${on('antiRaid')} (${am.raidJoinCount || 5} joins)\nAlt gate: ${on('altGate')} (${am.minAccountAgeDays || 7}d)\nAnti-nuke: ${on('antiNuke')}`, inline: true },
          { name: 'Escalation', value: `${on('escalation')} — ${rungs}`, inline: false },
          { name: 'Roles & log', value: `Quarantine: ${am.quarantineRoleId ? `<@&${am.quarantineRoleId}>` : (getGuild(gid).mutedRoleId ? `<@&${getGuild(gid).mutedRoleId}> (muted)` : '*not set*')}\nModlog: ${getGuild(gid).modlogChannelId ? `<#${getGuild(gid).modlogChannelId}>` : '*not set*'}`, inline: false },
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
