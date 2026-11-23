// Server & moderation tools (v3.4): warn points → auto-timeout, private mod
// notes, ban appeals, tickets, birthdays and auto-roles. Settings live in the
// guild config; the interaction handlers are wired up in index.js.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits, EmbedBuilder,
} = require('discord.js');
const crypto = require('node:crypto');
const { getGuild, updateGuild } = require('./config');
const modlog = require('./modlog');

// =====================================================================
// Warn points → automatic timeout
// =====================================================================
const DEFAULT_RULES = [{ at: 3, minutes: 10 }, { at: 5, minutes: 60 }, { at: 7, minutes: 1440 }];
const warnRules = (guildId) => {
  const c = getGuild(guildId).warnRules;
  return { enabled: c?.enabled !== false, rules: Array.isArray(c?.rules) && c.rules.length ? c.rules : DEFAULT_RULES };
};
// Pure (tested): the timeout for a warning count, if a rule matches exactly.
const ruleFor = (rules, count) => (rules || []).find((r) => Number(r.at) === Number(count)) || null;
const fmtMin = (m) => (m >= 1440 ? `${Math.round(m / 1440)} day${m >= 2880 ? 's' : ''}` : m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`);
const parseRules = (text) => {
  // "3=10m, 5=1h, 7=1d"
  const out = [];
  for (const part of String(text || '').split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d{1,2})=(\d{1,4})(m|h|d)$/i);
    if (!m) throw new Error(`Couldn't read "${part}". Use e.g. 3=10m, 5=1h, 7=1d`);
    const minutes = Number(m[2]) * ({ m: 1, h: 60, d: 1440 }[m[3].toLowerCase()]);
    if (minutes > 40320) throw new Error('Discord timeouts can be at most 28 days.');
    out.push({ at: Number(m[1]), minutes });
  }
  return out.sort((a, b) => a.at - b.at);
};

// Call after a warning was added. Returns a short text about what happened.
const applyWarnRules = async (guild, userId, count, modTag) => {
  const { enabled, rules } = warnRules(guild.id);
  const r = enabled ? ruleFor(rules, count) : null;
  if (!r) return null;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member?.moderatable) return `(Would time out for ${fmtMin(r.minutes)}, but I can't moderate them.)`;
  await member.timeout(r.minutes * 60000, `Reached ${count} warnings`).catch(() => null);
  modlog.post(guild, { action: 'timeout', target: member.user, mod: `${modTag || 'auto'} (warn points)`, reason: `${count} warnings → ${fmtMin(r.minutes)} timeout` });
  return `⏱ Reached **${count}** warnings — timed out for **${fmtMin(r.minutes)}**.`;
};

// =====================================================================
// Private mod notes
// =====================================================================
const notes = (guildId, userId) => (getGuild(guildId).modNotes || {})[userId] || [];
const addNote = (guildId, userId, text, byTag) => {
  const all = getGuild(guildId).modNotes || {};
  const list = all[userId] || [];
  if (list.length >= 50) throw new Error('This member already has 50 notes. Remove some first.');
  const n = { id: crypto.randomBytes(3).toString('hex'), ts: Date.now(), by: byTag, text: String(text).slice(0, 1000) };
  all[userId] = [...list, n];
  updateGuild(guildId, { modNotes: all });
  return n;
};
const removeNote = (guildId, userId, id) => {
  const all = getGuild(guildId).modNotes || {};
  const before = (all[userId] || []).length;
  all[userId] = (all[userId] || []).filter((n) => n.id !== id);
  if (!all[userId].length) delete all[userId];
  updateGuild(guildId, { modNotes: all });
  return (all[userId] || []).length < before;
};

// =====================================================================
// Ban appeals (all inside Discord: DM button → form → mod buttons)
// =====================================================================
const APPEAL_COOLDOWN_MS = 24 * 3600 * 1000;
const appealsOn = (guildId) => !!getGuild(guildId).appeals?.channelId;
const appealDm = (guild, reason) => ({
  embeds: [new EmbedBuilder().setColor(0xed4245).setTitle(`You were banned from ${guild.name}`)
    .setDescription(`**Reason:** ${reason || 'No reason given.'}${appealsOn(guild.id) ? '\n\nIf you think this was a mistake, you can send one appeal to the moderators.' : ''}`)],
  components: appealsOn(guild.id) ? [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`appeal:open:${guild.id}`).setLabel('Appeal this ban').setStyle(ButtonStyle.Primary).setEmoji('📝'),
  )] : [],
});
const appealModal = (guildId) => new ModalBuilder().setCustomId(`appeal:submit:${guildId}`).setTitle('Ban appeal').addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('why').setLabel('Why should the ban be lifted?').setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(1500).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('next').setLabel('What will you do differently?').setStyle(TextInputStyle.Paragraph).setMaxLength(800).setRequired(false)),
);
const lastAppeal = new Map();   // `${guild}:${user}` -> ts
// Pure (tested): may this user appeal now?
const canAppeal = (lastTs, now = Date.now()) => !lastTs || now - lastTs > APPEAL_COOLDOWN_MS;

