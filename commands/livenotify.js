'use strict';
// commands/livenotify.js
// Configure Twitch go-live + YouTube new-video notifications for this server.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const ln = require('../lib/live-notify');

// Best-effort auto-detect of the "Live Notifs" ping role created by /setup.
function findLiveRole(guild) {
  return guild.roles.cache.find((r) => /live\s*notif/i.test(r.name)) || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('livenotify')
    .setDescription('Twitch go-live & YouTube new-video notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('twitch').setDescription('Watch a Twitch channel for going live')
      .addStringOption((o) => o.setName('channel').setDescription('Twitch URL or username').setRequired(true)))
    .addSubcommand((s) => s.setName('youtube').setDescription('Watch a YouTube channel for new videos')
      .addStringOption((o) => o.setName('channel').setDescription('YouTube URL, @handle, or channel ID').setRequired(true)))
    .addSubcommand((s) => s.setName('channel').setDescription('Where to post notifications')
      .addChannelOption((o) => o.setName('channel').setDescription('Target channel').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s.setName('role').setDescription('Role to ping on notifications')
      .addRoleOption((o) => o.setName('role').setDescription('Ping role (e.g. 🔴 Live Notifs)').setRequired(true)))
    .addSubcommand((s) => s.setName('status').setDescription('Show the current notification settings'))
    .addSubcommand((s) => s.setName('test').setDescription('Post a sample notification')
      .addStringOption((o) => o.setName('platform').setDescription('Which to test').setRequired(true)
        .addChoices({ name: 'Twitch', value: 'twitch' }, { name: 'YouTube', value: 'youtube' })))
    .addSubcommand((s) => s.setName('off').setDescription('Stop watching')
      .addStringOption((o) => o.setName('platform').setDescription('Which to disable').setRequired(true)
        .addChoices({ name: 'Twitch', value: 'twitch' }, { name: 'YouTube', value: 'youtube' }, { name: 'Both', value: 'both' }))),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const cfg = getGuild(guild.id);

    // Auto-link the ping role + a target channel the first time they configure.
    const ensureExtras = () => {
      const patch = {};
      if (!cfg.liveNotifyRoleId) { const r = findLiveRole(guild); if (r) patch.liveNotifyRoleId = r.id; }
      if (!cfg.notifyChannelId && !cfg.liveChannelId) patch.notifyChannelId = interaction.channelId;
      if (Object.keys(patch).length) updateGuild(guild.id, patch);
      return patch;
    };

    // ── twitch ───────────────────────────────────────────────────────────────
    if (sub === 'twitch') {
      const login = ln.resolveTwitch(interaction.options.getString('channel'));
      if (!login || login.length < 2) return interaction.editReply('▲  Could not read that Twitch channel. Try `twitch.tv/yourname` or just `yourname`.');
      updateGuild(guild.id, { twitchLogin: login, twitchWasLive: false });
      const extra = ensureExtras();
      const credsOk = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
      return interaction.editReply(
        `✅  Now watching **twitch.tv/${login}** — I'll post when they go live.` +
        (credsOk ? '' : '\n⚠️ Twitch isn\'t fully enabled yet: add `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` to `.env` (free app at dev.twitch.tv) and restart.') +
        (extra.liveNotifyRoleId ? `\n• Pinging <@&${extra.liveNotifyRoleId}>` : '') +
        (extra.notifyChannelId ? `\n• Posting in <#${extra.notifyChannelId}> (change with \`/livenotify channel\`)` : ''),
      );
    }

    // ── youtube ────────────────────────────────────────────────────────────────
    if (sub === 'youtube') {
      const input = interaction.options.getString('channel');
      const resolved = await ln.resolveYouTube(input);
      if (!resolved?.channelId) return interaction.editReply('▲  Could not resolve that YouTube channel. Try the full channel URL, an `@handle`, or a `UC…` channel ID.');
      updateGuild(guild.id, { youtubeChannelId: resolved.channelId, youtubeChannelName: resolved.name || null, lastYoutubeVideoId: null });
      const extra = ensureExtras();
      // seed lastYoutubeVideoId so we don't dump the back-catalogue on first poll
      try { const e = await ln.youtubeEntries(resolved.channelId); if (e[0]) updateGuild(guild.id, { lastYoutubeVideoId: e[0].id, youtubeChannelName: e[0].author }); } catch { /* */ }
      return interaction.editReply(
        `✅  Now watching **${resolved.name || resolved.channelId}** on YouTube — I'll post new uploads, premieres & livestreams.` +
        (extra.liveNotifyRoleId ? `\n• Pinging <@&${extra.liveNotifyRoleId}>` : '') +
        (extra.notifyChannelId ? `\n• Posting in <#${extra.notifyChannelId}> (change with \`/livenotify channel\`)` : ''),
      );
    }

    // ── channel ────────────────────────────────────────────────────────────────
    if (sub === 'channel') {
      const ch = interaction.options.getChannel('channel');
      updateGuild(guild.id, { notifyChannelId: ch.id });
      return interaction.editReply(`✅  Notifications will post in ${ch}.`);
    }

    // ── role ───────────────────────────────────────────────────────────────────
    if (sub === 'role') {
      const role = interaction.options.getRole('role');
      updateGuild(guild.id, { liveNotifyRoleId: role.id });
      return interaction.editReply(`✅  I'll ping **${role.name}** on each notification. Members can self-assign it in your role-picker channel.`);
    }

    // ── status ─────────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const credsOk = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
      let twState = '—';
      if (cfg.twitchLogin) {
        const s = credsOk ? await ln.twitchStream(cfg.twitchLogin) : undefined;
        twState = s === undefined ? '⚠️ creds missing' : s ? '🔴 LIVE now' : '⚫ offline';
      }
      const target = cfg.notifyChannelId || cfg.liveChannelId || cfg.announcementsChannelId;
      const embed = new EmbedBuilder()
        .setColor(0x9146FF)
        .setTitle('📡 Live Notification Settings')
        .addFields(
          { name: '🟣 Twitch', value: cfg.twitchLogin ? `[${cfg.twitchLogin}](https://twitch.tv/${cfg.twitchLogin}) · ${twState}` : '*not set* — `/livenotify twitch`', inline: false },
          { name: '📹 YouTube', value: cfg.youtubeChannelId ? `${cfg.youtubeChannelName || cfg.youtubeChannelId} (\`${cfg.youtubeChannelId}\`)` : '*not set* — `/livenotify youtube`', inline: false },
          { name: '📢 Posting to', value: target ? `<#${target}>` : '*none* — `/livenotify channel`', inline: true },
          { name: '🔔 Ping role', value: cfg.liveNotifyRoleId ? `<@&${cfg.liveNotifyRoleId}>` : '*none* — `/livenotify role`', inline: true },
        )
        .setFooter({ text: credsOk ? 'Twitch app configured ✓' : 'Twitch needs TWITCH_CLIENT_ID/SECRET in .env' });
      return interaction.editReply({ embeds: [embed] });
    }

    // ── test ───────────────────────────────────────────────────────────────────
    if (sub === 'test') {
      const platform = interaction.options.getString('platform');
      const target = cfg.notifyChannelId || cfg.liveChannelId || cfg.announcementsChannelId;
      const ch = target ? await interaction.client.channels.fetch(target).catch(() => null) : interaction.channel;
      if (!ch) return interaction.editReply('▲  No target channel set. Use `/livenotify channel` first.');
      const roleId = cfg.liveNotifyRoleId;
      const ping = roleId ? `<@&${roleId}> ` : '';
      if (platform === 'twitch') {
        if (!cfg.twitchLogin) return interaction.editReply('▲  Set a Twitch channel first with `/livenotify twitch`.');
        const s = await ln.twitchStream(cfg.twitchLogin);
        const embed = (s && typeof s === 'object')
          ? ln.twitchEmbed(cfg.twitchLogin, s)
          : ln.twitchEmbed(cfg.twitchLogin, { user_name: cfg.twitchLogin, title: '(sample) Test stream title', game_name: 'Just Chatting', viewer_count: 0, thumbnail_url: '' });
        await ch.send({ content: `${ping}🔴 **${cfg.twitchLogin}** is now live on Twitch! *(test)*`, embeds: [embed], allowedMentions: roleId ? { roles: [roleId] } : { parse: [] } });
      } else {
        if (!cfg.youtubeChannelId) return interaction.editReply('▲  Set a YouTube channel first with `/livenotify youtube`.');
        const e = await ln.youtubeEntries(cfg.youtubeChannelId);
        if (!e[0]) return interaction.editReply('▲  Could not read that YouTube channel\'s feed.');
        await ch.send({ content: `${ping}📹 **${e[0].author}** posted a new video! *(test)*`, embeds: [ln.youtubeEmbed(e[0])], allowedMentions: roleId ? { roles: [roleId] } : { parse: [] } });
      }
      return interaction.editReply(`✅  Sent a test ${platform} notification to ${ch}.`);
    }

    // ── off ────────────────────────────────────────────────────────────────────
    if (sub === 'off') {
      const platform = interaction.options.getString('platform');
      const patch = {};
      if (platform === 'twitch' || platform === 'both') { patch.twitchLogin = null; patch.twitchWasLive = false; }
      if (platform === 'youtube' || platform === 'both') { patch.youtubeChannelId = null; patch.lastYoutubeVideoId = null; }
      updateGuild(guild.id, patch);
      return interaction.editReply(`✅  Stopped watching **${platform === 'both' ? 'Twitch & YouTube' : platform}**.`);
    }
  },
};
