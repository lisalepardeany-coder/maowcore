'use strict';
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const lvl = require('../lib/leveling');
const { COLORS } = require('../lib/theme');

const bar = (pct) => { const f = Math.round(pct / 10); return '█'.repeat(f) + '░'.repeat(10 - f); };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levelxp')
    .setDescription('Leveling — rank cards, leaderboard, XP & auto-roles')
    .addSubcommand((s) => s.setName('rank').setDescription('Show your (or someone\'s) level & XP')
      .addUserOption((o) => o.setName('user').setDescription('Whose rank')))
    .addSubcommand((s) => s.setName('top').setDescription('Server XP leaderboard'))
    .addSubcommand((s) => s.setName('setup').setDescription('(Admin) Auto-create the milestone level roles')
      .addIntegerOption((o) => o.setName('interval').setDescription('Role every N levels (default 25)').setMinValue(1).setMaxValue(100))
      .addIntegerOption((o) => o.setName('maxlevel').setDescription('Top milestone level (default 500)').setMinValue(10).setMaxValue(2000)))
    .addSubcommand((s) => s.setName('toggle').setDescription('(Admin) Turn leveling on/off'))
    .addSubcommand((s) => s.setName('set').setDescription('(Admin) Set a member\'s level')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addIntegerOption((o) => o.setName('level').setDescription('Level').setRequired(true).setMinValue(0).setMaxValue(5000)))
    .addSubcommand((s) => s.setName('give').setDescription('(Admin) Give/remove XP')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addIntegerOption((o) => o.setName('xp').setDescription('XP (negative to remove)').setRequired(true)))
    .addSubcommand((s) => s.setName('rates').setDescription('(Admin) Set XP earn rates')
      .addIntegerOption((o) => o.setName('textmin').setDescription('Min text XP per message'))
      .addIntegerOption((o) => o.setName('textmax').setDescription('Max text XP per message'))
      .addIntegerOption((o) => o.setName('voice').setDescription('Voice XP per minute'))
      .addIntegerOption((o) => o.setName('cooldownsec').setDescription('Text XP cooldown (seconds)')))
    .addSubcommand((s) => s.setName('multiplier').setDescription('(Admin) Global XP multiplier')
      .addNumberOption((o) => o.setName('value').setDescription('e.g. 1.5, 2').setRequired(true).setMinValue(0.1).setMaxValue(10)))
    .addSubcommand((s) => s.setName('doublexp').setDescription('(Admin) Start a double-XP window')
      .addIntegerOption((o) => o.setName('hours').setDescription('How many hours').setRequired(true).setMinValue(1).setMaxValue(168)))
    .addSubcommand((s) => s.setName('noxp').setDescription('(Admin) Exclude a channel from XP')
      .addStringOption((o) => o.setName('action').setDescription('add/remove').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel/category').setRequired(true)))
    .addSubcommand((s) => s.setName('announce').setDescription('(Admin) Channel for level-up messages')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (omit = reply in place)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('show').setDescription('(Admin) Show leveling config')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId;
    const admin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    const needAdmin = () => interaction.reply({ content: '◌  Manage-Server permission required.', flags: MessageFlags.Ephemeral });

    // ── public ───────────────────────────────────────────────────────────────
    if (sub === 'rank') {
      const user = interaction.options.getUser('user') || interaction.user;
      const r = lvl.rankOf(gid, user.id);
      const pct = r.need ? Math.round((r.into / r.need) * 100) : 0;
      const embed = new EmbedBuilder().setColor(COLORS.COSMIC)
        .setAuthor({ name: `${user.username} — Level ${r.level}`, iconURL: user.displayAvatarURL() })
        .setThumbnail(user.displayAvatarURL())
        .setDescription([
          `**Rank:** ${r.rank ? `#${r.rank} / ${r.total}` : 'unranked'}`,
          `**Total XP:** ${r.xp.toLocaleString()}`,
          `**Progress:** ${r.into.toLocaleString()} / ${r.need.toLocaleString()} (${pct}%)`,
          `\`${bar(pct)}\` ${pct}%`,
        ].join('\n'));
      return interaction.reply({ embeds: [embed] });
    }
    if (sub === 'top') {
      const top = lvl.leaderboard(gid, 15);
      if (!top.length) return interaction.reply({ content: 'No XP earned yet — start chatting!', flags: MessageFlags.Ephemeral });
      const medal = (i) => ['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``;
      const embed = new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: `🏆  ${interaction.guild.name} — Leaderboard` })
        .setDescription(top.map((e, i) => `${medal(i)} <@${e.userId}> — **Lv ${e.level}** · ${e.xp.toLocaleString()} XP`).join('\n'));
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    // ── admin ──────────────────────────────────────────────────────────────────
    if (!admin) return needAdmin();

    if (sub === 'setup') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const interval = interaction.options.getInteger('interval') || 25;
      const maxLevel = interaction.options.getInteger('maxlevel') || 500;
      const r = await lvl.setupRoles(interaction.guild, interval, maxLevel);
      lvl.setCfg(gid, { enabled: true });
      return interaction.editReply(`🏅  Created/linked **${r.total}** milestone roles (every ${interval} levels up to ${maxLevel}, +prestige tiers). ${r.created} newly created.\nLeveling is now **ON**. Members earn the highest role they've reached automatically.`);
    }
    if (sub === 'toggle') {
      const c = lvl.setCfg(gid, { enabled: !lvl.cfgOf(gid).enabled });
      return interaction.reply({ content: `${c.enabled ? '✦ Leveling enabled' : '✕ Leveling disabled'}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'set') {
      const user = interaction.options.getUser('user');
      const level = interaction.options.getInteger('level');
      lvl.setLevel(gid, user.id, level);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) await lvl.applyRewards(interaction.guild, member, level);
      return interaction.reply({ content: `✦  Set **${user.tag}** to **Level ${level}**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'give') {
      const user = interaction.options.getUser('user');
      const xp = interaction.options.getInteger('xp');
      const res = lvl.addXp(gid, user.id, xp);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) await lvl.applyRewards(interaction.guild, member, res.newLevel);
      return interaction.reply({ content: `✦  ${xp >= 0 ? 'Gave' : 'Removed'} **${Math.abs(xp).toLocaleString()} XP** ${xp >= 0 ? 'to' : 'from'} **${user.tag}** — now Level ${res.newLevel}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'rates') {
      const patch = {};
      const tmin = interaction.options.getInteger('textmin'); if (tmin != null) patch.textXpMin = tmin;
      const tmax = interaction.options.getInteger('textmax'); if (tmax != null) patch.textXpMax = tmax;
      const v = interaction.options.getInteger('voice'); if (v != null) patch.voiceXp = v;
      const cd = interaction.options.getInteger('cooldownsec'); if (cd != null) patch.textCooldownMs = cd * 1000;
      const c = lvl.setCfg(gid, patch);
      return interaction.reply({ content: `✦  Rates → text **${c.textXpMin || 18}–${c.textXpMax || 32}**/msg, voice **${c.voiceXp ?? 15}**/min, cooldown **${(c.textCooldownMs ?? 30000) / 1000}s**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'multiplier') {
      const value = interaction.options.getNumber('value');
      lvl.setCfg(gid, { xpMultiplier: value });
      return interaction.reply({ content: `✦  Global XP multiplier set to **${value}×**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'doublexp') {
      const hours = interaction.options.getInteger('hours');
      lvl.setCfg(gid, { doubleXpUntil: Date.now() + hours * 3600_000 });
      return interaction.reply({ content: `⚡  **Double XP** active for **${hours}h** (ends <t:${Math.floor((Date.now() + hours * 3600_000) / 1000)}:R>).`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'noxp') {
      const action = interaction.options.getString('action');
      const ch = interaction.options.getChannel('channel');
      const list = [...(lvl.cfgOf(gid).noXpChannels || [])];
      if (action === 'add') { if (!list.includes(ch.id)) list.push(ch.id); } else { const i = list.indexOf(ch.id); if (i >= 0) list.splice(i, 1); }
      lvl.setCfg(gid, { noXpChannels: list });
      return interaction.reply({ content: `${action === 'add' ? '✦ Excluded' : '✕ Re-included'} ${ch} ${action === 'add' ? 'from' : 'in'} XP. ${list.length} excluded.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'announce') {
      const ch = interaction.options.getChannel('channel');
      lvl.setCfg(gid, { levelUpChannelId: ch?.id || null });
      return interaction.reply({ content: ch ? `✦  Level-up messages will post in ${ch}.` : '✦  Level-up messages will reply in the active channel.', flags: MessageFlags.Ephemeral });
    }
    if (sub === 'show') {
      const c = lvl.cfgOf(gid);
      const embed = new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '⭐  LEVELING CONFIG' }).setDescription([
        `**Enabled:** ${c.enabled ? '✦ on' : '✕ off'}`,
        `**Text XP:** ${c.textXpMin || 18}–${c.textXpMax || 32} / msg (cd ${(c.textCooldownMs ?? 30000) / 1000}s)`,
        `**Voice XP:** ${c.voiceXp ?? 15} / min`,
        `**Multiplier:** ${c.xpMultiplier || 1}×${c.doubleXpUntil && Date.now() < c.doubleXpUntil ? ' · ⚡ DOUBLE XP active' : ''}`,
        `**Milestone roles:** ${Object.keys(c.levelRoles || {}).length} (every ${c.roleInterval || '—'} levels)`,
        `**No-XP channels:** ${(c.noXpChannels || []).length}`,
        `**Level-up posts:** ${c.levelUpChannelId ? `<#${c.levelUpChannelId}>` : 'in active channel'}`,
      ].join('\n'));
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
