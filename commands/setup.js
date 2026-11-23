'use strict';
// commands/setup.js
// Builds the full MaowCore community server — categories, channels, roles,
// permission overwrites, pinned info embeds, and GitHub feed channel IDs.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');
const { buildFromTemplate } = require('../lib/setup-engine');
const { getTemplate, templateChoices } = require('../lib/setup-templates');

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const findOrCreateRole = async (guild, { name, color, permissions, hoist, mentionable }) => {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return { role: existing, created: false };
  const role = await guild.roles.create({
    name, color,
    permissions: new PermissionsBitField(permissions ?? []),
    hoist:       hoist       ?? false,
    mentionable: mentionable ?? false,
    reason: 'MaowCore /setup',
  });
  return { role, created: true };
};

const findOrCreateCategory = async (guild, name, overwrites = []) => {
  const existing = guild.channels.cache.find(
    (c) => c.name === name && c.type === ChannelType.GuildCategory,
  );
  if (existing) return { channel: existing, created: false };
  const channel = await guild.channels.create({
    name, type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: 'MaowCore /setup',
  });
  return { channel, created: true };
};

// Returns { channel, created } — created=true if newly made, false if already existed.
const mkch = async (guild, { name, type = ChannelType.GuildText, parent, overwrites = [], topic }) => {
  const existing = guild.channels.cache.find(
    (c) => c.name === name && c.type === type && c.parentId === (parent ?? null),
  );
  if (existing) return { channel: existing, created: false };
  const channel = await guild.channels.create({
    name, type, parent, topic,
    permissionOverwrites: overwrites,
    reason: 'MaowCore /setup',
  });
  await sleep(300); // avoid Discord rate-limit on mass creation
  return { channel, created: true };
};

// Post a pinned info embed in a freshly-created channel.
// Returns the Discord Message object (or null if skipped / errored).
const postInfo = async (channel, created, embedData) => {
  if (!created) return null;
  try {
    const embed = new EmbedBuilder()
      .setColor(embedData.color ?? COLORS.COSMIC)
      .setTitle(embedData.title);
    if (embedData.description) embed.setDescription(embedData.description);
    if (embedData.fields)      embed.addFields(embedData.fields);
    if (embedData.footer)      embed.setFooter({ text: embedData.footer });
    const msg = await channel.send({ embeds: [embed] });
    await msg.pin().catch(() => {}); // pin — not fatal if it fails
    await sleep(400);
    return msg;
  } catch { return null; }
};

// ─── Role definitions (listed high → low; created in reverse so Discord stacks correctly) ───

