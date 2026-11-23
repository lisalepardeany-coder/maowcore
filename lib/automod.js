// Automod: spam detection, invite/link filter, word filter, anti-raid.
const { getGuild, updateGuild } = require('./config');

// Per-user-per-guild rolling message timestamps for spam detection
const messageTimes = new Map();   // `${guildId}:${userId}` -> [ts, ts, ...]
const recentJoins = new Map();    // guildId -> [ts, ts, ...]

const INVITE_RE = /(?:discord(?:app)?\.com\/invite|discord\.gg)\/[a-zA-Z0-9-]+/i;
// /g so matchAll finds every URL — link filter has to check ALL of them, not
// just the first (else `[allowed.com] [malicious.com]` passes).
const LINK_RE = /https?:\/\/[^\s]+/gi;

// Allowed domain = the link's real host is that domain or a subdomain of it.
// (Used to be a plain substring test, so "evil.com/?youtube.com" and
// "youtube.com.evil.com" counted as allowed.)
const hostAllowed = (url, allowed) => {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/\.$/, ''); } catch { return false; }
  return allowed.some((d) => {
    const dom = String(d || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^\*\./, '').replace(/[/:].*$/, '');
    return dom && (host === dom || host.endsWith(`.${dom}`));
  });
};

// Banned word = whole word, not part of a longer one ("ass" no longer hits
// "class"). Phrases and words with symbols still work.
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const findBannedWord = (text, words) => words.find((w) => {
  const word = String(w || '').trim();
  if (!word) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRx(word)}(?![\\p{L}\\p{N}])`, 'iu').test(text);
});

// Pure (tested): mostly capital letters in a longer message.
const isShouting = (text) => {
  const letters = String(text || '').replace(/<a?:\w+:\d+>|<[@#][!&]?\d+>|https?:\/\/\S+/g, '').match(/\p{L}/gu) || [];
  if (letters.length < 15) return false;
  const upper = letters.filter((c) => c !== c.toLowerCase()).length;
  return upper / letters.length >= 0.7;
};
const mentionCount = (msg) => (msg.mentions?.users?.size || 0) + (msg.mentions?.roles?.size || 0) + (msg.mentions?.everyone ? 5 : 0);
const recentTexts = new Map();   // `${guild}:${user}` -> [{ t, norm }]

const RAID_ALERT_COOLDOWN_MS = 60 * 1000;
const lastRaidAlert = new Map();   // guildId -> ts

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
    const hit = findBannedWord(text, cfg.bannedWords);
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
  if (cfg.linkFilter) {
    // matchAll over the /g regex; check EVERY URL so a message with one
    // allowed and one malicious link doesn't pass on the first match.
    const urls = [...text.matchAll(LINK_RE)].map((m) => m[0]);
    if (urls.length) {
      const allowed = cfg.allowedDomains || [];
      const offending = urls.find((u) => !hostAllowed(u, allowed));
      if (offending) {
        await msg.delete().catch(() => {});
        modlog?.post(msg.guild, { action: 'filter', target: msg.author, mod: 'automod', reason: `external link: ${offending.slice(0, 80)}` });
        return { action: 'delete', reason: 'External link' };
      }
    }
  }

  // Smarter checks (v3.4): shouting, mass mentions, the same message again and again.
  const strike = async (reason) => {
    await msg.delete().catch(() => {});
    modlog?.post(msg.guild, { action: 'filter', target: msg.author, mod: 'automod', reason });
    if (cfg.autoWarn) {
      try {
        const count = require('./warnings').add(msg.guild.id, msg.author.id, `Automod: ${reason}`, 'automod');
        await require('./mod-tools').applyWarnRules(msg.guild, msg.author.id, count, 'automod');
      } catch { /* best effort */ }
    }
    return { action: 'delete', reason };
  };
  if (cfg.capsFilter && isShouting(text)) return strike('too many capital letters');
  if (cfg.mentionFilter && mentionCount(msg) >= (cfg.mentionLimit || 5)) return strike(`mass mention (${mentionCount(msg)})`);
  if (cfg.dupFilter && text.trim().length >= 4) {
    const key = `${msg.guildId}:${msg.author.id}`;
    const now = Date.now();
    const norm = text.trim().toLowerCase().replace(/\s+/g, ' ');
    const prev = (recentTexts.get(key) || []).filter((e) => now - e.t < 30000);
    prev.push({ t: now, norm });
    recentTexts.set(key, prev.slice(-6));
    if (prev.filter((e) => e.norm === norm).length >= 3) { recentTexts.delete(key); return strike('same message 3 times'); }
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
  if (arr.length < 5) return false;
  // Alert once per minute per server instead of on every join after the 5th.
  if (now - (lastRaidAlert.get(guild.id) || 0) < RAID_ALERT_COOLDOWN_MS) return false;
  lastRaidAlert.set(guild.id, now);
  return true;
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

module.exports = { checkMessage, checkRaid, setAutomod, hostAllowed, findBannedWord, isShouting };
