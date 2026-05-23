// Audit-log helper — posts mod actions to the configured modlog channel.
const { EmbedBuilder } = require('discord.js');
const { getGuild } = require('./config');
const { COLORS } = require('./theme');

const COLOR_BY_ACTION = {
  ban: COLORS.FLARE,
  kick: COLORS.FLARE,
  softban: 0xFB923C,
  timeout: 0xFBBF24,
  warn: 0xFBBF24,
  unban: COLORS.NEBULA,
  purge: COLORS.COSMIC,
  lock: 0x9CA3AF,
  unlock: COLORS.NEBULA,
  slowmode: COLORS.COSMIC,
  raid: COLORS.FLARE,
  filter: 0xFBBF24,
  spam: COLORS.FLARE,
};

const post = (guild, { action, target, mod, reason, extra }) => {
  const cfg = getGuild(guild.id);
  const channelId = cfg.modlogChannelId;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(COLOR_BY_ACTION[action] || COLORS.COSMIC)
    .setAuthor({ name: `⌬  ${action.toUpperCase()}` })
    .setTimestamp();
  const lines = [];
  if (target) lines.push(`**Target:** ${target.tag ? `${target} (${target.tag})` : target}`);
  if (mod) lines.push(`**Moderator:** ${mod}`);
  if (reason) lines.push(`**Reason:** ${reason}`);
  if (extra) lines.push(extra);
  // Bot attribution (which bot instance acted) — useful in multi-bot setups
  lines.push(`*via ${process.env.BOT_INSTANCE_NAME || 'MaowCore'}*`);
  embed.setDescription(lines.join('\n'));
  channel.send({ embeds: [embed] }).catch(() => {});
};

module.exports = { post };
