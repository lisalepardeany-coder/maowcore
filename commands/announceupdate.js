'use strict';
// commands/announceupdate.js
// Broadcast a MaowCore bot update to servers. Pulls the latest CHANGELOG
// section (or custom notes), builds an embed, and posts it to each guild's
// #🔔-bot-updates / announcements channel — pinging the opt-in 🔔 Bot Updates
// role. Cross-server broadcast is owner-only.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

const pkg = require('../package.json');
const REPO = `${process.env.GITHUB_OWNER || 'lisalepardeany-coder'}/${process.env.GITHUB_REPO || 'maowcore'}`;
const CHANGELOG_URL = `https://github.com/${REPO}/blob/main/CHANGELOG.md`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;

// Parse the newest real (non-empty) section from CHANGELOG.md.
function latestChangelog() {
  try {
    const md = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
    const parts = md.split(/\n(?=## \[)/);
    for (const part of parts) {
      const headMatch = part.match(/^## \[([^\]]+)\]([^\n]*)/);
      if (!headMatch) continue;
      const version = headMatch[1].trim();
      const body = part.slice(part.indexOf('\n') + 1).trim();
      if (/unreleased/i.test(version)) {
        if (body) return { version, body };  // unreleased has content → use it
        continue;                            // empty unreleased → skip to last release
      }
      return { version, body };
    }
  } catch { /* no changelog */ }
  return null;
}

// First text channel the bot can actually post in (last-resort target).
function firstSendable(guild) {
  const me = guild.members.me;
  if (!me) return null;
  if (guild.systemChannel?.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) return guild.systemChannel;
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.viewable &&
      c.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages),
  ) || null;
}

// Resolve the best update-target channel for a guild.
function targetChannel(guild) {
  const cfg = getGuild(guild.id);
  for (const id of [cfg.updatesChannelId, cfg.announcementsChannelId, cfg.serverNewsChannelId]) {
    const ch = id && guild.channels.cache.get(id);
    if (ch && ch.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)) return ch;
  }
  return firstSendable(guild);
}

function buildEmbed(version, body) {
  let desc = body || 'A new version of MaowCore is live.';
  // Discord description cap is 4096; leave room for the links line.
  const linksLine = `\n\n📖 [Full changelog](${CHANGELOG_URL}) · 🚀 [Releases](${RELEASES_URL})`;
  if (desc.length > 3800) desc = desc.slice(0, 3800).trimEnd() + '…';
  return new EmbedBuilder()
    .setColor(COLORS.COSMIC)
    .setAuthor({ name: 'MaowCore Update' })
    .setTitle(`🔔 MaowCore — v${version}`)
    .setURL(RELEASES_URL)
    .setDescription(desc + linksLine)
    .setFooter({ text: `MaowCore v${pkg.version} · ${REPO}` })
    .setTimestamp();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announceupdate')
    .setDescription('Announce a MaowCore bot update (latest changelog or custom notes)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName('scope').setDescription('Where to post')
      .addChoices(
        { name: 'This server only', value: 'here' },
        { name: 'All servers (owner only)', value: 'all' },
      ))
    .addStringOption((o) => o.setName('version').setDescription('Version label (default: current bot version)'))
    .addStringOption((o) => o.setName('notes').setDescription('Custom update notes (default: latest CHANGELOG section)'))
    .addBooleanOption((o) => o.setName('ping').setDescription('Ping the 🔔 Bot Updates role (default: yes)'))
    .addChannelOption((o) => o.setName('channel').setDescription('Override target channel (this server only)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const scope = interaction.options.getString('scope') || 'here';
    const doPing = interaction.options.getBoolean('ping') ?? true;
    const overrideCh = interaction.options.getChannel('channel');

    // Resolve version + notes.
    const cl = latestChangelog();
    const version = interaction.options.getString('version') || cl?.version || pkg.version;
    const notes = interaction.options.getString('notes') || cl?.body || null;
    const embed = buildEmbed(version, notes);

    const postTo = async (channel, guild) => {
      if (!channel) return false;
      const cfg = getGuild(guild.id);
      const roleId = cfg.updatePingRoleId;
      const wantPing = doPing && roleId && guild.roles.cache.has(roleId);
      try {
        await channel.send({
          content: wantPing ? `<@&${roleId}>` : undefined,
          embeds: [embed],
          allowedMentions: wantPing ? { roles: [roleId] } : { parse: [] },
        });
        updateGuild(guild.id, { lastUpdateAnnounced: version });
        return true;
      } catch (e) {
        console.warn(`[announceupdate] ${guild.name}:`, e.message);
        return false;
      }
    };

    // ── This server ──────────────────────────────────────────────────────────
    if (scope === 'here') {
      const channel = overrideCh || targetChannel(interaction.guild);
      const ok = await postTo(channel, interaction.guild);
      return interaction.editReply(ok
        ? `✅  Posted the **v${version}** update to ${channel}.`
        : `▲  Couldn't find a channel I can post in. Run \`/setup\` first or pass a \`channel\`.`);
    }

    // ── All servers (owner only) ─────────────────────────────────────────────
    const ownerId = process.env.OWNER_USER_ID;
    if (!ownerId) return interaction.editReply('▲  Cross-server broadcast needs `OWNER_USER_ID` set in `.env`.');
    if (interaction.user.id !== ownerId) return interaction.editReply('▲  Only the bot owner can broadcast to all servers.');

    const guilds = [...interaction.client.guilds.cache.values()];
    let posted = 0, failed = 0;
    for (const guild of guilds) {
      const ok = await postTo(targetChannel(guild), guild);
      ok ? posted++ : failed++;
      await sleep(350); // be gentle across many guilds
    }
    return interaction.editReply(
      `📡  Broadcast **v${version}** complete.\n` +
      `• Posted to **${posted}** server${posted === 1 ? '' : 's'}` +
      (failed ? ` · **${failed}** had no postable channel` : '') +
      `\n• Pinged **🔔 Bot Updates** where the role exists.`,
    );
  },
};
