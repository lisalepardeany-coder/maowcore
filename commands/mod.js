'use strict';
// commands/mod.js — moderation tools in one command (guild slash-command cap is
// 100). Folds the former /tempban /tempmute /note /history /modmail.

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const modActions = require('../lib/mod-actions');
const notes = require('../lib/mod-notes');
const modmail = require('../lib/modmail');
const warnings = require('../lib/warnings');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

const eph = (content) => ({ content, flags: MessageFlags.Ephemeral });
const ts = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools — temp punishments, notes, history, modmail')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) => s.setName('tempban').setDescription('Ban for a set duration (auto-unbans)')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 7d · 2h30m · 1w').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason')))
    .addSubcommand((s) => s.setName('tempmute').setDescription('Mute/timeout for a duration (auto-unmutes)')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 30m · 2h · 1d').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason')))
    .addSubcommand((s) => s.setName('history').setDescription('A member\'s mod card (warnings, notes, temp actions)')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand((s) => s.setName('note').setDescription('Private staff notes')
      .addStringOption((o) => o.setName('action').setDescription('add/list/remove').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'List', value: 'list' }, { name: 'Remove', value: 'remove' }))
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('text').setDescription('Note text (for add)'))
      .addIntegerOption((o) => o.setName('number').setDescription('Note # (for remove)').setMinValue(1)))
    .addSubcommand((s) => s.setName('modmail').setDescription('Configure / manage modmail')
      .addStringOption((o) => o.setName('action').setDescription('setup/close/status/off').setRequired(true).addChoices({ name: 'Setup', value: 'setup' }, { name: 'Close', value: 'close' }, { name: 'Status', value: 'status' }, { name: 'Off', value: 'off' }))
      .addChannelOption((o) => o.setName('channel').setDescription('Staff channel (for setup)').addChannelTypes(ChannelType.GuildText))
      .addUserOption((o) => o.setName('user').setDescription('Member (for close)'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId;
    const perms = interaction.memberPermissions;

    // ── tempban ──────────────────────────────────────────────────────────────
    if (sub === 'tempban') {
      if (!perms?.has(PermissionFlagsBits.BanMembers)) return interaction.reply(eph('◌  Ban-Members permission required.'));
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const user = interaction.options.getUser('user');
      const ms = modActions.parseDuration(interaction.options.getString('duration'));
      if (!ms || ms < 60_000) return interaction.editReply('▲  Invalid duration. Try `7d`, `2h30m`, `1w` (min 1m).');
      const reason = interaction.options.getString('reason') || 'No reason given';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member && !member.bannable) return interaction.editReply('▲  I can\'t ban that member (hierarchy/perms).');
      try {
        await modActions.tempBan(interaction.guild, user, ms, reason, interaction.user.tag);
        return interaction.editReply(`🔨  Temp-banned **${user.tag}** for **${modActions.formatDuration(ms)}** — auto-unban ${ts(Date.now() + ms)}.`);
      } catch (e) { return interaction.editReply(`▲  Failed: ${e.message}`); }
    }

    // ── tempmute ─────────────────────────────────────────────────────────────
    if (sub === 'tempmute') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const user = interaction.options.getUser('user');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.editReply('▲  That user isn\'t in the server.');
      if (!member.moderatable) return interaction.editReply('▲  I can\'t mute that member (hierarchy/perms).');
      const ms = modActions.parseDuration(interaction.options.getString('duration'));
      if (!ms || ms < 60_000) return interaction.editReply('▲  Invalid duration. Try `30m`, `2h`, `1d`.');
      const reason = interaction.options.getString('reason') || 'No reason given';
      try {
        await modActions.tempMute(interaction.guild, member, ms, reason, interaction.user.tag);
        return interaction.editReply(`🔇  Muted **${user.tag}** for **${modActions.formatDuration(ms)}** — auto-unmute ${ts(Date.now() + ms)}.`);
      } catch (e) { return interaction.editReply(`▲  Failed: ${e.message}`); }
    }

    // ── history (mod card) ───────────────────────────────────────────────────
    if (sub === 'history') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const user = interaction.options.getUser('user');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const warns = warnings.list(gid, user.id);
      const noteList = notes.list(gid, user.id);
      const temp = (getGuild(gid).tempActions || []).filter((a) => a.userId === user.id);
      const embed = new EmbedBuilder().setColor(warns.length >= 3 ? COLORS.FLARE : COLORS.COSMIC)
        .setAuthor({ name: `🪪  Mod card — ${user.tag}`, iconURL: user.displayAvatarURL() }).setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'Account', value: `Created ${ts(user.createdTimestamp)}`, inline: true },
          { name: 'Joined', value: member ? ts(member.joinedTimestamp) : '*not in server*', inline: true },
          { name: 'Roles', value: member ? String(member.roles.cache.size - 1) : '—', inline: true },
          { name: `⚠️ Warnings (${warns.length})`, value: warns.length ? warns.slice(-5).reverse().map((w) => `• ${ts(w.ts)} — ${String(w.reason).slice(0, 120)}`).join('\n') : '*none*' },
          { name: `📝 Notes (${noteList.length})`, value: noteList.length ? noteList.slice(-5).reverse().map((n) => `• ${ts(n.ts)} — ${String(n.text).slice(0, 120)}`).join('\n') : '*none*' },
        );
      if (temp.length) embed.addFields({ name: '⏳ Active temp actions', value: temp.map((a) => `• ${a.type} — ${ts(a.until)}`).join('\n') });
      embed.setFooter({ text: user.id });
      return interaction.editReply({ embeds: [embed] });
    }

    // ── note ─────────────────────────────────────────────────────────────────
    if (sub === 'note') {
      const action = interaction.options.getString('action');
      const user = interaction.options.getUser('user');
      if (action === 'add') {
        const text = interaction.options.getString('text');
        if (!text) return interaction.reply(eph('▲  Provide `text` to add.'));
        const n = notes.add(gid, user.id, text, interaction.user.id);
        return interaction.reply(eph(`📝  Note #${n} added for **${user.tag}**.`));
      }
      if (action === 'list') {
        const list = notes.list(gid, user.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: `📝  Notes — ${user.tag}` })
          .setDescription(list.length ? list.map((n, i) => `\`${i + 1}.\` ${ts(n.ts)} — ${n.text} *(<@${n.modId}>)*`).join('\n').slice(0, 4000) : '*No notes.*')], flags: MessageFlags.Ephemeral });
      }
      const num = interaction.options.getInteger('number');
      if (!num) return interaction.reply(eph('▲  Provide the note `number` to remove (see list).'));
      return interaction.reply(eph(notes.remove(gid, user.id, num) ? '✕  Note removed.' : '▲  No note with that number.'));
    }

    // ── modmail ──────────────────────────────────────────────────────────────
    if (sub === 'modmail') {
      if (!perms?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply(eph('◌  Manage-Server permission required.'));
      const action = interaction.options.getString('action');
      if (action === 'setup') {
        const ch = interaction.options.getChannel('channel');
        if (!ch) return interaction.reply(eph('▲  Provide a `channel`.'));
        const me = interaction.guild.members.me;
        if (!ch.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.SendMessagesInThreads]))
          return interaction.reply(eph(`▲  I need Send Messages, Create Public Threads & Send Messages in Threads in ${ch}.`));
        updateGuild(gid, { modmailChannelId: ch.id });
        return interaction.reply(eph(`📬  Modmail enabled — DMs open a thread in ${ch}. Reply in-thread to talk; \`//\` keeps a line private.`));
      }
      if (action === 'close') {
        const user = interaction.options.getUser('user');
        if (!user) return interaction.reply(eph('▲  Provide the `user` whose thread to close.'));
        await modmail.closeThread(interaction.guild, user.id, interaction.user.tag);
        return interaction.reply(eph(`🔒  Closed modmail for **${user.tag}**.`));
      }
      if (action === 'off') { updateGuild(gid, { modmailChannelId: null }); return interaction.reply(eph('🔇  Modmail disabled.')); }
      const cfg = getGuild(gid);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '📬  MODMAIL' })
        .setDescription(`**Channel:** ${cfg.modmailChannelId ? `<#${cfg.modmailChannelId}>` : '*not set*'}\n**Open threads:** ${Object.keys(cfg.modmailThreads || {}).length}`)], flags: MessageFlags.Ephemeral });
    }
  },
};
