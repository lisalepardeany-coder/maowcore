// Automod: spam detection, invite/link filter, word filter, anti-raid.
const { getGuild, updateGuild } = require('./config');

// Per-user-per-guild rolling message timestamps for spam detection
const messageTimes = new Map();   // `${guildId}:${userId}` -> [ts, ts, ...]
const recentJoins = new Map();    // guildId -> [ts, ts, ...]

const INVITE_RE = /(?:discord(?:app)?\.com\/invite|discord\.gg)\/[a-zA-Z0-9-]+/i;
const LINK_RE = /https?:\/\/[^\s]+/i;

const isModerator = (member) => {
  if (!member) return false;
  try {
    const cfg = getGuild(member.guild.id);
    if (member.permissions?.has('ManageMessages')) return true;
    if (cfg.modRoleId && member.roles.cache.has(cfg.modRoleId)) return true;
    if (cfg.djRoleId && member.roles.cache.has(cfg.djRoleId)) return true;
  } catch { /* missing guild/member data */ }
  return false;
};

const isBotWhitelisted = (msg) => {
  if (!msg.author.bot || !msg.guild) return false;
  const whitelist = getGuild(msg.guild.id).botWhitelist || [];
  return whitelist.includes(msg.author.id);
};

const checkMessage = async (msg, modlog) => {
  // Always skip DMs, system messages, and the bot's own messages.
  if (!msg.guild || msg.system) return null;
  // Skip all bot authors — even whitelisted ones (whitelist is for the
  // bot-collision/multi-bot use case, not for moderating bots).
  if (msg.author?.bot) return null;
  if (isModerator(msg.member)) return null;

  const cfg = getGuild(msg.guild.id).automod || {};
  const text = msg.content || '';

  // Word filter
  if (cfg.wordFilter && Array.isArray(cfg.bannedWords) && cfg.bannedWords.length) {
    const lower = text.toLowerCase();
    const hit = cfg.bannedWords.find((w) => lower.includes(w.toLowerCase()));
    if (hit) {
      await msg.delete().catch(() => {});
      modlog?.post(msg.guild, { action: 'filter', target: msg.author, mod: 'automod', reason: `banned word: "${hit}"` });
      return { action: 'delete', reason: `Banned word: ${hit}` };
    }
  }

  // Invite filter
  if (cfg.inviteFilter && INVITE_RE.test(text)) {
    await msg.delete().catch(() => {});
    modlog?.post(msg.guild, { action: 'filter', target: msg.author, mod: 'automod', reason: 'Discord invite link' });
    return { action: 'delete', reason: 'Discord invite' };
  }

  // Link filter (all external — the invite filter above returns on match if
  // enabled, so when link-filter is on alone it correctly catches invites too).
  if (cfg.linkFilter && LINK_RE.test(text)) {
    const allowed = cfg.allowedDomains || [];
    const match = text.match(LINK_RE);
    const url = match?.[0] || '';
    const isAllowed = allowed.some((d) => url.includes(d));
    if (!isAllowed) {
      await msg.delete().catch(() => {});
      modlog?.post(msg.guild, { action: 'filter', target: msg.author, mod: 'automod', reason: 'external link' });
      return { action: 'delete', reason: 'External link' };
    }
  }

  // Spam: 5 messages in 5 sec
  if (cfg.antiSpam) {
    const key = `${msg.guildId}:${msg.author.id}`;
    const now = Date.now();
    const arr = (messageTimes.get(key) || []).filter((t) => now - t < 5000);
    arr.push(now);
    messageTimes.set(key, arr);
    if (arr.length >= 5) {
      messageTimes.delete(key);
      try {
        await msg.member.timeout(5 * 60 * 1000, 'Automod: spam');
        modlog?.post(msg.guild, { action: 'spam', target: msg.author, mod: 'automod', reason: '5 msgs in 5s → 5min timeout' });
      } catch { /* no perms */ }
      return { action: 'mute', reason: 'Spam detected' };
    }
  }

  return null;
};

const checkRaid = (guild) => {
  const cfg = getGuild(guild.id).automod || {};
  if (!cfg.antiRaid) return false;
  const now = Date.now();
  const arr = (recentJoins.get(guild.id) || []).filter((t) => now - t < 10000);
  arr.push(now);
  recentJoins.set(guild.id, arr);
  return arr.length >= 5;
};

const setAutomod = (guildId, patch) => {
  const cfg = getGuild(guildId);
  const automod = { ...(cfg.automod || {}), ...patch };
  updateGuild(guildId, { automod });
  return automod;
};

// Periodic sweep — prune stale per-user/per-guild entries to avoid unbounded
// memory growth. Runs every 10 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of messageTimes) {
    const fresh = arr.filter((t) => now - t < 5000);
    if (fresh.length === 0) messageTimes.delete(key);
    else if (fresh.length !== arr.length) messageTimes.set(key, fresh);
  }
  for (const [guildId, arr] of recentJoins) {
    const fresh = arr.filter((t) => now - t < 10000);
    if (fresh.length === 0) recentJoins.delete(guildId);
    else if (fresh.length !== arr.length) recentJoins.set(guildId, fresh);
  }
}, 10 * 60 * 1000).unref?.();

module.exports = { checkMessage, checkRaid, setAutomod };