const handleAppeal = async (interaction, client) => {
  const [, kind, guildId, userId] = interaction.customId.split(':');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: 'That server is no longer available.', flags: 64 }).catch(() => {});
  const cfg = getGuild(guildId).appeals || {};
  if (kind === 'open') {
    const key = `${guildId}:${interaction.user.id}`;
    if (!canAppeal(lastAppeal.get(key))) return interaction.reply({ content: 'You already sent an appeal in the last 24 hours. Please wait for an answer.' });
    return interaction.showModal(appealModal(guildId));
  }
  if (kind === 'submit') {
    const key = `${guildId}:${interaction.user.id}`;
    if (!canAppeal(lastAppeal.get(key))) return interaction.reply({ content: 'You already sent an appeal in the last 24 hours.' });
    const ban = await guild.bans.fetch(interaction.user.id).catch(() => null);
    if (!ban) return interaction.reply({ content: 'You are not banned from that server any more. 🎉' });
    const ch = guild.channels.cache.get(cfg.channelId);
    if (!ch?.send) return interaction.reply({ content: 'Appeals are switched off for that server right now.' });
    lastAppeal.set(key, Date.now());
    const why = interaction.fields.getTextInputValue('why');
    const next = interaction.fields.getTextInputValue('next') || '—';
    await ch.send({
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('📝 Ban appeal').setThumbnail(interaction.user.displayAvatarURL({ size: 64 }))
        .setDescription(`**User:** ${interaction.user.tag} (<@${interaction.user.id}>)\n**Ban reason:** ${ban.reason || '—'}`)
        .addFields({ name: 'Why lift the ban?', value: why.slice(0, 1024) }, { name: 'What will change?', value: next.slice(0, 1024) }).setTimestamp()],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`appeal:accept:${guildId}:${interaction.user.id}`).setLabel('Accept & unban').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`appeal:deny:${guildId}:${interaction.user.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
      )],
    });
    return interaction.reply({ content: '✓ Your appeal was sent to the moderators. You\'ll get a DM with their answer.' });
  }
  if (kind === 'accept' || kind === 'deny') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: 'Only people who can ban members can answer appeals.', flags: 64 });
    }
    const user = await client.users.fetch(userId).catch(() => null);
    let note = '';
    if (kind === 'accept') {
      await guild.bans.remove(userId, `Appeal accepted by ${interaction.user.tag}`).catch((e) => { note = ` (unban failed: ${e.message})`; });
      let invite = null;
      const ch = guild.systemChannel || guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.CreateInstantInvite));
      if (ch) invite = await ch.createInvite({ maxUses: 1, maxAge: 7 * 86400, unique: true, reason: 'Ban appeal accepted' }).catch(() => null);
      await user?.send(`✅ Your ban appeal for **${guild.name}** was accepted.${invite ? ` You can rejoin here: ${invite.url}` : ''}`).catch(() => {});
    } else {
      await user?.send(`❌ Your ban appeal for **${guild.name}** was not accepted.`).catch(() => {});
    }
    modlog.post(guild, { action: 'appeal', target: user || `<@${userId}>`, mod: interaction.user, reason: kind === 'accept' ? 'Appeal accepted → unbanned' : 'Appeal denied' });
    return interaction.update({ components: [], content: `${kind === 'accept' ? '✅ Accepted' : '❌ Denied'} by ${interaction.user}${note}` });
  }
  return null;
};

// =====================================================================
// Tickets (private threads)
// =====================================================================
const ticketPanel = () => ({
  embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('🎫 Need help?').setDescription('Press the button to open a private ticket. Only you and the staff can see it.')],
  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:open').setLabel('Open a ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'))],
});
const handleTicket = async (interaction) => {
  const [, kind] = interaction.customId.split(':');
  const guild = interaction.guild;
  const cfg = getGuild(guild.id).tickets || {};
  if (kind === 'open') {
    const ch = guild.channels.cache.get(cfg.channelId);
    if (!ch?.threads) return interaction.reply({ content: 'Tickets aren\'t set up here any more.', flags: 64 });
    const open = cfg.open || {};
    const existing = open[interaction.user.id] && await ch.threads.fetch(open[interaction.user.id]).catch(() => null);
    if (existing && !existing.archived) return interaction.reply({ content: `You already have an open ticket: ${existing}`, flags: 64 });
    await interaction.deferReply({ flags: 64 });
    const thread = await ch.threads.create({
      name: `ticket-${interaction.user.username}`.slice(0, 90),
      type: ChannelType.PrivateThread, invitable: false, autoArchiveDuration: 10080, reason: 'Ticket opened',
    }).catch((e) => { throw new Error(`I couldn't make a private thread: ${e.message}`); });
    await thread.members.add(interaction.user.id).catch(() => {});
    await thread.send({
      content: `${interaction.user} opened a ticket.${cfg.staffRoleId ? ` <@&${cfg.staffRoleId}>` : ''}`,
      allowedMentions: { users: [interaction.user.id], roles: cfg.staffRoleId ? [cfg.staffRoleId] : [] },
      embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription('Tell us what\'s going on. A staff member will be with you soon.')],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setStyle(ButtonStyle.Secondary).setEmoji('🔒'))],
    });
    open[interaction.user.id] = thread.id;
    updateGuild(guild.id, { tickets: { ...cfg, open } });
    modlog.post(guild, { action: 'ticket', target: interaction.user, mod: interaction.user, reason: 'Ticket opened', extra: `${thread}` });
    return interaction.editReply(`🎫 Your ticket is ready: ${thread}`);
  }
  if (kind === 'close') {
    const thread = interaction.channel;
    const openerId = Object.entries(cfg.open || {}).find(([, t]) => t === thread.id)?.[0];
    const isStaff = interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads) || (cfg.staffRoleId && interaction.member?.roles?.cache?.has(cfg.staffRoleId));
    if (!isStaff && interaction.user.id !== openerId) return interaction.reply({ content: 'Only staff or the person who opened it can close this ticket.', flags: 64 });
    await interaction.reply(`🔒 Ticket closed by ${interaction.user}.`);
    const open = { ...(cfg.open || {}) };
    if (openerId) delete open[openerId];
    updateGuild(guild.id, { tickets: { ...cfg, open } });
    modlog.post(guild, { action: 'ticket', target: openerId ? `<@${openerId}>` : thread.name, mod: interaction.user, reason: 'Ticket closed', extra: `${thread}` });
    await thread.setLocked(true).catch(() => {});
    await thread.setArchived(true).catch(() => {});
  }
  return null;
};

