'use strict';
// commands/community.js — birthdays, confessions, events/RSVP in one command
// (guild slash-command cap is 100).

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const community = require('../lib/community');
const collab = require('../lib/collab');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

const eph = (content) => ({ content, flags: MessageFlags.Ephemeral });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('community')
    .setDescription('Birthdays, confessions & events')
    .addSubcommandGroup((g) => g.setName('birthday').setDescription('Birthdays')
      .addSubcommand((s) => s.setName('set').setDescription('Set your birthday (day + month, no year)')
        .addStringOption((o) => o.setName('date').setDescription('e.g. 25/12 or "25 dec"').setRequired(true)))
      .addSubcommand((s) => s.setName('remove').setDescription('Remove your birthday'))
      .addSubcommand((s) => s.setName('list').setDescription('Upcoming birthdays'))
      .addSubcommand((s) => s.setName('config').setDescription('(Admin) Announce channel + birthday role')
        .addChannelOption((o) => o.setName('channel').setDescription('Where to announce').addChannelTypes(ChannelType.GuildText))
        .addRoleOption((o) => o.setName('role').setDescription('Role given on someone\'s birthday'))))
    .addSubcommandGroup((g) => g.setName('confess').setDescription('Anonymous confessions')
      .addSubcommand((s) => s.setName('send').setDescription('Send an anonymous confession')
        .addStringOption((o) => o.setName('text').setDescription('Your confession').setRequired(true)))
      .addSubcommand((s) => s.setName('config').setDescription('(Admin) Confession + mod-log channels')
        .addChannelOption((o) => o.setName('channel').setDescription('Public confessions channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('logchannel').setDescription('Staff log (who said what)').addChannelTypes(ChannelType.GuildText))))
    .addSubcommandGroup((g) => g.setName('event').setDescription('Events & RSVP')
      .addSubcommand((s) => s.setName('create').setDescription('Create an event with RSVP buttons')
        .addStringOption((o) => o.setName('title').setDescription('Event title').setRequired(true))
        .addStringOption((o) => o.setName('when').setDescription('When (free text, e.g. "Fri 8pm UTC")').setRequired(true))
        .addStringOption((o) => o.setName('description').setDescription('Details'))
        .addChannelOption((o) => o.setName('channel').setDescription('Post here (default: this channel)').addChannelTypes(ChannelType.GuildText)))
      .addSubcommand((s) => s.setName('list').setDescription('List active events'))
      .addSubcommand((s) => s.setName('cancel').setDescription('(Host/Admin) Cancel an event')
        .addStringOption((o) => o.setName('id').setDescription('Event ID').setRequired(true))))
    .addSubcommandGroup((g) => g.setName('collab').setDescription('Counting & one-word-story games')
      .addSubcommand((s) => s.setName('counting').setDescription('(Admin) Set the counting channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Counting channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
      .addSubcommand((s) => s.setName('story').setDescription('(Admin) Set the one-word-story channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Story channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
      .addSubcommand((s) => s.setName('show').setDescription('Show the one-word story so far'))
      .addSubcommand((s) => s.setName('reset').setDescription('(Admin) Reset a game')
        .addStringOption((o) => o.setName('which').setDescription('Which game').setRequired(true).addChoices({ name: 'Counting', value: 'counting' }, { name: 'Story', value: 'story' })))
      .addSubcommand((s) => s.setName('off').setDescription('(Admin) Disable a game')
        .addStringOption((o) => o.setName('which').setDescription('Which game').setRequired(true).addChoices({ name: 'Counting', value: 'counting' }, { name: 'Story', value: 'story' })))),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId, uid = interaction.user.id;
    const admin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

    // ── birthdays ──────────────────────────────────────────────────────────────
    if (group === 'birthday') {
      if (sub === 'set') {
        const parsed = community.parseDate(interaction.options.getString('date'));
        if (!parsed) return interaction.reply(eph('▲  Couldn\'t read that date. Try `25/12` or `25 dec`.'));
        community.setBirthday(gid, uid, parsed.d, parsed.m);
        return interaction.reply(eph(`🎂  Birthday set to **${community.fmtDate(parsed)}**. We'll celebrate you!`));
      }
      if (sub === 'remove') { community.removeBirthday(gid, uid); return interaction.reply(eph('✕  Birthday removed.')); }
      if (sub === 'list') {
        const up = community.upcomingBirthdays(gid);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '🎂  Birthdays' })
          .setDescription(up.length ? up.slice(0, 25).map((b) => `**${community.fmtDate(b)}** — <@${b.uid}>`).join('\n') : '*No birthdays set. Use `/community birthday set`.*')], allowedMentions: { parse: [] } });
      }
      if (sub === 'config') {
        if (!admin) return interaction.reply(eph('◌  Manage-Server only.'));
        const ch = interaction.options.getChannel('channel'); const role = interaction.options.getRole('role');
        const patch = {}; if (ch) patch.birthdayChannelId = ch.id; if (role) patch.birthdayRoleId = role.id;
        updateGuild(gid, patch);
        return interaction.reply(eph(`✦  Birthdays → ${ch ? `announce in ${ch}` : ''}${role ? ` · role ${role}` : ''}. Checked daily.`));
      }
    }

    // ── confessions ────────────────────────────────────────────────────────────
    if (group === 'confess') {
      if (sub === 'config') {
        if (!admin) return interaction.reply(eph('◌  Manage-Server only.'));
        const ch = interaction.options.getChannel('channel'); const log = interaction.options.getChannel('logchannel');
        updateGuild(gid, { confessChannelId: ch.id, confessLogChannelId: log?.id || null });
        return interaction.reply(eph(`✦  Confessions post in ${ch}${log ? ` · logged to ${log}` : ' · (no mod-log set)'}.`));
      }
      // send
      const cfg = getGuild(gid);
      if (!cfg.confessChannelId) return interaction.reply(eph('▲  Confessions aren\'t set up yet — an admin must run `/community confess config`.'));
      const channel = await interaction.guild.channels.fetch(cfg.confessChannelId).catch(() => null);
      if (!channel) return interaction.reply(eph('▲  The confessions channel is missing.'));
      const text = interaction.options.getString('text').slice(0, 2000);
      const n = community.nextConfessNumber(gid);
      await channel.send({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setAuthor({ name: `🤫  Anonymous Confession #${n}` }).setDescription(text).setTimestamp()] }).catch(() => {});
      if (cfg.confessLogChannelId) {
        const log = await interaction.guild.channels.fetch(cfg.confessLogChannelId).catch(() => null);
        log?.send({ embeds: [new EmbedBuilder().setColor(0x6B7280).setAuthor({ name: `Confession #${n} by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }).setDescription(text).setFooter({ text: uid }).setTimestamp()] }).catch(() => {});
      }
      return interaction.reply(eph(`✅  Confession #${n} posted anonymously in ${channel}.`));
    }

    // ── events ─────────────────────────────────────────────────────────────────
    if (group === 'event') {
      if (sub === 'list') {
        const list = community.listEvents(gid);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xEB459E).setAuthor({ name: '📅  Active Events' })
          .setDescription(list.length ? list.map((e) => `**${e.title}** — ${e.when} · ✅ ${(e.going || []).length} · \`${e.id}\``).join('\n') : '*No active events. Create one with `/community event create`.*')] });
      }
      if (sub === 'cancel') {
        const id = interaction.options.getString('id');
        const e = community.getEvent(gid, id);
        if (!e) return interaction.reply(eph('▲  No event with that ID.'));
        if (e.hostId !== uid && !admin) return interaction.reply(eph('◌  Only the host or an admin can cancel.'));
        community.cancelEvent(gid, id);
        if (e.channelId && e.messageId) {
          const ch = await interaction.guild.channels.fetch(e.channelId).catch(() => null);
          const msg = ch && await ch.messages.fetch(e.messageId).catch(() => null);
          msg?.edit({ content: '🗑️ **This event was cancelled.**', embeds: [], components: [] }).catch(() => {});
        }
        return interaction.reply(eph(`🗑️  Cancelled **${e.title}**.`));
      }
      // create
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) && !admin) return interaction.reply(eph('◌  You need Manage-Events to create events.'));
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const ev = { title: interaction.options.getString('title').slice(0, 200), when: interaction.options.getString('when').slice(0, 200), desc: (interaction.options.getString('description') || '').slice(0, 1500), hostId: uid, hostTag: interaction.user.tag };
      const id = community.createEvent(gid, ev);
      const full = community.getEvent(gid, id);
      const msg = await channel.send({ embeds: [community.eventEmbed(full)], components: [community.eventButtons(id)] }).catch(() => null);
      if (!msg) { community.cancelEvent(gid, id); return interaction.reply(eph(`▲  I can't post in ${channel}.`)); }
      community.setEventMessage(gid, id, channel.id, msg.id);
      return interaction.reply(eph(`📅  Event created in ${channel} — ID \`${id}\`.`));
    }

    // ── collab games (config) ──────────────────────────────────────────────────
    if (group === 'collab') {
      if (sub === 'show') {
        const text = collab.storyText(getGuild(gid).story);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.COSMIC).setAuthor({ name: '📖  The Story So Far' })
          .setDescription(text ? `…${text.slice(-3900)}` : '*No story yet — add the first word in the story channel!*')] });
      }
      if (!admin) return interaction.reply(eph('◌  Manage-Server only.'));
      if (sub === 'counting') {
        const ch = interaction.options.getChannel('channel');
        updateGuild(gid, { countingChannelId: ch.id, counting: { count: 0, lastUser: null, best: getGuild(gid).counting?.best || 0 } });
        return interaction.reply(eph(`🔢  Counting game live in ${ch} — start at **1**, no double-posting!`));
      }
      if (sub === 'story') {
        const ch = interaction.options.getChannel('channel');
        updateGuild(gid, { storyChannelId: ch.id, story: { words: [], lastUser: null } });
        return interaction.reply(eph(`📖  One-word-story live in ${ch} — one word per message, not twice in a row.`));
      }
      if (sub === 'reset') {
        const which = interaction.options.getString('which');
        if (which === 'counting') updateGuild(gid, { counting: { count: 0, lastUser: null, best: getGuild(gid).counting?.best || 0 } });
        else updateGuild(gid, { story: { words: [], lastUser: null } });
        return interaction.reply(eph(`♻️  Reset **${which}**.`));
      }
      if (sub === 'off') {
        const which = interaction.options.getString('which');
        updateGuild(gid, which === 'counting' ? { countingChannelId: null } : { storyChannelId: null });
        return interaction.reply(eph(`🔇  Disabled **${which}**.`));
      }
    }
  },
};
