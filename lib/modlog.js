// Mod log: every mod action is saved (database, for the panel and /note
// history) and posted to the configured modlog channel.
const { EmbedBuilder } = require('discord.js');
const { getGuild } = require('./config');
const { COLORS } = require('./theme');
const db = require('./db');

const COLOR_BY_ACTION = {
  ban: COLORS.FLARE, kick: COLORS.FLARE, softban: 0xFB923C, timeout: 0xFBBF24, warn: 0xFBBF24,
  unban: COLORS.NEBULA, purge: COLORS.COSMIC, lock: 0x9CA3AF, unlock: COLORS.NEBULA, slowmode: COLORS.COSMIC,
  raid: COLORS.FLARE, filter: 0xFBBF24, spam: COLORS.FLARE, note: 0x9CA3AF, appeal: COLORS.NEBULA, ticket: COLORS.COSMIC,
};

const describe = (x) => (x == null ? null : x.tag ? `${x.tag}` : x.username ? x.username : String(x));
const idOf = (x) => (x?.id ? String(x.id) : (String(x || '').match(/\d{15,25}/) || [])[0] || null);

// Keep the last entries in memory too (when SQLite isn't available).
const memory = new Map();   // guildId -> entries[]
const MEM_MAX = 300;

const record = (guildId, { action, target, mod, reason, extra }) => {
  const entry = {
    ts: Date.now(), action: String(action), targetId: idOf(target), target: describe(target),
    moderator: describe(mod), reason: reason ? String(reason).slice(0, 500) : null, extra: extra ? String(extra).slice(0, 500) : null,
  };
  if (db.isAvailable) {
    try {
      db.raw.prepare(`INSERT INTO mod_log (guild_id, ts, action, target_id, target, moderator, reason, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(guildId, entry.ts, entry.action, entry.targetId, entry.target, entry.moderator, entry.reason, entry.extra);
      if (Math.random() < 0.02) db.raw.prepare(`DELETE FROM mod_log WHERE guild_id = ? AND id NOT IN (SELECT id FROM mod_log WHERE guild_id = ? ORDER BY ts DESC LIMIT 5000)`).run(guildId, guildId);
      return entry;
    } catch (e) { console.warn('[modlog] save failed:', e.message); }
  }
  const list = memory.get(guildId) || [];
  list.unshift(entry);
  memory.set(guildId, list.slice(0, MEM_MAX));
  return entry;
};

const list = (guildId, { limit = 100, targetId = null, action = null } = {}) => {
  const n = Math.max(1, Math.min(500, Number(limit) || 100));
  if (db.isAvailable) {
    try {
      let sql = 'SELECT * FROM mod_log WHERE guild_id = ?'; const args = [guildId];
      if (targetId) { sql += ' AND target_id = ?'; args.push(String(targetId)); }
      if (action) { sql += ' AND action = ?'; args.push(String(action)); }
      sql += ' ORDER BY ts DESC, id DESC LIMIT ?'; args.push(n);
      return db.raw.prepare(sql).all(...args).map((r) => ({ id: r.id, ts: r.ts, action: r.action, targetId: r.target_id, target: r.target, moderator: r.moderator, reason: r.reason, extra: r.extra }));
    } catch { /* fall back */ }
  }
  return (memory.get(guildId) || []).filter((e) => (!targetId || e.targetId === String(targetId)) && (!action || e.action === action)).slice(0, n);
};

const post = (guild, { action, target, mod, reason, extra }) => {
  record(guild.id, { action, target, mod, reason, extra });
  const cfg = getGuild(guild.id);
  const channelId = cfg.modlogChannelId;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(COLOR_BY_ACTION[action] || COLORS.COSMIC)
    .setAuthor({ name: `⌬  ${String(action).toUpperCase()}` })
    .setTimestamp();
  const lines = [];
  if (target) lines.push(`**Target:** ${target.tag ? `${target} (${target.tag})` : target}`);
  if (mod) lines.push(`**Moderator:** ${mod}`);
  if (reason) lines.push(`**Reason:** ${reason}`);
  if (extra) lines.push(extra);
  lines.push(`*via ${process.env.BOT_INSTANCE_NAME || 'MaowCore'}*`);
  embed.setDescription(lines.join('\n'));
  channel.send({ embeds: [embed] }).catch(() => {});
};

module.exports = { post, record, list };