// =====================================================================
// Birthdays
// =====================================================================
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const validDay = (d, m) => Number.isInteger(d) && Number.isInteger(m) && m >= 1 && m <= 12 && d >= 1 && d <= DAYS_IN[m - 1];
// Pure (tested): who has a birthday on this date? (29 Feb → 28 Feb in other years)
const birthdaysOn = (all, date) => {
  const d = date.getDate(); const m = date.getMonth() + 1;
  const leap = new Date(date.getFullYear(), 1, 29).getMonth() === 1;
  return Object.entries(all || {}).filter(([, b]) => (b.d === d && b.m === m) || (!leap && b.d === 29 && b.m === 2 && d === 28 && m === 2)).map(([id]) => id);
};
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

const runBirthdays = async (client, now = new Date()) => {
  if (now.getHours() < 9) return;
  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuild(guild.id).birthdays;
    if (!cfg?.channelId) continue;
    const today = dayKey(now);
    if (cfg.lastRun === today) continue;
    // Take yesterday's birthday role away first.
    if (cfg.roleId && Array.isArray(cfg.roleGiven)) {
      for (const uid of cfg.roleGiven) { const m = await guild.members.fetch(uid).catch(() => null); await m?.roles.remove(cfg.roleId).catch(() => {}); }
    }
    const ids = birthdaysOn(cfg.people, now);
    const given = [];
    const ch = guild.channels.cache.get(cfg.channelId);
    for (const uid of ids) {
      const m = await guild.members.fetch(uid).catch(() => null);
      if (!m) continue;
      if (cfg.roleId) { await m.roles.add(cfg.roleId).catch(() => {}); given.push(uid); }
    }
    if (ids.length && ch?.send) {
      await ch.send({ content: `🎂 Happy birthday ${ids.map((id) => `<@${id}>`).join(', ')}! 🎉`, allowedMentions: { users: ids } }).catch(() => {});
    }
    updateGuild(guild.id, { birthdays: { ...cfg, lastRun: today, roleGiven: given } });
  }
};

// =====================================================================
// Auto-roles on join
// =====================================================================
const autoRoles = (guildId) => getGuild(guildId).autoRoles || { roles: [], bots: false };
const onJoin = async (member) => {
  const cfg = autoRoles(member.guild.id);
  if (!cfg.roles?.length || (member.user.bot && !cfg.bots)) return 0;
  const me = member.guild.members.me;
  const ok = cfg.roles.filter((id) => { const r = member.guild.roles.cache.get(id); return r && !r.managed && r.position < me.roles.highest.position; });
  if (ok.length) await member.roles.add(ok, 'Auto-role on join').catch(() => {});
  return ok.length;
};

module.exports = {
  warnRules, ruleFor, parseRules, fmtMin, applyWarnRules, DEFAULT_RULES,
  notes, addNote, removeNote,
  appealDm, handleAppeal, canAppeal, appealsOn,
  ticketPanel, handleTicket,
  validDay, birthdaysOn, runBirthdays,
  autoRoles, onJoin,
};