const ROLE_DEFS = [
  // ── Staff ──────────────────────────────────────────────────────────────────
  {
    name: '⭐ Head Admin', color: 0xFFD700, hoist: true, mentionable: true,
    permissions: [PermissionFlagsBits.Administrator],
  },
  {
    name: '🔴 Admin', color: 0xED4245, hoist: true, mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads, PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ViewGuildInsights,
      PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.PrioritySpeaker,
    ],
  },
  {
    name: '🟠 Head Moderator', color: 0xFFA500, hoist: true, mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers,
      PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ViewAuditLog,
    ],
  },
  {
    name: '🟡 Moderator', color: 0xFEE75C, hoist: true, mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.ManageNicknames, PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ViewAuditLog,
    ],
  },
  {
    name: '🟢 Trial Moderator', color: 0x57F287, hoist: true, mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewAuditLog,
    ],
  },
  {
    name: '🎓 Alumni', color: 0x9B59B6, hoist: false, mentionable: false,
    permissions: [], // former staff — no extra perms, just a badge
  },

  // ── Development ────────────────────────────────────────────────────────────
  {
    name: '👑 Lead Developer', color: 0xF1C40F, hoist: true, mentionable: true,
    permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels,
                  PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ViewAuditLog],
  },
  {
    name: '🤖 Bot Developer', color: 0x5865F2, hoist: true, mentionable: true,
    permissions: [PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ViewAuditLog],
  },
  {
    name: '🔧 Contributor', color: 0x3498DB, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '🧪 Beta Tester', color: 0xE74C3C, hoist: false, mentionable: true,
    permissions: [],
  },
  {
    name: '🐛 Bug Hunter', color: 0xE67E22, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '📝 Docs Writer', color: 0x1ABC9C, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '🎨 Designer', color: 0xFF69B4, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '🌍 Translator', color: 0x2ECC71, hoist: false, mentionable: false,
    permissions: [],
  },

  // ── Community ──────────────────────────────────────────────────────────────
  {
    name: '🎵 DJ', color: 0x8B5CF6, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '💎 VIP', color: 0x00CED1, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '🌟 Server Booster', color: 0xFF73FA, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '🤝 Partner', color: 0x00B0F4, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '📢 Content Creator', color: 0xFF4500, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '👤 Member', color: 0x5865F2, hoist: false, mentionable: false,
    permissions: [],
  },

  // ── Self-assignable ────────────────────────────────────────────────────────
  {
    name: '🔔 Update Pings', color: 0x99AAB5, hoist: false, mentionable: true,
    permissions: [],
  },
  {
    name: '🧪 Beta Pings', color: 0xFF6347, hoist: false, mentionable: true,
    permissions: [],
  },
  {
    name: '🎮 Gamer', color: 0x43B581, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '🎵 Music Lover', color: 0x7289DA, hoist: false, mentionable: false,
    permissions: [],
  },

  // ── Moderation ────────────────────────────────────────────────────────────
  {
    name: '🔇 Muted', color: 0x6B7280, hoist: false, mentionable: false,
    permissions: [],
  },
  {
    name: '🚫 Blacklisted', color: 0x2C2F33, hoist: false, mentionable: false,
    permissions: [],
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Build a server from a template — streamer, YouTube, gaming, music & more (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName('template')
        .setDescription('Which server template to build')
        .addChoices(
          ...templateChoices,
          { name: '✦ MaowCore (full dev/community server)', value: 'maowcore' },
        )),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;
    await guild.members.fetch().catch(() => {});

    // Progress updates so the interaction doesn't feel stuck
    const progress = async (msg) => {
      await interaction.editReply(`⚙️ ${msg}`).catch(() => {});
    };

    // ── Dispatch: creator/streamer templates run through the data-driven engine.
    // The original full "MaowCore" community server is the default fall-through.
    const templateId = interaction.options.getString('template') || 'maowcore';
    if (templateId !== 'maowcore') {
      const tpl = getTemplate(templateId);
      if (!tpl) return interaction.editReply(`▲  Unknown template: \`${templateId}\``);
      try {
        const stats = await buildFromTemplate(interaction, tpl, progress);
        return interaction.editReply(
          `${tpl.emoji}  **${tpl.label} server built!**\n` +
          `• **${stats.categories} categories** · **${stats.channels} channels** · **${stats.roles} roles**\n` +
          `• Rules, ✅ verify gate, 🎭 self-roles, and permissions all wired\n` +
          `• \`/announceupdate\` posts bot updates to **#🔔-bot-updates** here\n\n` +
          `Re-run \`/setup\` anytime — it’s idempotent (existing roles/channels are reused, not duplicated).`,
        );
      } catch (e) {
        console.error('[setup:template]', e);
        return interaction.editReply(`▲  Setup failed: ${e.message}`);
      }
    }

    try {
      // ══════════════════════════════════════════════════════════════════════
      // 1. ROLES
      // ══════════════════════════════════════════════════════════════════════
      await progress('Creating roles…');
      const R = {}; // name → role object
      for (const def of [...ROLE_DEFS].reverse()) {
        const { role } = await findOrCreateRole(guild, def);
        R[def.name] = role;
        await sleep(200);
      }

      const headAdmin = R['⭐ Head Admin'];
      const admin     = R['🔴 Admin'];
      const headMod   = R['🟠 Head Moderator'];
      const mod       = R['🟡 Moderator'];
      const trialMod  = R['🟢 Trial Moderator'];
      const leadDev   = R['👑 Lead Developer'];
      const botDev    = R['🤖 Bot Developer'];
      const betaTester = R['🧪 Beta Tester'];
      const vip       = R['💎 VIP'];
      const muted     = R['🔇 Muted'];
      const blacklisted = R['🚫 Blacklisted'];
      const everyone  = guild.roles.everyone;

      const staffRoles = [headAdmin, admin, headMod, mod, trialMod];
      const adminRoles = [headAdmin, admin];
      const devRoles   = [headAdmin, admin, leadDev, botDev];

      // ══════════════════════════════════════════════════════════════════════
      // 2. PERMISSION PRESETS
      // ══════════════════════════════════════════════════════════════════════

      // Read-only for everyone (info channels)
      const readOnly = [
        { id: everyone,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: muted,      deny: [PermissionFlagsBits.ViewChannel] },
        { id: blacklisted, deny: [PermissionFlagsBits.ViewChannel] },
        ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.SendMessages] })),
      ];

      // Public — everyone can chat, muted blocked
      const publicPerms = [
        { id: muted,      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.Speak] },
        { id: blacklisted, deny: [PermissionFlagsBits.ViewChannel] },
      ];

      // Announcements — read for everyone, send for staff only
      const announcePerms = [
        { id: everyone,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: muted,      deny: [PermissionFlagsBits.ViewChannel] },
        { id: blacklisted, deny: [PermissionFlagsBits.ViewChannel] },
        ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.SendMessages] })),
      ];

      // Staff only
      const staffOnly = [
        { id: everyone,   deny: [PermissionFlagsBits.ViewChannel] },
        ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
      ];

      // Admin only
      const adminOnly = [
        { id: everyone,   deny: [PermissionFlagsBits.ViewChannel] },
        ...adminRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
      ];

      // Dev team only (devs + admins)
      const devOnly = [
        { id: everyone,   deny: [PermissionFlagsBits.ViewChannel] },
        ...devRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
      ];

      // Beta channel — beta testers + devs + staff
      const betaPerms = [
        { id: everyone,   deny: [PermissionFlagsBits.ViewChannel] },
        { id: betaTester, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ...devRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
        ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel] })),
      ];

      // VIP only
      const vipOnly = [
        { id: everyone,   deny: [PermissionFlagsBits.ViewChannel] },
        { id: vip,        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
      ];

      // Voice presets
      const staffVoice = [
        { id: everyone,   deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })),
      ];
      const devVoice = [
        { id: everyone,   deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        ...devRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })),
        ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] })),
      ];
      const vipVoice = [
        { id: everyone,   deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: vip,        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
        ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] })),
      ];
      const statsPerms = [
        { id: everyone,   allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.Connect] },
        { id: blacklisted, deny: [PermissionFlagsBits.ViewChannel] },
      ];

      // ══════════════════════════════════════════════════════════════════════
      // 3. CATEGORIES + CHANNELS
      // ══════════════════════════════════════════════════════════════════════

      // ── 📋 Info ────────────────────────────────────────────────────────────
      await progress('Building Info channels…');
      const { channel: infoCat } = await findOrCreateCategory(guild, '📋 Info', readOnly);

      const { channel: chRules, created: rulesNew }          = await mkch(guild, { name: '📜-rules',         parent: infoCat.id, overwrites: readOnly,    topic: 'Read the rules before participating.' });
      const { channel: chAnnounce, created: announceNew }    = await mkch(guild, { name: '📣-announcements', parent: infoCat.id, overwrites: announcePerms, topic: 'Official server announcements.' });
      const { channel: chUpdates, created: updatesNew }      = await mkch(guild, { name: '🔔-updates',       parent: infoCat.id, overwrites: announcePerms, topic: 'Bot updates and changelogs.' });
      const { channel: chFaq, created: faqNew }              = await mkch(guild, { name: '❓-faq',           parent: infoCat.id, overwrites: readOnly,    topic: 'Frequently asked questions.' });
      const { channel: chRoleInfo, created: roleInfoNew }    = await mkch(guild, { name: '🎭-roles-info',    parent: infoCat.id, overwrites: readOnly,    topic: 'What each role means and how to get it.' });
      const { channel: chPartners, created: partnersNew }    = await mkch(guild, { name: '🤝-partners',      parent: infoCat.id, overwrites: readOnly,    topic: 'Partner servers and communities.' });
      const { channel: chSocials, created: socialsNew }      = await mkch(guild, { name: '🌐-socials',       parent: infoCat.id, overwrites: readOnly,    topic: 'Our social media links.' });

      // Info embeds
      await postInfo(chRules, rulesNew, {
        title: '📜 Server Rules', color: 0xFF6B6B,
        fields: [
          { name: '1️⃣  Be Respectful', value: 'Treat everyone with respect. Harassment, hate speech, slurs, or personal attacks of any kind will result in an immediate ban.', inline: false },
          { name: '2️⃣  No Spam', value: 'No spam, excessive mentions, emoji floods, or repeated messages. Keep it readable.', inline: false },
          { name: '3️⃣  Relevant Content Only', value: 'Keep discussions in the correct channels. Off-topic chat belongs in #🎲-off-topic.', inline: false },
          { name: '4️⃣  No NSFW', value: 'This is a development server. Zero tolerance for NSFW content anywhere.', inline: false },
          { name: '5️⃣  No Advertising', value: 'No self-promotion, server invites, or advertising without permission from an Admin+.', inline: false },
          { name: '6️⃣  No Piracy / Illegal Content', value: 'Do not share cracked software, pirated music, or anything that violates copyright. This includes YouTube rips of paid content.', inline: false },
          { name: '7️⃣  No Doxxing', value: 'Never share anyone\'s personal information — real name, address, phone number, social media, etc.', inline: false },
          { name: '8️⃣  Follow Discord ToS', value: 'All Discord Terms of Service and Community Guidelines apply here. [Read them →](https://discord.com/terms)', inline: false },
          { name: '9️⃣  Respect Staff Decisions', value: 'Staff decisions are final. If you disagree, use #📬-appeals. Don\'t argue in public channels.', inline: false },
          { name: '🔟  Bot & Dev Rules', value: '• Bug reports → #🐛-bug-reports (use the template)\n• Feature requests → #💡-feature-requests\n• Keep unreleased beta features confidential\n• No spamming bot commands outside bot-commands channels', inline: false },
          { name: '⚠️  Punishment Ladder', value: '`Verbal warning` → `Timeout` → `Kick` → `Ban`\nSevere violations (hate speech, doxxing, NSFW) skip straight to ban.', inline: false },
        ],
        footer: 'Last updated by MaowCore /setup · ignorance of rules is not an excuse',
      });

      await postInfo(chAnnounce, announceNew, {
        title: '📣 Announcements', color: 0xFEE75C,
        description: 'Official server and project announcements from the staff team.\n\n**React with ✅** once you have read an announcement.\n\nEnable notifications for this channel to stay up to date.',
        footer: 'Only staff can post here',
      });

      await postInfo(chUpdates, updatesNew, {
        title: '🔔 Updates', color: COLORS.COSMIC,
        description: 'MaowCore bot changelogs and update notes are posted here automatically.\n\nYou can also find the full changelog on [GitHub](https://github.com/lisalepardeany-coder/maowcore/blob/main/CHANGELOG.md).\n\nPing role: **🔔 Update Pings** — assign it in #🎨-role-selection.',
        footer: 'Auto-posted from GitHub',
      });

      await postInfo(chFaq, faqNew, {
        title: '❓ Frequently Asked Questions', color: 0x3498DB,
        fields: [
          { name: 'What is MaowCore?', value: 'MaowCore is a self-hosted Discord music bot with a web dashboard, economy, moderation suite, multi-bot support, and more. See the README for the full feature list.', inline: false },
          { name: 'How do I self-host it?', value: 'Clone the repo, copy `.env.example` → `.env`, fill in your token, run `npm install && npm start`. Full guide in #📖-getting-started.', inline: false },
          { name: 'Is it free?', value: 'Yes — fully open source under the MIT license.', inline: false },
          { name: 'How do I report a bug?', value: 'Use #🐛-bug-reports and follow the template pinned there.', inline: false },
          { name: 'Where is the dashboard?', value: 'By default at `http://127.0.0.1:8765/` on the host machine. See the README for reverse-proxy / public-access setup.', inline: false },
          { name: 'I need help with setup', value: 'Post in #🎫-support-general with your OS, Node.js version, and any error messages.', inline: false },
        ],
      });

      await postInfo(chRoleInfo, roleInfoNew, {
        title: '🎭 Role Guide', color: 0x9B59B6,
        fields: [
          { name: '🛡️ Staff Roles', value: '⭐ Head Admin · 🔴 Admin · 🟠 Head Mod · 🟡 Moderator · 🟢 Trial Mod\n*Assigned by staff only.*', inline: false },
          { name: '💻 Dev Roles', value: '👑 Lead Developer · 🤖 Bot Developer · 🔧 Contributor · 🧪 Beta Tester · 🐛 Bug Hunter · 📝 Docs Writer · 🎨 Designer · 🌍 Translator\n*Assigned based on contributions.*', inline: false },
          { name: '🌟 Community Roles', value: '🎵 DJ · 💎 VIP · 🌟 Server Booster · 🤝 Partner · 📢 Content Creator · 👤 Member', inline: false },
          { name: '📌 Self-assignable', value: 'Go to #🎨-role-selection to pick up:\n🔔 Update Pings · 🧪 Beta Pings · 🎮 Gamer · 🎵 Music Lover', inline: false },
          { name: '🚫 Moderation Roles', value: '🔇 Muted · 🚫 Blacklisted — assigned by staff only.', inline: false },
        ],
      });

      // ── 👋 Welcome ────────────────────────────────────────────────────────
      await progress('Building Welcome channels…');
      const { channel: welcomeCat } = await findOrCreateCategory(guild, '👋 Welcome', publicPerms);

      // #✅-verify — read-only for everyone, reactions allowed. New members
      // react with ✅ to receive the Member role (acts as a captcha/agreement gate).
      const verifyOverwrites = [
        { id: everyone,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions], deny: [PermissionFlagsBits.SendMessages] },
        { id: muted,      deny: [PermissionFlagsBits.ViewChannel] },
        { id: blacklisted, deny: [PermissionFlagsBits.ViewChannel] },
        ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.SendMessages] })),
      ];
      const { channel: chVerify, created: verifyNew }     = await mkch(guild, { name: '✅-verify',         parent: welcomeCat.id, overwrites: verifyOverwrites, topic: 'React with ✅ to verify and get the Member role.' });
      const { channel: chWelcome }                        = await mkch(guild, { name: '✧-welcome',         parent: welcomeCat.id, overwrites: announcePerms, topic: 'Member join and leave messages.' });
      const { channel: chIntro, created: introNew }       = await mkch(guild, { name: '👋-introductions',  parent: welcomeCat.id, overwrites: publicPerms,   topic: 'Introduce yourself!' });
      const { channel: chRoleSelect, created: rsNew }     = await mkch(guild, { name: '🎨-role-selection', parent: welcomeCat.id, overwrites: verifyOverwrites, topic: 'React to self-assign roles.' });
      const { channel: chBirthdays }                      = await mkch(guild, { name: '🎂-birthdays',      parent: welcomeCat.id, overwrites: announcePerms, topic: 'Birthday shoutouts.' });
      const { channel: chGoodbye }                        = await mkch(guild, { name: '👋-goodbyes',       parent: welcomeCat.id, overwrites: announcePerms, topic: 'Farewell messages.' });

      await postInfo(chIntro, introNew, {
        title: '👋 Introductions', color: 0x57F287,
        description: 'Welcome! Tell us a bit about yourself.\n\n**Template:**\n```\nName/Nickname:\nHow you found us:\nWhat you code/do:\nFavourite music genre:\nFun fact:\n```',
      });

      // ── Verify message — react ✅ → Member role ───────────────────────────
      const memberRole = R['👤 Member'];
      if (verifyNew && memberRole) {
        try {
          const verifyEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅  Verify to enter')
            .setDescription([
              'Welcome to the **MaowCore** community server!',
              '',
              'React with **✅** below to agree to the server rules and receive the **👤 Member** role.',
              '',
              `📜 Read the rules first → <#${chRules?.id ?? ''}>`,
            ].join('\n'))
            .setFooter({ text: 'Remove your reaction to drop the Member role' });

          const verifyMsg = await chVerify.send({ embeds: [verifyEmbed] });
          await verifyMsg.pin().catch(() => {});
          await verifyMsg.react('✅');

          // Register in reactionRoles store
          const rrStore = getGuild(guild.id).reactionRoles ?? {};
          rrStore[verifyMsg.id] = [{ emoji: '✅', roleId: memberRole.id }];
          updateGuild(guild.id, { reactionRoles: rrStore });
          await sleep(400);
        } catch (e) { console.warn('[setup] verify message failed:', e.message); }
      }

      // ── Role-selection panel — react to get self-assignable roles ─────────
      const rolePanelMsg = await postInfo(chRoleSelect, rsNew, {
        title: '🎨 Self-Assignable Roles', color: 0x00CED1,
        description: 'React below to assign yourself a role. Remove your reaction to drop it.',
        fields: [
          { name: '🔔 Update Pings',  value: 'Get pinged when MaowCore releases an update.',   inline: false },
          { name: '🧪 Beta Pings',    value: 'Get pinged for beta testing opportunities.',       inline: false },
          { name: '🎮 Gamer',         value: 'Tag yourself as a gamer.',                        inline: false },
          { name: '🎵 Music Lover',   value: 'Tag yourself as a music lover.',                  inline: false },
        ],
        footer: 'React with the corresponding emoji to get the role',
      });

      // React with each emoji and register all 4 mappings on the same message
      if (rolePanelMsg) {
        const selfRoleMappings = [
          { emoji: '🔔', roleName: '🔔 Update Pings' },
          { emoji: '🧪', roleName: '🧪 Beta Pings'   },
          { emoji: '🎮', roleName: '🎮 Gamer'         },
          { emoji: '🎵', roleName: '🎵 Music Lover'   },
        ];
        const validMappings = [];
        for (const { emoji, roleName } of selfRoleMappings) {
          const role = R[roleName];
          if (!role) continue;
          try { await rolePanelMsg.react(emoji); await sleep(300); } catch { /* invalid emoji */ }
          validMappings.push({ emoji, roleId: role.id });
        }
        if (validMappings.length) {
          const rrStore = getGuild(guild.id).reactionRoles ?? {};
          rrStore[rolePanelMsg.id] = validMappings;
          updateGuild(guild.id, { reactionRoles: rrStore });
        }
      }

      // ── 📢 Announcements ──────────────────────────────────────────────────
      await progress('Building Announcements channels…');
      const { channel: announceCat } = await findOrCreateCategory(guild, '📢 Announcements', announcePerms);

      const { channel: chServerNews }    = await mkch(guild, { name: '📰-server-news',    parent: announceCat.id, overwrites: announcePerms, topic: 'Important server news.' });
      const { channel: chEvents }        = await mkch(guild, { name: '🎪-events',         parent: announceCat.id, overwrites: announcePerms, topic: 'Upcoming events and competitions.' });
      const { channel: chGiveaways }     = await mkch(guild, { name: '🎉-giveaways',      parent: announceCat.id, overwrites: announcePerms, topic: 'Server giveaways.' });
      const { channel: chPartnerAnnounce } = await mkch(guild, { name: '🤝-partner-news', parent: announceCat.id, overwrites: announcePerms, topic: 'Partner server announcements.' });

      // ── 💬 General ────────────────────────────────────────────────────────
      await progress('Building General channels…');
      const { channel: generalCat } = await findOrCreateCategory(guild, '💬 General', publicPerms);

      const { channel: chGeneral }       = await mkch(guild, { name: '💬-general',        parent: generalCat.id, overwrites: publicPerms, topic: 'General chat — anything goes (within rules).' });
      const { channel: chOffTopic }      = await mkch(guild, { name: '🎲-off-topic',      parent: generalCat.id, overwrites: publicPerms, topic: 'Completely off-topic chatter.' });
      const { channel: chMemes }         = await mkch(guild, { name: '😂-memes',          parent: generalCat.id, overwrites: publicPerms, topic: 'Memes and funny content only.' });
      const { channel: chMedia }         = await mkch(guild, { name: '🖼️-media',          parent: generalCat.id, overwrites: publicPerms, topic: 'Images, videos, and GIFs.' });
      const { channel: chPolls }         = await mkch(guild, { name: '📊-polls',          parent: generalCat.id, overwrites: publicPerms, topic: 'Community polls. Staff create polls; everyone votes.' });
      const { channel: chCounting }      = await mkch(guild, { name: '🔢-counting',       parent: generalCat.id, overwrites: publicPerms, topic: 'Count as high as we can! One number per message, no double-posting.' });
      const { channel: chStarboard }     = await mkch(guild, { name: '⭐-starboard',      parent: generalCat.id, overwrites: announcePerms, topic: 'Top reacted messages auto-land here.' });
      const { channel: chSuggestions }   = await mkch(guild, { name: '💡-suggestions',    parent: generalCat.id, overwrites: publicPerms, topic: 'Server suggestions. Use the format: **Suggestion:** / **Reason:**' });

      // ── 🎮 Gaming ─────────────────────────────────────────────────────────
      await progress('Building Gaming channels…');
      const { channel: gamingCat } = await findOrCreateCategory(guild, '🎮 Gaming', publicPerms);

      const { channel: chGamingGeneral } = await mkch(guild, { name: '🎮-gaming-general',    parent: gamingCat.id, overwrites: publicPerms, topic: 'All things gaming.' });
      const { channel: chLFG }           = await mkch(guild, { name: '🔍-looking-for-group', parent: gamingCat.id, overwrites: publicPerms, topic: 'Find people to play with. Include game name and platform.' });
      const { channel: chGameClips }     = await mkch(guild, { name: '🎬-game-clips',        parent: gamingCat.id, overwrites: publicPerms, topic: 'Share your best gaming moments.' });
      const { channel: chAchievements }  = await mkch(guild, { name: '🏆-achievements',      parent: gamingCat.id, overwrites: publicPerms, topic: 'Brag about your achievements and milestones.' });
      const { channel: chGameReviews }   = await mkch(guild, { name: '📝-game-reviews',      parent: gamingCat.id, overwrites: publicPerms, topic: 'Mini reviews and recommendations. Keep spoilers tagged.' });

      // ── 🎨 Creative ───────────────────────────────────────────────────────
      await progress('Building Creative channels…');
      const { channel: creativeCat } = await findOrCreateCategory(guild, '🎨 Creative', publicPerms);

      const { channel: chArt }          = await mkch(guild, { name: '🎨-art',        parent: creativeCat.id, overwrites: publicPerms, topic: 'Share your artwork. Give credit to original artists if not yours.' });
      const { channel: chPhotography }  = await mkch(guild, { name: '📷-photography', parent: creativeCat.id, overwrites: publicPerms, topic: 'Photography and photo edits.' });
      const { channel: chWriting }      = await mkch(guild, { name: '✍️-writing',    parent: creativeCat.id, overwrites: publicPerms, topic: 'Stories, poems, lyrics, creative writing.' });
      const { channel: chShowcase }     = await mkch(guild, { name: '✨-showcase',   parent: creativeCat.id, overwrites: publicPerms, topic: 'Show off projects, builds, designs, and creations.' });

      // ── 🎵 Music Lounge ───────────────────────────────────────────────────
      await progress('Building Music Lounge channels…');
      const { channel: musicLoungeCat } = await findOrCreateCategory(guild, '🎵 Music Lounge', publicPerms);

      const { channel: chMusicChat }    = await mkch(guild, { name: '🎵-music-chat',       parent: musicLoungeCat.id, overwrites: publicPerms, topic: 'Talk about music, artists, albums, genres.' });
      const { channel: chSongRequests } = await mkch(guild, { name: '🎤-song-requests',    parent: musicLoungeCat.id, overwrites: publicPerms, topic: 'Request songs for the queue. Format: Song - Artist [URL optional]' });
      const { channel: chPlaylists }    = await mkch(guild, { name: '📋-playlist-sharing', parent: musicLoungeCat.id, overwrites: publicPerms, topic: 'Share your playlists. Include a short description.' });
      const { channel: chRecommend }    = await mkch(guild, { name: '💿-recommendations',  parent: musicLoungeCat.id, overwrites: publicPerms, topic: 'Recommend music. Format: Artist — Album/Song · Why you love it.' });
      const { channel: chNowPlaying }   = await mkch(guild, { name: '▶️-now-playing-chat', parent: musicLoungeCat.id, overwrites: publicPerms, topic: 'React and chat about what the bot is currently playing.' });

      // ── 💎 VIP ────────────────────────────────────────────────────────────
      await progress('Building VIP channels…');
      const { channel: vipCat } = await findOrCreateCategory(guild, '💎 VIP', vipOnly);

      const { channel: chVipLounge, created: vipLoungeNew } = await mkch(guild, { name: '💎-vip-lounge',   parent: vipCat.id, overwrites: vipOnly, topic: 'Exclusive chat for VIP members.' });
      const { channel: chVipMedia }  = await mkch(guild, { name: '🖼️-vip-media',  parent: vipCat.id, overwrites: vipOnly, topic: 'VIP media sharing.' });
      const { channel: chVipEvents } = await mkch(guild, { name: '🎪-vip-events',  parent: vipCat.id, overwrites: vipOnly, topic: 'Early access to event announcements.' });
      const { channel: chVipFeedback } = await mkch(guild, { name: '📬-vip-feedback', parent: vipCat.id, overwrites: vipOnly, topic: 'Direct feedback channel to the dev team.' });

      await postInfo(chVipLounge, vipLoungeNew, {
        title: '💎 VIP Lounge', color: 0x00CED1,
        description: 'Welcome to the VIP section! As a VIP you get:\n\n• Early access to announcements and event info\n• Direct feedback line to the dev team via #📬-vip-feedback\n• A dedicated voice lounge\n• Your name highlighted in the member list\n\nThank you for your continued support of MaowCore! ✦',
      });

      // ── 🛠️ Development ────────────────────────────────────────────────────
      await progress('Building Development channels…');
      const { channel: devCat } = await findOrCreateCategory(guild, '🛠️ Development', publicPerms);

      const { channel: chDevGeneral, created: devGenNew }   = await mkch(guild, { name: '🛠️-dev-general',    parent: devCat.id, overwrites: publicPerms, topic: 'General development discussion.' });
      const { channel: chDevHelp }                          = await mkch(guild, { name: '🆘-dev-help',        parent: devCat.id, overwrites: publicPerms, topic: 'Need help with the codebase? Ask here. Include code snippets.' });
      const { channel: chCodeReview }                       = await mkch(guild, { name: '🔍-code-review',     parent: devCat.id, overwrites: publicPerms, topic: 'Post code for review. Link your branch or paste a snippet.' });
      const { channel: chRoadmap, created: roadmapNew }     = await mkch(guild, { name: '🗺️-roadmap',        parent: devCat.id, overwrites: readOnly,    topic: 'Current development roadmap and priorities.' });
      const { channel: chChangelog, created: changelogNew } = await mkch(guild, { name: '📋-changelogs',      parent: devCat.id, overwrites: announcePerms, topic: 'Version changelogs posted here.' });
      const { channel: chBetaChannel }                      = await mkch(guild, { name: '🧪-beta-channel',    parent: devCat.id, overwrites: betaPerms,    topic: 'Beta features discussion — NDA: keep unreleased features confidential.' });
      const { channel: chContribGuide, created: contribNew } = await mkch(guild, { name: '🤝-contributing',  parent: devCat.id, overwrites: readOnly,    topic: 'How to contribute to MaowCore.' });

      await postInfo(chDevGeneral, devGenNew, {
        title: '🛠️ Development', color: 0x5865F2,
        description: 'This is the main hub for MaowCore development discussion.\n\n**Channels in this section:**\n• 🆘-dev-help — stuck on something? Ask here\n• 🔍-code-review — share code for feedback\n• 🗺️-roadmap — see what\'s coming next\n• 📋-changelogs — version history\n• 🧪-beta-channel — beta testers only\n• 🤝-contributing — how to contribute\n\n**GitHub:** https://github.com/lisalepardeany-coder/maowcore',
      });

      await postInfo(chRoadmap, roadmapNew, {
        title: '🗺️ Development Roadmap', color: 0xF1C40F,
        fields: [
          { name: '✅ Shipped (recent)', value: 'SQLite migration · Login/RBAC · Voice-follow · Multi-bot platform · Observability · Game night · Automation engine', inline: false },
          { name: '🔨 In Progress', value: 'Lyrics on demand · Vote-skip · Scheduled playback · Audit log table', inline: false },
          { name: '📌 Planned', value: '"More like this" recommendations · DJ request queue · Per-user listening cards · Crossfade · Karaoke mode', inline: false },
          { name: '💡 Under Consideration', value: 'Plugin marketplace · Mobile companion app · Spotify OAuth sync', inline: false },
        ],
        footer: 'Updated by the dev team — suggest features in #💡-feature-requests',
      });

      await postInfo(chChangelog, changelogNew, {
        title: '📋 Changelogs', color: COLORS.COSMIC,
        description: 'Version changelogs are posted here and in #🔔-updates.\n\nFull changelog: https://github.com/lisalepardeany-coder/maowcore/blob/main/CHANGELOG.md',
      });

      await postInfo(chContribGuide, contribNew, {
        title: '🤝 Contributing to MaowCore', color: 0x2ECC71,
        fields: [
          { name: '1. Fork & clone', value: '```\ngit clone https://github.com/lisalepardeany-coder/maowcore.git\ncd maowcore && npm install\n```', inline: false },
          { name: '2. Create a branch', value: '```\ngit checkout -b feat/your-feature-name\n```', inline: false },
          { name: '3. Make changes + tests', value: 'Run `npm test` before submitting. All 94 tests should pass.', inline: false },
          { name: '4. Open a Pull Request', value: 'Target `main`. Describe what and why. Reference any related issue.', inline: false },
          { name: 'What we need help with', value: '🐛 Bug fixes · 📝 Documentation · 🌍 Translations · 🎨 UI/UX · 🧪 Testing', inline: false },
        ],
      });

      // ── 📦 GitHub ─────────────────────────────────────────────────────────
      await progress('Building GitHub channels…');
      const { channel: githubCat } = await findOrCreateCategory(guild, '📦 GitHub', publicPerms);

      const { channel: chGithubCommits, created: gcNew }   = await mkch(guild, { name: '🔨-commits',        parent: githubCat.id, overwrites: announcePerms, topic: 'Auto-posted: every new commit to main.' });
      const { channel: chGithubReleases, created: grNew }  = await mkch(guild, { name: '🚀-releases',       parent: githubCat.id, overwrites: announcePerms, topic: 'Auto-posted: new GitHub releases.' });
      const { channel: chGithubIssues, created: giNew }    = await mkch(guild, { name: '🐛-github-issues',  parent: githubCat.id, overwrites: announcePerms, topic: 'Auto-posted: new issues opened on GitHub.' });
      const { channel: chGithubPRs, created: gpNew }       = await mkch(guild, { name: '🔀-pull-requests',  parent: githubCat.id, overwrites: announcePerms, topic: 'Auto-posted: new pull requests.' });
      const { channel: chGithubActions, created: gaNew }   = await mkch(guild, { name: '⚙️-ci-actions',     parent: githubCat.id, overwrites: announcePerms, topic: 'GitHub Actions / CI results.' });

      await postInfo(chGithubCommits, gcNew, {
        title: '🔨 Commit Feed', color: 0x24292E,
        description: 'Every commit pushed to the `main` branch is automatically posted here by MaowCore\'s GitHub feed poller.\n\nPolling interval: **every 5 minutes**.\n\n🔔 Subscribe to #🔔-updates for release-level pings instead.',
        footer: `${process.env.GITHUB_OWNER || 'lisalepardeany-coder'}/${process.env.GITHUB_REPO || 'maowcore'}`,
      });

      await postInfo(chGithubReleases, grNew, {
        title: '🚀 Releases', color: 0x2DA44E,
        description: 'New GitHub releases are automatically posted here.\n\n**🔔 Update Pings** role gets pinged on each release — grab it from #🎨-role-selection.\n\nPolling interval: **every 10 minutes**.',
        footer: `${process.env.GITHUB_OWNER || 'lisalepardeany-coder'}/${process.env.GITHUB_REPO || 'maowcore'}`,
      });

      await postInfo(chGithubIssues, giNew, {
        title: '🐛 GitHub Issues Feed', color: 0xE4606D,
        description: 'New issues opened on the GitHub repository are automatically posted here.\n\nTo open an issue, either:\n• Post in #🐛-bug-reports and a mod will file it\n• Open one directly: https://github.com/lisalepardeany-coder/maowcore/issues/new',
      });

      await postInfo(chGithubPRs, gpNew, {
        title: '🔀 Pull Requests Feed', color: 0x8957E5,
        description: 'New pull requests are automatically posted here.\n\nWant to contribute? Read #🤝-contributing first then open a PR on GitHub.',
      });

      await postInfo(chGithubActions, gaNew, {
        title: '⚙️ CI / GitHub Actions', color: 0xFEE75C,
        description: 'GitHub Actions workflow results (tests, builds, deploys) are posted here.\n\n**Green ✅** = all 94 tests pass\n**Red ❌** = something broke — check the Actions tab on GitHub.',
      });

      // ── 🐛 Bug Reports & Features ─────────────────────────────────────────
      await progress('Building Bug/Feature channels…');
      const { channel: bugCat } = await findOrCreateCategory(guild, '🐛 Bug Reports & Features', publicPerms);

      const { channel: chBugReports, created: bugNew }       = await mkch(guild, { name: '🐛-bug-reports',      parent: bugCat.id, overwrites: publicPerms, topic: 'Report bugs using the pinned template.' });
      const { channel: chFeatureReq, created: featNew }      = await mkch(guild, { name: '💡-feature-requests', parent: bugCat.id, overwrites: publicPerms, topic: 'Suggest new features using the pinned template.' });
      const { channel: chKnownIssues, created: knownNew }    = await mkch(guild, { name: '⚠️-known-issues',     parent: bugCat.id, overwrites: readOnly,    topic: 'Currently known bugs and workarounds.' });
      const { channel: chBugTracking }                       = await mkch(guild, { name: '📊-bug-tracking',     parent: bugCat.id, overwrites: staffOnly,   topic: 'Staff bug triage and tracking. (Staff only)' });

      await postInfo(chBugReports, bugNew, {
        title: '🐛 Bug Report Template', color: 0xE74C3C,
        description: 'Please use this template when reporting a bug. Reports without a template may be ignored.',
        fields: [
          { name: '📋 Template', value: '```\n**Bug title:** (short description)\n**MaowCore version:** (check /version or package.json)\n**OS / Platform:** (Windows 11 / Ubuntu 22.04 / Docker / etc.)\n**Node.js version:** (node --version)\n**Steps to reproduce:**\n1. \n2. \n3. \n**Expected behavior:**\n\n**Actual behavior:**\n\n**Error message / logs:** (paste here or attach file)\n\n**Screenshots:** (if applicable)\n```', inline: false },
          { name: '✅ Good bug reports get', value: '• Fast response from the dev team\n• A 🐛 Bug Hunter role if it\'s a significant find\n• Credit in the changelog', inline: false },
        ],
        footer: 'One bug per post please. Duplicates will be merged.',
      });

      await postInfo(chFeatureReq, featNew, {
        title: '💡 Feature Request Template', color: 0xF1C40F,
        description: 'Have an idea for MaowCore? Use the template below.',
        fields: [
          { name: '📋 Template', value: '```\n**Feature name:** \n**Description:** (what it does)\n**Why it\'s useful:** (problem it solves)\n**Affected area:** (Dashboard / Commands / API / Voice / Other)\n**Mockup or example:** (optional — describe or sketch it)\n**Priority (your opinion):** (nice-to-have / important / critical)\n```', inline: false },
          { name: '💬 After posting', value: 'Staff will react with ✅ (accepted), ❌ (declined), or 🤔 (under discussion). Top upvoted requests get prioritised.', inline: false },
        ],
      });

      await postInfo(chKnownIssues, knownNew, {
        title: '⚠️ Known Issues & Workarounds', color: 0xFFA500,
        description: 'Current confirmed bugs that are tracked and in the queue to be fixed.\n\nCheck here **before** posting in #🐛-bug-reports to avoid duplicates.',
        fields: [
          { name: 'ℹ️ How to check', value: 'Also see [GitHub Issues](https://github.com/lisalepardeany-coder/maowcore/issues) for the full live list.', inline: false },
        ],
      });

      // ── 📚 Documentation ──────────────────────────────────────────────────
      await progress('Building Documentation channels…');
      const { channel: docsCat } = await findOrCreateCategory(guild, '📚 Documentation', readOnly);

      const { channel: chGettingStarted, created: gsNew } = await mkch(guild, { name: '📖-getting-started',  parent: docsCat.id, overwrites: readOnly, topic: 'Quick-start guide for new users.' });
      const { channel: chInstallGuide, created: igNew }   = await mkch(guild, { name: '⚙️-installation',     parent: docsCat.id, overwrites: readOnly, topic: 'Full installation and config guide.' });
      const { channel: chCommandsList, created: clNew }   = await mkch(guild, { name: '📜-commands-list',    parent: docsCat.id, overwrites: readOnly, topic: 'Full list of slash commands.' });
      const { channel: chApiDocs, created: apiNew }       = await mkch(guild, { name: '🔌-api-docs',         parent: docsCat.id, overwrites: readOnly, topic: 'REST API and WebSocket documentation.' });
      const { channel: chEnvVars, created: envNew }       = await mkch(guild, { name: '🔐-env-variables',    parent: docsCat.id, overwrites: readOnly, topic: 'All .env configuration variables explained.' });

      await postInfo(chGettingStarted, gsNew, {
        title: '📖 Getting Started', color: 0x3498DB,
        fields: [
          { name: 'Prerequisites', value: '• Node.js 18+\n• ffmpeg (in PATH)\n• yt-dlp (in PATH or installed via npm)\n• A Discord bot token ([create one here](https://discord.com/developers/applications))', inline: false },
          { name: 'Quick Start', value: '```bash\ngit clone https://github.com/lisalepardeany-coder/maowcore.git\ncd maowcore\nnpm install\ncp .env.example .env\n# Edit .env with your token\nnpm start\n```', inline: false },
          { name: 'Dashboard', value: 'Once running, open `http://127.0.0.1:8765/` in your browser.', inline: false },
          { name: 'Docker', value: '```bash\ndocker compose up -d --build\n```', inline: false },
          { name: 'Next steps', value: 'Run `/setup` in your server to auto-build the channel structure.\nSee #⚙️-installation for advanced config.', inline: false },
        ],
      });

      await postInfo(chInstallGuide, igNew, {
        title: '⚙️ Installation Guide', color: 0x9B59B6,
        fields: [
          { name: 'Systemd service (Linux)', value: '```bash\nbash scripts/install-startup.sh\nloginctl enable-linger $USER\n# View logs:\njournalctl --user -u maowcore -f\n```', inline: false },
          { name: 'Docker Compose', value: '```yaml\n# docker-compose.yml already included\ndocker compose up -d --build\ndocker compose logs -f\n```', inline: false },
          { name: 'Reverse proxy (nginx)', value: 'Point `/` to port `8765` on the host. Enable WebSocket upgrade headers.\nSee the README for a full nginx config snippet.', inline: false },
          { name: 'Required env vars', value: '`DISCORD_TOKEN` · `CLIENT_ID` · `GUILD_ID`\nSee #🔐-env-variables for the full list.', inline: false },
        ],
      });

      await postInfo(chCommandsList, clNew, {
        title: '📜 Slash Commands', color: COLORS.COSMIC,
        fields: [
          { name: '🎵 Music', value: '/play · /skip · /queue · /pause · /resume · /stop · /leave · /volume · /seek · /loop · /shuffle · /nowplaying · /lyrics · /dedicate', inline: false },
          { name: '📚 Library', value: '/library play|list|remove|install · /load · /save · /share · /importpl', inline: false },
          { name: '⚙️ Server', value: '/setup · /config · /prefix · /language · /reactionrole · /setup', inline: false },
          { name: '🎲 Fun / Social', value: '/quiz · /gametour · /tours · /radiosearch · /tts · /sb · /trivia', inline: false },
          { name: '🛡️ Moderation', value: '/warn · /timeout · /ban · /kick · /purge · /lock · /unlock · /mute', inline: false },
          { name: '⚙️ Utility', value: '/help · /ping · /invite · /follow · /backup · /version', inline: false },
        ],
        footer: 'Use /help for descriptions of each command',
      });

      await postInfo(chApiDocs, apiNew, {
        title: '🔌 REST API & WebSocket', color: 0x00CED1,
        fields: [
          { name: 'Base URL', value: '`http://127.0.0.1:8765/api/`', inline: false },
          { name: 'Auth', value: 'Set `CONTROL_TOKEN` in .env → pass `Authorization: Bearer <token>` on every request. Or use `X-Maow-Session` after OAuth login.', inline: false },
          { name: 'Key endpoints', value: '`GET /api/health` · `GET /api/state` · `GET /api/library` · `POST /api/play` · `GET /api/queue` · `GET /api/posts/list` · `GET /api/dev/endpoints`', inline: false },
          { name: 'WebSocket', value: '`ws://127.0.0.1:8765/` — subscribe to real-time state updates, send actions (play, skip, volume, queue_move, etc.)', inline: false },
          { name: 'Full docs', value: 'Hit `GET /api/dev/endpoints` on a running instance for the live auto-generated endpoint catalog.', inline: false },
        ],
      });

      await postInfo(chEnvVars, envNew, {
        title: '🔐 Environment Variables', color: 0xE74C3C,
        fields: [
          { name: 'Required', value: '`DISCORD_TOKEN` — your bot token\n`CLIENT_ID` — application ID\n`GUILD_ID` — your main server ID', inline: false },
          { name: 'Auth & Security', value: '`CONTROL_TOKEN` — dashboard auth token\n`DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — OAuth login\n`OWNER_USER_ID` — first dashboard owner', inline: false },
          { name: 'Library & Media', value: '`LIBRARY_DIR` — path to song library (default: `data/library`)\n`YTDLP_DIR` / `YTDLP_FILENAME` — yt-dlp binary location\n`FFMPEG_PATH` — ffmpeg binary path', inline: false },
          { name: 'GitHub Feed', value: '`GITHUB_OWNER` — repo owner (default: lisalepardeany-coder)\n`GITHUB_REPO` — repo name (default: maowcore)\n`GITHUB_TOKEN` — PAT for higher rate limits (optional)', inline: false },
          { name: 'Integrations', value: '`LASTFM_API_KEY` / `LASTFM_API_SECRET` / `LASTFM_SESSION_KEY`\n`ALERT_WEBHOOK_URL` — Discord webhook for error budget alerts\n`ERROR_BUDGET_5MIN` — max errors per 5min (default: 10)', inline: false },
          { name: 'Other', value: '`PORT` — control server port (default: 8765)\n`BOT_INSTANCE_NAME` — display name in embeds\n`DB_PATH` — SQLite path (default: `data/maow.db`)', inline: false },
        ],
      });

      // ── 🎫 Support ────────────────────────────────────────────────────────
      await progress('Building Support channels…');
      const { channel: supportCat } = await findOrCreateCategory(guild, '🎫 Support', publicPerms);

      const { channel: chSupportGeneral, created: sgNew } = await mkch(guild, { name: '🎫-support-general', parent: supportCat.id, overwrites: publicPerms, topic: 'Get help. Include OS, Node version, and error messages.' });
      const { channel: chTutorials, created: tutNew }     = await mkch(guild, { name: '📹-tutorials',       parent: supportCat.id, overwrites: readOnly,    topic: 'Written guides and tutorial links.' });
      const { channel: chTroubleshooting, created: tsNew } = await mkch(guild, { name: '🔧-troubleshooting', parent: supportCat.id, overwrites: readOnly,   topic: 'Common issues and how to fix them.' });
      const { channel: chClosedTickets }                   = await mkch(guild, { name: '🗃️-closed-tickets',  parent: supportCat.id, overwrites: staffOnly,   topic: 'Archived resolved support threads. (Staff only)' });

      await postInfo(chSupportGeneral, sgNew, {
        title: '🎫 Support', color: 0x57F287,
        description: 'Need help with MaowCore? Post here!\n\n**Please include:**\n• Your **OS** (Windows / Linux / Mac / Docker)\n• Your **Node.js version** (`node --version`)\n• Your **MaowCore version** (check package.json)\n• The **full error message** or log output\n• What you were trying to do\n\nFor bugs → #🐛-bug-reports\nFor features → #💡-feature-requests',
        footer: 'Staff and community members will help when available',
      });

      await postInfo(chTroubleshooting, tsNew, {
        title: '🔧 Common Issues & Fixes', color: 0xFFA500,
        fields: [
          { name: 'Bot goes offline immediately', value: 'Check your `DISCORD_TOKEN` in `.env` — it may be expired. Regenerate at discord.com/developers.', inline: false },
          { name: 'YouTube songs stop immediately (Linux/Docker)', value: 'Ensure you\'re using the system ffmpeg + yt-dlp. Set `FFMPEG_PATH` and `YTDLP_DIR` in `.env`.', inline: false },
          { name: 'Dashboard shows blank page', value: 'Hard refresh (`Ctrl+Shift+R`). If using multi-bot mode, check the Bearer token is correct.', inline: false },
          { name: '/play returns no results', value: 'Check `yt-dlp --update` — an outdated yt-dlp breaks YouTube searches.', inline: false },
          { name: 'better-sqlite3 fails to compile', value: 'Run `npm run install-native`. If that fails, the bot falls back to JSON storage automatically.', inline: false },
          { name: 'Ping shows -1 or 0', value: 'Normal — gateway heartbeat ping is unreliable on discord.js v14. The dashboard shows a real REST ping instead.', inline: false },
        ],
      });

      // ── 🌍 Localization ───────────────────────────────────────────────────
      await progress('Building Localization channels…');
      const { channel: localeCat } = await findOrCreateCategory(guild, '🌍 Localization', publicPerms);

      const { channel: chLocaleGeneral, created: lgNew } = await mkch(guild, { name: '🌍-translation-general', parent: localeCat.id, overwrites: publicPerms, topic: 'Discussion for translators of MaowCore.' });
      const { channel: chLocaleEN }  = await mkch(guild, { name: '🇬🇧-english',  parent: localeCat.id, overwrites: publicPerms, topic: 'English language string review.' });
      const { channel: chLocaleES }  = await mkch(guild, { name: '🇪🇸-español',  parent: localeCat.id, overwrites: publicPerms, topic: 'Spanish translation.' });
      const { channel: chLocaleFR }  = await mkch(guild, { name: '🇫🇷-français', parent: localeCat.id, overwrites: publicPerms, topic: 'French translation.' });
      const { channel: chLocaleDE }  = await mkch(guild, { name: '🇩🇪-deutsch',  parent: localeCat.id, overwrites: publicPerms, topic: 'German translation.' });

      await postInfo(chLocaleGeneral, lgNew, {
        title: '🌍 Localization', color: 0x2ECC71,
        description: 'Help translate MaowCore\'s dashboard into more languages!\n\nCurrently supported: 🇬🇧 EN · 🇪🇸 ES · 🇫🇷 FR · 🇩🇪 DE\n\n**How to contribute a translation:**\n1. Post in #🛠️-dev-general expressing interest\n2. A dev will give you the string file to translate\n3. Submit via a GitHub PR — see #🤝-contributing\n4. Get the 🌍 Translator role!\n\nEach language has its own channel above for reviewing string accuracy.',
      });

      // ── 🤖 Bot Commands ───────────────────────────────────────────────────
      await progress('Building Bot Command channels…');
      const { channel: botCat } = await findOrCreateCategory(guild, '🤖 Bot Commands', publicPerms);

      const { channel: chBotGeneral }  = await mkch(guild, { name: '🤖-bot-commands',   parent: botCat.id, overwrites: publicPerms, topic: 'General bot commands.' });
      const { channel: chBotMusic }    = await mkch(guild, { name: '🎵-music-commands', parent: botCat.id, overwrites: publicPerms, topic: 'MaowCore music commands — /play, /skip, /queue etc.' });
      const { channel: chBotEconomy }  = await mkch(guild, { name: '💰-economy',        parent: botCat.id, overwrites: publicPerms, topic: 'Economy and levelling commands.' });
      const { channel: chBotGames }    = await mkch(guild, { name: '🎮-bot-games',      parent: botCat.id, overwrites: publicPerms, topic: 'Bot mini-games — /quiz, /trivia etc.' });

      // ── ✦ MaowCore Bot ────────────────────────────────────────────────────
      await progress('Building MaowCore channels…');
      const { channel: maowCat } = await findOrCreateCategory(guild, '✦ MaowCore', publicPerms);

      const { channel: chMusic }   = await mkch(guild, { name: '🎵-music',            parent: maowCat.id, overwrites: publicPerms,   topic: '/play · /skip · /queue · /volume · /nowplaying' });
      const { channel: chFeed }    = await mkch(guild, { name: '◆-now-transmitting',  parent: maowCat.id, overwrites: announcePerms, topic: 'Now-playing feed (auto-posted by the bot).' });
      const { channel: chModlog }  = await mkch(guild, { name: '⌬-modlog',            parent: maowCat.id, overwrites: staffOnly,     topic: 'Moderation action log.' });
      const { channel: chBotUpdatesLocal } = await mkch(guild, { name: '🔔-bot-status', parent: maowCat.id, overwrites: announcePerms, topic: 'Bot online/offline status and restart notices.' });

      // ── 🖥️ System Monitor ─────────────────────────────────────────────────
      // These are VOICE channels whose names are rewritten every 5 min by
      // the updateSystemMonitor() function in index.js with live stats.
      // Discord rate limit: 2 name changes per channel per 10 min → 5 min safe.
      await progress('Building System Monitor channels…');
      const { channel: sysCat } = await findOrCreateCategory(guild, '🖥️ System Monitor', statsPerms);

      const sysMonitorChannels = {};
      for (const [key, label] of [
        ['cpu',    '🖥️ CPU: —%'],
        ['ram',    '💾 RAM: — / —'],
        ['heap',   '🔥 Heap: — / —'],
        ['uptime', '⬆️ Up: —'],
        ['ping',   '🏓 Ping: —'],
        ['load',   '🔄 Load: —'],
      ]) {
        const { channel: sc } = await mkch(guild, {
          name: label, type: ChannelType.GuildVoice, parent: sysCat.id, overwrites: statsPerms,
        });
        sysMonitorChannels[key] = sc.id;
      }

      // ── 💻 Tech Talk ───────────────────────────────────────────────────────
      await progress('Building Tech Talk channels…');
      const { channel: techCat } = await findOrCreateCategory(guild, '💻 Tech Talk', publicPerms);

      const { channel: chTechGeneral, created: tgNew }   = await mkch(guild, { name: '💻-tech-general',      parent: techCat.id, overwrites: publicPerms, topic: 'General technology discussion.' });
      const { channel: chAiDiscuss }                     = await mkch(guild, { name: '🤖-ai-discussion',     parent: techCat.id, overwrites: publicPerms, topic: 'AI, ML, and LLM discussion.' });
      const { channel: chTechNews }                      = await mkch(guild, { name: '📰-tech-news',         parent: techCat.id, overwrites: publicPerms, topic: 'Share interesting tech news and articles.' });
      const { channel: chOpenSource }                    = await mkch(guild, { name: '📦-open-source',       parent: techCat.id, overwrites: publicPerms, topic: 'Open source project discoveries and discussion.' });
      const { channel: chSecurityTalk }                  = await mkch(guild, { name: '🛡️-security-talk',    parent: techCat.id, overwrites: publicPerms, topic: 'Cybersecurity news, tips, and discussion.' });
      const { channel: chCodeGolf }                      = await mkch(guild, { name: '⛳-code-golf',         parent: techCat.id, overwrites: publicPerms, topic: 'Fun coding challenges — shortest/cleverest solution wins.' });
      const { channel: chDevShowcase }                   = await mkch(guild, { name: '🚀-dev-showcase',      parent: techCat.id, overwrites: publicPerms, topic: 'Show off personal projects and side projects.' });

      await postInfo(chTechGeneral, tgNew, {
        title: '💻 Tech Talk', color: 0x5865F2,
        description: 'A space to talk about all things tech.\n\n**Channels here:**\n• 🤖-ai-discussion — AI/ML/LLMs\n• 📰-tech-news — share articles and news\n• 📦-open-source — cool OSS projects\n• 🛡️-security-talk — cybersecurity\n• ⛳-code-golf — fun challenges\n• 🚀-dev-showcase — show your projects\n\nKeep it constructive and on-topic!',
      });

      // ── 🎓 Learning Hub ────────────────────────────────────────────────────
      await progress('Building Learning Hub channels…');
      const { channel: learnCat } = await findOrCreateCategory(guild, '🎓 Learning Hub', publicPerms);

      const { channel: chResources, created: resNew }    = await mkch(guild, { name: '📚-resources',         parent: learnCat.id, overwrites: publicPerms, topic: 'Useful links, docs, and learning resources.' });
      const { channel: chTipsAndTricks }                 = await mkch(guild, { name: '💡-tips-and-tricks',   parent: learnCat.id, overwrites: publicPerms, topic: 'Quick dev tips and tricks. Drop one and move on.' });
      const { channel: chCodingChallenges }              = await mkch(guild, { name: '🎯-coding-challenges', parent: learnCat.id, overwrites: publicPerms, topic: 'Weekly coding challenges. Solutions welcome after 48h.' });
      const { channel: chBookClub }                      = await mkch(guild, { name: '📖-book-club',         parent: learnCat.id, overwrites: publicPerms, topic: 'Tech book and article recommendations.' });
      const { channel: chUsefulLinks, created: ulNew }   = await mkch(guild, { name: '🔗-useful-links',      parent: learnCat.id, overwrites: readOnly,    topic: 'Curated list of useful developer links.' });
      const { channel: chVideoResources }                = await mkch(guild, { name: '📹-video-resources',   parent: learnCat.id, overwrites: publicPerms, topic: 'YouTube videos, courses, and tutorials worth watching.' });

      await postInfo(chResources, resNew, {
        title: '📚 Resources', color: 0x3498DB,
        fields: [
          { name: '📖 Documentation', value: '• [MaowCore README](https://github.com/lisalepardeany-coder/maowcore#readme)\n• [discord.js Guide](https://discordjs.guide/)\n• [Node.js Docs](https://nodejs.org/docs/)\n• [SQLite Docs](https://www.sqlite.org/docs.html)', inline: false },
          { name: '🎵 Music Bot Related', value: '• [DisTube Docs](https://distube.js.org/)\n• [yt-dlp Docs](https://github.com/yt-dlp/yt-dlp#readme)\n• [FFmpeg Docs](https://ffmpeg.org/documentation.html)', inline: false },
          { name: '🛠️ Dev Tools', value: '• [VS Code](https://code.visualstudio.com/) — recommended editor\n• [Postman](https://www.postman.com/) — API testing\n• [TablePlus](https://tableplus.com/) — SQLite browser\n• [GitHub Desktop](https://desktop.github.com/) — Git UI', inline: false },
        ],
      });

      await postInfo(chUsefulLinks, ulNew, {
        title: '🔗 Useful Links', color: 0x00CED1,
        fields: [
          { name: '🤖 MaowCore', value: '[GitHub](https://github.com/lisalepardeany-coder/maowcore) · [CHANGELOG](https://github.com/lisalepardeany-coder/maowcore/blob/main/CHANGELOG.md) · [Issues](https://github.com/lisalepardeany-coder/maowcore/issues) · [Releases](https://github.com/lisalepardeany-coder/maowcore/releases)', inline: false },
          { name: '📚 Discord Dev', value: '[Discord Developer Portal](https://discord.com/developers/) · [discord.js](https://discord.js.org/) · [Discord API](https://discord.com/developers/docs/)', inline: false },
          { name: '🎵 Audio Deps', value: '[DisTube](https://distube.js.org/) · [yt-dlp](https://github.com/yt-dlp/yt-dlp) · [FFmpeg](https://ffmpeg.org/)', inline: false },
        ],
      });

      // ── 🎪 Events & Competitions ───────────────────────────────────────────
      await progress('Building Events channels…');
      const { channel: eventsCat } = await findOrCreateCategory(guild, '🎪 Events & Competitions', publicPerms);

      const { channel: chEventCalendar, created: ecNew } = await mkch(guild, { name: '🗓️-event-calendar',      parent: eventsCat.id, overwrites: readOnly,    topic: 'Upcoming event schedule.' });
      const { channel: chGameNightPlan }                 = await mkch(guild, { name: '🎮-game-night',           parent: eventsCat.id, overwrites: publicPerms, topic: 'Game night planning and coordination.' });
      const { channel: chTournamentBrackets }            = await mkch(guild, { name: '🏆-tournament-brackets',  parent: eventsCat.id, overwrites: announcePerms, topic: 'Tournament brackets and results.' });
      const { channel: chEventPhotos }                   = await mkch(guild, { name: '📸-event-photos',         parent: eventsCat.id, overwrites: publicPerms, topic: 'Screenshots and photos from events.' });
      const { channel: chEventArchive }                  = await mkch(guild, { name: '🗃️-event-archive',        parent: eventsCat.id, overwrites: readOnly,    topic: 'Archived past events.' });
      const { channel: chHackathon }                     = await mkch(guild, { name: '⌨️-hackathon',            parent: eventsCat.id, overwrites: publicPerms, topic: 'Hackathon planning, teams, and submissions.' });

      await postInfo(chEventCalendar, ecNew, {
        title: '🗓️ Event Calendar', color: 0xFFD700,
        description: 'Upcoming server events. All times are posted in UTC unless stated otherwise.\n\n**Regular events:**\n• 🎮 Game Night — every Friday\n• 🎵 Music Listening Party — bi-weekly Saturday\n• ⌨️ Hackathon — monthly\n• 🎤 Karaoke Night — when the mood strikes\n\nEnable notifications for this channel to never miss an event.',
        footer: 'React with 🔔 to get notified for events',
      });

      // ── 📱 Social Links ────────────────────────────────────────────────────
      await progress('Building Social Links channels…');
      const { channel: socialCat } = await findOrCreateCategory(guild, '📱 Social Links', readOnly);

      const { channel: chSocialHub, created: shNew }   = await mkch(guild, { name: '🌐-social-hub',   parent: socialCat.id, overwrites: readOnly, topic: 'All our social media links in one place.' });
      const { channel: chTwitter }                     = await mkch(guild, { name: '🐦-twitter-x',    parent: socialCat.id, overwrites: readOnly, topic: 'Follow us on Twitter/X.' });
      const { channel: chYoutube }                     = await mkch(guild, { name: '📺-youtube',      parent: socialCat.id, overwrites: readOnly, topic: 'YouTube channel and video updates.' });
      const { channel: chTwitch }                      = await mkch(guild, { name: '🟣-twitch',       parent: socialCat.id, overwrites: readOnly, topic: 'Twitch streaming schedule and links.' });

      await postInfo(chSocialHub, shNew, {
        title: '🌐 Social Links', color: 0xFF4500,
        fields: [
          { name: '🤖 MaowCore GitHub',  value: 'https://github.com/lisalepardeany-coder/maowcore', inline: false },
          { name: '💬 Discord',          value: 'You\'re already here! Share the invite with friends.', inline: false },
          { name: '🐦 Twitter / X',      value: 'Coming soon', inline: false },
          { name: '📺 YouTube',          value: 'Coming soon', inline: false },
          { name: '🟣 Twitch',           value: 'Coming soon', inline: false },
        ],
        footer: 'Links updated by staff',
      });

      // ── 🎨 Creative (extra channels) ──────────────────────────────────────
      await progress('Expanding Creative channels…');
      // These go under the already-created creativeCat
      const { channel: chVideoEditing }   = await mkch(guild, { name: '🎬-video-editing',   parent: creativeCat.id, overwrites: publicPerms, topic: 'Video editing work, tips, and sharing.' });
      const { channel: chMusicProduction } = await mkch(guild, { name: '🎛️-music-production', parent: creativeCat.id, overwrites: publicPerms, topic: 'Beats, DAW work, production tips.' });
      const { channel: ch3dModeling }     = await mkch(guild, { name: '🖥️-3d-and-design',   parent: creativeCat.id, overwrites: publicPerms, topic: 'Blender, 3D models, UI/UX design.' });

      // ── 🎵 Music Lounge (extra channels) ──────────────────────────────────
      await progress('Expanding Music Lounge channels…');
      const { channel: chRadioStations }  = await mkch(guild, { name: '📻-radio-stations',  parent: musicLoungeCat.id, overwrites: publicPerms, topic: 'Share radio stream URLs compatible with /play.' });
      const { channel: chInstruments }    = await mkch(guild, { name: '🎸-instruments',     parent: musicLoungeCat.id, overwrites: publicPerms, topic: 'Talk about instruments, gear, and playing.' });
      const { channel: chConcerts }       = await mkch(guild, { name: '🎭-concert-talk',    parent: musicLoungeCat.id, overwrites: publicPerms, topic: 'Concert experiences, upcoming shows, reviews.' });

      // ── 🌍 Localization (extra language channels) ──────────────────────────
      await progress('Expanding Localization channels…');
      const { channel: chLocaleJA }  = await mkch(guild, { name: '🇯🇵-japanese',   parent: localeCat.id, overwrites: publicPerms, topic: 'Japanese translation.' });
      const { channel: chLocalePT }  = await mkch(guild, { name: '🇵🇹-português',  parent: localeCat.id, overwrites: publicPerms, topic: 'Portuguese translation.' });
      const { channel: chLocaleRU }  = await mkch(guild, { name: '🇷🇺-русский',    parent: localeCat.id, overwrites: publicPerms, topic: 'Russian translation.' });

      // ── 🛠️ Development (extra channels) ──────────────────────────────────
      await progress('Expanding Development channels…');
      const { channel: chSecurityAdvisories } = await mkch(guild, { name: '🔐-security-advisories', parent: devCat.id, overwrites: devOnly, topic: 'Security vulnerability reports and advisories. (Dev only)' });
      const { channel: chPerformance }         = await mkch(guild, { name: '📊-performance',        parent: devCat.id, overwrites: publicPerms, topic: 'Performance benchmarks, profiling, and optimisation.' });
      const { channel: chArchitecture }        = await mkch(guild, { name: '🏗️-architecture',       parent: devCat.id, overwrites: publicPerms, topic: 'Architecture decisions, system design discussion.' });

      // ── 🏆 Hall of Fame ───────────────────────────────────────────────────
      await progress('Building Hall of Fame channels…');
      const { channel: hofCat } = await findOrCreateCategory(guild, '🏆 Hall of Fame', readOnly);

      const { channel: chMilestones, created: msNew } = await mkch(guild, { name: '🎯-milestones',     parent: hofCat.id, overwrites: announcePerms, topic: 'Project milestone announcements.' });
      const { channel: chContributors, created: ctrNew } = await mkch(guild, { name: '🤝-contributors', parent: hofCat.id, overwrites: readOnly,      topic: 'Everyone who has contributed to MaowCore.' });
      const { channel: chBugHunters, created: bhNew } = await mkch(guild, { name: '🐛-bug-hunters',    parent: hofCat.id, overwrites: readOnly,      topic: 'Members who found significant bugs.' });

      await postInfo(chMilestones, msNew, {
        title: '🎯 Project Milestones', color: 0xFFD700,
        fields: [
          { name: '✅ v1.0.0', value: 'Initial release — music bot with dashboard', inline: true },
          { name: '✅ v2.0.0', value: 'Multi-bot platform', inline: true },
          { name: '✅ v3.0.0', value: 'Full self-hosted production release', inline: true },
          { name: '✅ v3.1.0', value: 'SQLite migration', inline: true },
          { name: '✅ v3.2.0', value: 'Login & RBAC', inline: true },
          { name: '🔨 Next', value: 'Lyrics · Vote-skip · Scheduled play', inline: true },
        ],
      });

      await postInfo(chContributors, ctrNew, {
        title: '🤝 Contributors', color: 0x2ECC71,
        description: 'Thank you to everyone who has contributed code, documentation, translations, bug reports, and feedback to MaowCore.\n\nFull contributor list: https://github.com/lisalepardeany-coder/maowcore/graphs/contributors',
      });

      await postInfo(chBugHunters, bhNew, {
        title: '🐛 Bug Hunters Hall of Fame', color: 0xE74C3C,
        description: 'Members who found and reported significant bugs that were confirmed and fixed.\n\nFind a bug? Report it in #🐛-bug-reports — significant fixes earn you the 🐛 Bug Hunter role and a spot here.',
      });

      // ── 🛡️ Staff ──────────────────────────────────────────────────────────
      await progress('Building Staff channels…');
      const { channel: staffCat } = await findOrCreateCategory(guild, '🛡️ Staff', staffOnly);

      const { channel: chStaffGeneral }  = await mkch(guild, { name: '💼-staff-general',      parent: staffCat.id, overwrites: staffOnly,  topic: 'General staff discussion.' });
      const { channel: chStaffAnnounce } = await mkch(guild, { name: '📣-staff-announcements', parent: staffCat.id, overwrites: staffOnly,  topic: 'Staff-only announcements.' });
      const { channel: chModActions }    = await mkch(guild, { name: '⚖️-mod-actions',         parent: staffCat.id, overwrites: staffOnly,  topic: 'Log all mod actions here before executing.' });
      const { channel: chReports }       = await mkch(guild, { name: '🚨-reports',             parent: staffCat.id, overwrites: staffOnly,  topic: 'User reports submitted via /report or DM.' });
      const { channel: chAppeals }       = await mkch(guild, { name: '📬-appeals',             parent: staffCat.id, overwrites: staffOnly,  topic: 'Ban/mute appeal tracking.' });
      const { channel: chStaffApps }     = await mkch(guild, { name: '📝-staff-applications',  parent: staffCat.id, overwrites: staffOnly,  topic: 'Staff application submissions.' });
      const { channel: chTicketLogs }    = await mkch(guild, { name: '🎫-ticket-logs',         parent: staffCat.id, overwrites: staffOnly,  topic: 'Resolved support tickets.' });
      const { channel: chStaffLogs }     = await mkch(guild, { name: '📋-staff-logs',          parent: staffCat.id, overwrites: staffOnly,  topic: 'Automated bot mod-log and audit entries.' });
      const { channel: chPartnerReqs }   = await mkch(guild, { name: '🤝-partner-requests',    parent: staffCat.id, overwrites: staffOnly,  topic: 'Incoming partnership requests.' });
      const { channel: chAdminLounge }   = await mkch(guild, { name: '👑-admin-lounge',        parent: staffCat.id, overwrites: adminOnly,  topic: 'Admin+ only discussion.' });
      const { channel: chAdminLogs }     = await mkch(guild, { name: '🔐-admin-logs',          parent: staffCat.id, overwrites: adminOnly,  topic: 'Sensitive admin action log.' });

      // ── 🛡️ Staff extra channels (expansion — staffCat now in scope) ────────
      await progress('Expanding Staff channels…');
      const { channel: chEmergency }   = await mkch(guild, { name: '⚡-emergency',         parent: staffCat.id, overwrites: adminOnly, topic: 'Urgent issues requiring immediate admin attention.' });
      const { channel: chBotRestarts } = await mkch(guild, { name: '🔄-bot-restarts',     parent: staffCat.id, overwrites: staffOnly, topic: 'Bot restart and crash log.' });
      const { channel: chAnalytics }   = await mkch(guild, { name: '📊-server-analytics', parent: staffCat.id, overwrites: staffOnly, topic: 'Server growth stats and analytics.' });

      // ── 🎙️ Voice ──────────────────────────────────────────────────────────
      await progress('Building Voice channels…');
      const { channel: voiceCat } = await findOrCreateCategory(guild, '🎙️ Voice');

      await mkch(guild, { name: '🔊 General 1',      type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🔊 General 2',      type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🔊 General 3',      type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🎵 Music Room',     type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '☕ Chill Zone',     type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🎮 Gaming Room 1',  type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🎮 Gaming Room 2',  type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🎮 Gaming Room 3',  type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '📚 Study / Work',   type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🎤 Karaoke',        type: ChannelType.GuildVoice, parent: voiceCat.id });
      const { channel: chVoiceCreate } = await mkch(guild, { name: '➕ Create Room', type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '💎 VIP Lounge',     type: ChannelType.GuildVoice, parent: voiceCat.id, overwrites: vipVoice });
      await mkch(guild, { name: '🛠️ Dev Voice',      type: ChannelType.GuildVoice, parent: voiceCat.id, overwrites: devVoice });
      await mkch(guild, { name: '🛡️ Staff Voice',    type: ChannelType.GuildVoice, parent: voiceCat.id, overwrites: staffVoice });
      await mkch(guild, { name: '💤 AFK',            type: ChannelType.GuildVoice, parent: voiceCat.id });

      // ── 🎙️ Voice extra rooms (expansion — voiceCat now in scope) ──────────
      await progress('Expanding Voice channels…');
      await mkch(guild, { name: '🔊 General 4',      type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🎮 Gaming Room 4',  type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🎧 Podcast Room',   type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🎵 Lofi & Chill',   type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🤝 Collab Room',    type: ChannelType.GuildVoice, parent: voiceCat.id });
      await mkch(guild, { name: '🎤 Stage (silent)', type: ChannelType.GuildVoice, parent: voiceCat.id,
        overwrites: [
          { id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect], deny: [PermissionFlagsBits.Speak] },
          ...staffRoles.map((r) => ({ id: r, allow: [PermissionFlagsBits.Speak, PermissionFlagsBits.MuteMembers] })),
        ],
      });

      // ── 📊 Server Stats ───────────────────────────────────────────────────
      await progress('Building Stats channels…');
      const { channel: statsCat } = await findOrCreateCategory(guild, '📊 Server Stats', statsPerms);
      const statsIds = {};
      for (const [key, label] of [
        ['members',  '👥 Members:'],
        ['bots',     '🤖 Bots:'],
        ['channels', '📁 Channels:'],
        ['roles',    '🎭 Roles:'],
        ['boosts',   '🚀 Boosts:'],
      ]) {
        const { channel: sc } = await mkch(guild, {
          name: `${label} —`, type: ChannelType.GuildVoice, parent: statsCat.id, overwrites: statsPerms,
        });
        statsIds[key] = sc.id;
      }

      // ══════════════════════════════════════════════════════════════════════
      // 4. SAVE CONFIG
      // ══════════════════════════════════════════════════════════════════════
      await progress('Saving configuration…');
      updateGuild(guild.id, {
        setupComplete: true,
        // Channels
        verifyChannelId:            chVerify.id,
        welcomeChannelId:           chWelcome.id,
        modlogChannelId:            chModlog.id,
        suggestionsChannelId:       chSuggestions.id,
        musicChannelId:             chMusic.id,
        announcementsChannelId:     chAnnounce.id,
        updatesChannelId:           chUpdates.id,
        serverNewsChannelId:        chServerNews.id,
        staffLogsChannelId:         chStaffLogs.id,
        reportsChannelId:           chReports.id,
        appealsChannelId:           chAppeals.id,
        bugReportsChannelId:        chBugReports.id,
        featureRequestsChannelId:   chFeatureReq.id,
        autoVoiceRoomId:            chVoiceCreate.id,
        statsChannels:              statsIds,
        // System monitor (used by updateSystemMonitor() in index.js)
        sysMonitorChannels:         sysMonitorChannels,
        // GitHub feed channels (used by lib/github-feed.js)
        githubCommitsChannelId:     chGithubCommits.id,
        githubReleasesChannelId:    chGithubReleases.id,
        githubIssuesChannelId:      chGithubIssues.id,
        githubPRsChannelId:         chGithubPRs.id,
        githubActionsChannelId:     chGithubActions.id,
        // Roles
        headAdminRoleId:   headAdmin.id,
        adminRoleId:       admin.id,
        headModRoleId:     headMod.id,
        modRoleId:         mod.id,
        trialModRoleId:    trialMod.id,
        leadDevRoleId:     leadDev.id,
        botDevRoleId:      botDev.id,
        betaTesterRoleId:  betaTester.id,
        djRoleId:          R['🎵 DJ'].id,
        vipRoleId:         vip.id,
        memberRoleId:      R['👤 Member'].id,
        mutedRoleId:       muted.id,
        blacklistedRoleId: blacklisted.id,
      });

      // ══════════════════════════════════════════════════════════════════════
      // 5. SUMMARY EMBEDS (posted in #🔨-commits so staff can see on first run)
      // ══════════════════════════════════════════════════════════════════════
      const summary1 = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setTitle('◆  MaowCore Community Server — Setup Complete')
        .setDescription('The full server structure has been built. Here\'s a summary:')
        .addFields(
          { name: '📋 Info (7)',           value: '#📜-rules · #📣-announcements · #🔔-updates · #❓-faq · #🎭-roles-info · #🤝-partners · #🌐-socials' },
          { name: '👋 Welcome (5)',         value: '#✧-welcome · #👋-introductions · #🎨-role-selection · #🎂-birthdays · #👋-goodbyes' },
          { name: '📢 Announcements (4)',   value: '#📰-server-news · #🎪-events · #🎉-giveaways · #🤝-partner-news' },
          { name: '💬 General (8)',         value: '#💬-general · #🎲-off-topic · #😂-memes · #🖼️-media · #📊-polls · #🔢-counting · #⭐-starboard · #💡-suggestions' },
          { name: '🎮 Gaming (5)',          value: '#🎮-gaming-general · #🔍-looking-for-group · #🎬-game-clips · #🏆-achievements · #📝-game-reviews' },
          { name: '🎨 Creative (4)',        value: '#🎨-art · #📷-photography · #✍️-writing · #✨-showcase' },
          { name: '🎵 Music Lounge (5)',    value: '#🎵-music-chat · #🎤-song-requests · #📋-playlist-sharing · #💿-recommendations · #▶️-now-playing-chat' },
          { name: '💎 VIP (4)',             value: '#💎-vip-lounge · #🖼️-vip-media · #🎪-vip-events · #📬-vip-feedback' },
        )
        .setFooter({ text: 'Page 1/3' });

      const summary2 = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setTitle('◆  Setup — continued')
        .addFields(
          { name: '🛠️ Development (7)',     value: '#🛠️-dev-general · #🆘-dev-help · #🔍-code-review · #🗺️-roadmap · #📋-changelogs · #🧪-beta-channel · #🤝-contributing' },
          { name: '📦 GitHub (5)',          value: '#🔨-commits · #🚀-releases · #🐛-github-issues · #🔀-pull-requests · #⚙️-ci-actions' },
          { name: '🐛 Bug & Features (4)',  value: '#🐛-bug-reports · #💡-feature-requests · #⚠️-known-issues · #📊-bug-tracking *(staff)*' },
          { name: '📚 Documentation (5)',   value: '#📖-getting-started · #⚙️-installation · #📜-commands-list · #🔌-api-docs · #🔐-env-variables' },
          { name: '🎫 Support (4)',         value: '#🎫-support-general · #📹-tutorials · #🔧-troubleshooting · #🗃️-closed-tickets *(staff)*' },
          { name: '🌍 Localization (5)',    value: '#🌍-translation-general · #🇬🇧-english · #🇪🇸-español · #🇫🇷-français · #🇩🇪-deutsch' },
          { name: '🤖 Bot Commands (4)',    value: '#🤖-bot-commands · #🎵-music-commands · #💰-economy · #🎮-bot-games' },
          { name: '✦ MaowCore (4)',         value: '#🎵-music · #◆-now-transmitting · #⌬-modlog *(staff)* · #🔔-bot-status' },
          { name: '🏆 Hall of Fame (3)',    value: '#🎯-milestones · #🤝-contributors · #🐛-bug-hunters' },
        )
        .setFooter({ text: 'Page 2/3' });

      const summary3 = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setTitle('◆  Setup — roles, voice & permissions')
        .addFields(
          { name: '🛡️ Staff (11)',          value: '#💼-staff-general · #📣-staff-announcements · #⚖️-mod-actions · #🚨-reports · #📬-appeals · #📝-staff-applications · #🎫-ticket-logs · #📋-staff-logs · #🤝-partner-requests · #👑-admin-lounge *(admin+)* · #🔐-admin-logs *(admin+)*' },
          { name: '🎙️ Voice (15)',          value: 'General 1/2/3 · Music Room · Chill Zone · Gaming 1/2/3 · Study/Work · Karaoke · ➕ Create Room · 💎 VIP Lounge · 🛠️ Dev Voice · 🛡️ Staff Voice · 💤 AFK' },
          { name: '📊 Server Stats (5)',    value: '👥 Members · 🤖 Bots · 📁 Channels · 🎭 Roles · 🚀 Boosts *(connect-locked)*' },
          { name: '🎭 Roles (26)',          value: [
            '**Staff:** ⭐ Head Admin · 🔴 Admin · 🟠 Head Mod · 🟡 Moderator · 🟢 Trial Mod · 🎓 Alumni',
            '**Dev:** 👑 Lead Dev · 🤖 Bot Dev · 🔧 Contributor · 🧪 Beta Tester · 🐛 Bug Hunter · 📝 Docs Writer · 🎨 Designer · 🌍 Translator',
            '**Community:** 🎵 DJ · 💎 VIP · 🌟 Booster · 🤝 Partner · 📢 Content Creator · 👤 Member',
            '**Self-assign:** 🔔 Update Pings · 🧪 Beta Pings · 🎮 Gamer · 🎵 Music Lover',
            '**Moderation:** 🔇 Muted · 🚫 Blacklisted',
          ].join('\n') },
          { name: '🔔 GitHub Feed', value: 'Commits auto-post to #🔨-commits every 5 min\nReleases → #🚀-releases every 10 min\nIssues → #🐛-github-issues every 15 min\nPRs → #🔀-pull-requests every 15 min\n\nSet `GITHUB_TOKEN` in `.env` for higher rate limits.' },
          { name: '🔐 Permission highlights', value: '• 📋 Info is read-only for all members\n• Staff category + modlog invisible to non-staff\n• Beta channel restricted to 🧪 Beta Tester + dev roles\n• 💎 VIP channels require VIP role\n• 🛠️ Dev Voice locked to dev team\n• 🔇 Muted blocks send/react/speak everywhere\n• 🚫 Blacklisted hides ALL non-staff channels' },
        )
        .setFooter({ text: 'Page 3/3 — Open the dashboard at http://127.0.0.1:8765/' });

      chMusic.send({ embeds: [summary1, summary2, summary3] }).catch(() => {});

      return interaction.editReply(
        '✦  **Full server built!**\n' +
        '• **28 categories** · **130+ channels** · **26 roles**\n' +
        '• Pinned info embeds in every channel\n' +
        '• GitHub feed wired (commits · releases · issues · PRs)\n' +
        '• **System monitor** — CPU · RAM · Heap · Uptime · Ping · Load updating every **5 min**\n\n' +
        'Check #🎵-music for the full channel map.',
      );

    } catch (e) {
      console.error('[setup]', e);
      return interaction.editReply(`▲  Setup failed: ${e.message}`);
    }
  },
};
