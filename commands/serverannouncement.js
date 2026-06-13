'use strict';
// commands/serverannouncement.js
// Post a server announcement from a dropdown of presets (general, event,
// giveaway, partnership, ErroxSystems partnership, going-live, etc.), with
// optional custom message, title, links, image, channel, and ping.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');
const { getPreset, presetChoices } = require('../lib/announcement-presets');

const LINK_ICONS = { twitch: '🟣 Twitch', youtube: '📺 YouTube', discord: '💬 Discord', website: '🌐 Website' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverannouncement')
    .setDescription('Post a server announcement from a preset (with custom text, links & pings)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName('template').setDescription('Which announcement preset').setRequired(true).addChoices(...presetChoices))
    .addStringOption((o) => o.setName('message').setDescription('Your announcement text (added to the preset)'))
    .addStringOption((o) => o.setName('title').setDescription('Override the embed title'))
    .addChannelOption((o) => o.setName('channel').setDescription('Where to post (default: here)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName('ping').setDescription('Who to ping')
      .addChoices({ name: 'No ping', value: 'none' }, { name: '@here', value: 'here' }, { name: '@everyone', value: 'everyone' }))
    .addRoleOption((o) => o.setName('role').setDescription('Also ping this role'))
    .addStringOption((o) => o.setName('image').setDescription('Image/banner URL'))
    .addStringOption((o) => o.setName('partner').setDescription('Partner name (for the Partnership preset)'))
    .addStringOption((o) => o.setName('twitch').setDescription('Twitch link'))
    .addStringOption((o) => o.setName('youtube').setDescription('YouTube link'))
    .addStringOption((o) => o.setName('discord').setDescription('Discord invite link'))
    .addStringOption((o) => o.setName('website').setDescription('Website / other link'))
    .addBooleanOption((o) => o.setName('preview').setDescription('Preview privately first (does not post)')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const opt = interaction.options;
    const preset = getPreset(opt.getString('template'));
    if (!preset) return interaction.editReply('▲  Unknown preset.');

    const guild = interaction.guild;
    const message = opt.getString('message');
    const partner = opt.getString('partner');

    // Title — preset default, with partner name folded into the generic
    // partnership preset when supplied.
    let title = opt.getString('title') || preset.title;
    let body = preset.body;
    if (preset.id === 'partnership' && partner) {
      title = `🤝 New Partnership — ${partner}!`;
      body = body.replace('a new partnership', `a partnership with **${partner}**`);
    }
    if (message) body += `\n\n${message}`;

    const embed = new EmbedBuilder()
      .setColor(preset.color)
      .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
      .setTitle(title.slice(0, 256))
      .setDescription(body.slice(0, 4096))
      .setFooter({ text: `${guild.name} · ${preset.footer || 'Announcement'}` })
      .setTimestamp();

    // Merge link defaults (from the preset) with any provided options.
    const links = { ...(preset.links || {}) };
    for (const k of ['twitch', 'youtube', 'discord', 'website']) {
      const v = opt.getString(k);
      if (v) links[k] = v;
    }
    const linkLines = Object.entries(links).filter(([, v]) => v).map(([k, v]) => `${LINK_ICONS[k]} — ${v}`);
    if (linkLines.length) {
      embed.addFields({ name: '🔗 Links', value: linkLines.join('\n').slice(0, 1024) });
      embed.setURL(Object.values(links).find(Boolean)); // make the title clickable
    }
    const image = opt.getString('image');
    if (image && /^https?:\/\//.test(image)) embed.setImage(image);

    // ── Preview (private) ──────────────────────────────────────────────────────
    if (opt.getBoolean('preview')) {
      return interaction.editReply({ content: '👀 **Preview** — this has NOT been posted. Run again without `preview:true` to post it.', embeds: [embed] });
    }

    // ── Ping — never auto-@everyone; honour the preset's @here suggestion ───────
    let ping = opt.getString('ping');
    if (!ping) ping = preset.defaultPing === 'everyone' ? 'none' : (preset.defaultPing || 'none');
    const role = opt.getRole('role');
    const parts = [];
    const allowed = { parse: [], roles: [] };
    if (ping === 'everyone') { parts.push('@everyone'); allowed.parse.push('everyone'); }
    else if (ping === 'here') { parts.push('@here'); allowed.parse.push('everyone'); }
    if (role) { parts.push(`<@&${role.id}>`); allowed.roles.push(role.id); }
    const content = parts.join(' ') || undefined;

    // ── Target + post ──────────────────────────────────────────────────────────
    const channel = opt.getChannel('channel') || interaction.channel;
    const me = guild.members.me;
    if (!channel?.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)) {
      return interaction.editReply(`▲  I can't post in ${channel}. Pick a channel I can send to.`);
    }
    try {
      await channel.send({ content, embeds: [embed], allowedMentions: allowed });
    } catch (e) {
      return interaction.editReply(`▲  Failed to post: ${e.message}`);
    }

    const warnEveryone = (ping === 'everyone' && !channel.permissionsFor(me).has(PermissionFlagsBits.MentionEveryone))
      ? '\n⚠️ I lack **Mention Everyone** permission, so the @everyone ping may not have fired.' : '';
    return interaction.editReply(
      `✅  Posted the **${preset.emoji} ${preset.label}** announcement to ${channel}.` +
      (preset.hint ? `\n💡 ${preset.hint}` : '') + warnEveryone,
    );
  },
};
