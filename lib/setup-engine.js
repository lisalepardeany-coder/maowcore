'use strict';
// lib/setup-engine.js
// Data-driven server builder. Given a guild + a declarative template
// (see lib/setup-templates.js), it creates roles, derives permission presets
// from role flags, builds categories/channels, posts rules + info + reaction
// panels, wires the config keys other features read, and returns a summary.
//
// Templates stay declarative; ALL Discord API work lives here.

const {
  PermissionFlagsBits,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const { getGuild, updateGuild } = require('./config');
const { COLORS } = require('./theme');

const P = PermissionFlagsBits;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Standard moderator permission bundle (used when a role has the `mod` flag).
const MOD_PERMS = [
  P.ManageMessages, P.ManageThreads, P.ManageNicknames, P.KickMembers,
  P.BanMembers, P.ModerateMembers, P.MuteMembers, P.DeafenMembers,
  P.MoveMembers, P.ViewAuditLog,
];

// Resolve a role definition's permission bits.
const resolvePerms = (def) => {
  if (def.admin) return [P.Administrator];
  if (Array.isArray(def.perms)) return def.perms.map((n) => P[n]).filter(Boolean);
  if (def.mod) return MOD_PERMS;
  return [];
};

// ── idempotent create helpers (mirror commands/setup.js behaviour) ───────────

const findOrCreateRole = async (guild, def) => {
  const existing = guild.roles.cache.find((r) => r.name === def.name);
  if (existing) return existing;
  const role = await guild.roles.create({
    name: def.name,
    color: def.color ?? 0x99AAB5,
    permissions: new PermissionsBitField(resolvePerms(def)),
    hoist: def.hoist ?? false,
    mentionable: def.mentionable ?? false,
    reason: 'MaowCore /setup',
  });
  await sleep(180);
  return role;
};

const findOrCreateCategory = async (guild, name, overwrites = []) => {
  const existing = guild.channels.cache.find(
    (c) => c.name === name && c.type === ChannelType.GuildCategory,
  );
  if (existing) return existing;
  const channel = await guild.channels.create({
    name, type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites, reason: 'MaowCore /setup',
  });
  await sleep(250);
  return channel;
};

const mkch = async (guild, { name, type = ChannelType.GuildText, parent, overwrites = [], topic }) => {
  const existing = guild.channels.cache.find(
    (c) => c.name === name && c.type === type && c.parentId === (parent ?? null),
  );
  if (existing) return { channel: existing, created: false };
  const channel = await guild.channels.create({
    name, type, parent, topic, permissionOverwrites: overwrites, reason: 'MaowCore /setup',
  });
  await sleep(300);
  return { channel, created: true };
};

const postPinned = async (channel, embed) => {
  try {
    const msg = await channel.send({ embeds: [embed] });
    await msg.pin().catch(() => {});
    await sleep(350);
    return msg;
  } catch { return null; }
};

// ── main ─────────────────────────────────────────────────────────────────────

async function buildFromTemplate(interaction, tpl, progress = async () => {}) {
  const guild = interaction.guild;
  const accent = tpl.accent ?? COLORS.COSMIC;

  // 1. ROLES — create high→low list in reverse so Discord stacks them correctly.
  await progress(`Creating ${tpl.roles.length} roles…`);
  const R = {};                       // name → role object
  for (const def of [...tpl.roles].reverse()) {
    R[def.name] = await findOrCreateRole(guild, def);
  }
  const defByName = Object.fromEntries(tpl.roles.map((d) => [d.name, d]));
  const rolesWith = (flag) => tpl.roles.filter((d) => d[flag]).map((d) => R[d.name]).filter(Boolean);

  const everyone   = guild.roles.everyone;
  const staffRoles = tpl.roles.filter((d) => d.admin || d.mod).map((d) => R[d.name]).filter(Boolean);
  const adminRoles = rolesWith('admin');
  const vipRoles   = rolesWith('vip');
  const subRoles   = rolesWith('sub');
  const memberRole = rolesWith('member')[0] || null;
  const mutedRole  = rolesWith('muted')[0] || null;
  const pingRole   = rolesWith('ping')[0] || rolesWith('selfAssign')[0] || null;
  const liveRole   = rolesWith('live')[0] || null;

  const allowView = (roles, extra = []) => roles.map((r) => ({ id: r.id, allow: [P.ViewChannel, ...extra] }));

  // 2. PERMISSION PRESETS — derived from the role set above.
  const denyMutedText = mutedRole ? [{ id: mutedRole.id, deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads, P.CreatePrivateThreads] }] : [];
  const denyMutedVoice = mutedRole ? [{ id: mutedRole.id, deny: [P.Speak, P.Stream] }] : [];

  const presets = {
    public:   [...denyMutedText],
    readOnly: [
      { id: everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads] },
      ...staffRoles.map((r) => ({ id: r.id, allow: [P.SendMessages] })),
    ],
    announce: [
      { id: everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory, P.AddReactions], deny: [P.SendMessages] },
      ...staffRoles.map((r) => ({ id: r.id, allow: [P.SendMessages] })),
    ],
    staffOnly: [
      { id: everyone.id, deny: [P.ViewChannel] },
      ...allowView(staffRoles, [P.SendMessages]),
    ],
    adminOnly: [
      { id: everyone.id, deny: [P.ViewChannel] },
      ...allowView(adminRoles, [P.SendMessages]),
    ],
    subOnly: [
      { id: everyone.id, deny: [P.ViewChannel] },
      ...allowView([...subRoles, ...vipRoles], [P.SendMessages]),
      ...allowView(staffRoles, [P.SendMessages]),
    ],
    vipOnly: [
      { id: everyone.id, deny: [P.ViewChannel] },
      ...allowView(vipRoles, [P.SendMessages]),
      ...allowView(staffRoles, [P.SendMessages]),
    ],
    // Voice
    voicePublic: [...denyMutedVoice],
    subVoice: [
      { id: everyone.id, deny: [P.ViewChannel, P.Connect] },
      ...[...subRoles, ...vipRoles].map((r) => ({ id: r.id, allow: [P.ViewChannel, P.Connect, P.Speak] })),
      ...staffRoles.map((r) => ({ id: r.id, allow: [P.ViewChannel, P.Connect] })),
    ],
    vipVoice: [
      { id: everyone.id, deny: [P.ViewChannel, P.Connect] },
      ...vipRoles.map((r) => ({ id: r.id, allow: [P.ViewChannel, P.Connect, P.Speak] })),
      ...staffRoles.map((r) => ({ id: r.id, allow: [P.ViewChannel, P.Connect] })),
    ],
    staffVoice: [
      { id: everyone.id, deny: [P.ViewChannel, P.Connect] },
      ...staffRoles.map((r) => ({ id: r.id, allow: [P.ViewChannel, P.Connect, P.Speak] })),
    ],
    stats: [
      { id: everyone.id, allow: [P.ViewChannel], deny: [P.Connect] },
    ],
  };
  const preset = (name) => presets[name] ?? presets.public;

  // 3. CATEGORIES + CHANNELS
  const cfg = {};                 // config patch accumulated from `config:` flags
  let chCount = 0;
  const created = { rules: null, roleSelect: null, verify: null, summaryCh: null };

  for (const cat of tpl.categories) {
    await progress(`Building ${cat.name.replace(/^[^\s]+\s/, '')}…`);
    const catPerm = cat.perm ?? 'public';
    const catChannel = await findOrCreateCategory(guild, cat.name, preset(catPerm));

    for (const ch of cat.channels) {
      const isVoice = ch.voice || cat.voice;
      const type = isVoice ? ChannelType.GuildVoice : ChannelType.GuildText;
      const permName = ch.perm ?? (isVoice ? (catPerm.startsWith('voice') ? catPerm : 'voicePublic') : catPerm);
      const { channel, created: isNew } = await mkch(guild, {
        name: ch.name, type, parent: catChannel.id,
        overwrites: preset(permName), topic: ch.topic,
      });
      chCount++;

      if (ch.config) cfg[ch.config] = channel.id;
      if (ch.stats)  cfg.statsChannels = { ...(cfg.statsChannels || {}), [ch.stats]: channel.id };

      if (isNew && ch.info) {
        const e = new EmbedBuilder().setColor(ch.info.color ?? accent).setTitle(ch.info.title);
        if (ch.info.description) e.setDescription(ch.info.description);
        if (ch.info.fields) e.addFields(ch.info.fields);
        if (ch.info.footer) e.setFooter({ text: ch.info.footer });
        await postPinned(channel, e);
      }
      if (ch.rules) created.rules = channel;
      if (ch.roleSelect) created.roleSelect = { channel, isNew };
      if (ch.verify) created.verify = { channel, isNew };
    }
  }

  // 4. RULES embed
  if (created.rules && tpl.rules?.length) {
    const e = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle(`📜 ${guild.name} — Server Rules`)
      .setDescription(tpl.intro || 'By being here you agree to follow these rules. Ignorance is not an excuse.')
      .addFields(tpl.rules.map((r, i) => ({
        name: `${['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','⓫','⓬'][i] || '•'}  ${r.t}`,
        value: r.d,
      })))
      .setFooter({ text: `${tpl.label} template · built by MaowCore /setup` });
    await postPinned(created.rules, e);
  }

  // 5. VERIFY panel (react ✅ → member role)
  if (created.verify?.isNew && memberRole) {
    try {
      const e = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅  Verify to enter')
        .setDescription([
          `Welcome to **${guild.name}**!`, '',
          `React with **✅** to agree to the rules and unlock the server.`,
          created.rules ? `\n📜 Read the rules → <#${created.rules.id}>` : '',
        ].join('\n'))
        .setFooter({ text: 'Remove your reaction to drop the role' });
      const msg = await created.verify.channel.send({ embeds: [e] });
      await msg.pin().catch(() => {});
      await msg.react('✅');
      const store = getGuild(guild.id).reactionRoles ?? {};
      store[msg.id] = [{ emoji: '✅', roleId: memberRole.id }];
      updateGuild(guild.id, { reactionRoles: store });
      await sleep(400);
    } catch (e) { console.warn('[setup-engine] verify panel:', e.message); }
  }

  // 6. SELF-ROLE panel (react to assign roles flagged selfAssign)
  const selfDefs = tpl.roles.filter((d) => d.selfAssign && d.emoji && R[d.name]);
  if (created.roleSelect?.isNew && selfDefs.length) {
    try {
      const e = new EmbedBuilder()
        .setColor(accent)
        .setTitle('🎭 Pick your roles')
        .setDescription('React below to assign yourself a role. Remove your reaction to drop it.')
        .addFields(selfDefs.map((d) => ({ name: `${d.emoji}  ${d.name}`, value: d.desc || 'Self-assignable role.' })))
        .setFooter({ text: 'React with the matching emoji' });
      const msg = await created.roleSelect.channel.send({ embeds: [e] });
      await msg.pin().catch(() => {});
      const mappings = [];
      for (const d of selfDefs) {
        try { await msg.react(d.emoji); await sleep(280); mappings.push({ emoji: d.emoji, roleId: R[d.name].id }); }
        catch { /* invalid emoji */ }
      }
      if (mappings.length) {
        const store = getGuild(guild.id).reactionRoles ?? {};
        store[msg.id] = mappings;
        updateGuild(guild.id, { reactionRoles: store });
      }
    } catch (e) { console.warn('[setup-engine] role panel:', e.message); }
  }

  // 7. SAVE CONFIG — wire the keys runtime features + the update broadcaster read.
  updateGuild(guild.id, {
    setupComplete: true,
    setupTemplate: tpl.id,
    memberRoleId: memberRole?.id ?? getGuild(guild.id).memberRoleId,
    mutedRoleId: mutedRole?.id ?? getGuild(guild.id).mutedRoleId,
    updatePingRoleId: pingRole?.id ?? null,
    liveNotifyRoleId: liveRole?.id ?? getGuild(guild.id).liveNotifyRoleId,
    ...cfg,
  });

  // 8. SUMMARY
  const summaryCh = (cfg.announcementsChannelId && guild.channels.cache.get(cfg.announcementsChannelId))
    || (cfg.musicChannelId && guild.channels.cache.get(cfg.musicChannelId))
    || created.rules;
  const summary = new EmbedBuilder()
    .setColor(accent)
    .setTitle(`${tpl.emoji} ${tpl.label} — Setup Complete`)
    .setDescription(`Built a **${tpl.label}** server: **${tpl.categories.length} categories**, **${chCount} channels**, **${tpl.roles.length} roles**, with rules, reaction roles, and permissions wired.`)
    .addFields(tpl.categories.map((c) => ({
      name: c.name,
      value: (c.channels.map((ch) => `${ch.voice || c.voice ? '🔊 ' : '#'}${ch.name}`).join(' · ') || '—').slice(0, 1024),
    })).slice(0, 24))
    .setFooter({ text: `Template: ${tpl.id} · /announceupdate to broadcast bot updates here` });
  if (summaryCh) summaryCh.send({ embeds: [summary] }).catch(() => {});

  return { roles: tpl.roles.length, categories: tpl.categories.length, channels: chCount };
}

module.exports = { buildFromTemplate };
