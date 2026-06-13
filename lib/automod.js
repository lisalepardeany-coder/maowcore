'use strict';
// lib/automod.js — automated moderation engine.
//
// Features (all per-guild, toggled via /automod):
//   • Anti-spam      — message flood, mass-mention, duplicate-message
//   • Scam filter    — phishing / nitro-scam / fake-domain detection
//   • Invite/link    — Discord invites + external links (with allow-list)
//   • Word filter    — plain words + `re:` regex patterns
//   • Raid shield    — join-spike → quarantine/kick new joiners + alert
//   • Alt gate       — kick/quarantine accounts younger than N days
//   • Anti-nuke      — mass channel/role delete or mass-ban by a non-whitelisted
//                      actor → strip their roles + alert
//   • Escalation     — warnings stack into auto timeout → kick → ban
//
// Config lives at getGuild(id).automod. Pure detection helpers are exported for
// unit testing.

const { getGuild, updateGuild } = require('./config');
const warnings = require('./warnings');

// ── in-memory rolling state (swept every 10 min) ─────────────────────────────
const messageTimes = new Map(); // `${g}:${u}` -> [ts]
const lastMessages  = new Map(); // `${g}:${u}` -> { text, count }
const recentJoins   = new Map(); // g -> [ts]
const raidUntil     = new Map(); // g -> ts (quarantine new joiners until)
const nukeActions   = new Map(); // `${g}:${actorId}` -> [ts]

// ── patterns ─────────────────────────────────────────────────────────────────
const INVITE_RE = /(?:discord(?:app)?\.com\/invite|discord\.gg|discord\.me)\/[a-z0-9-]+/i;
const LINK_RE   = /https?:\/\/[^\s]+/gi;
// Scam / phishing heuristics — keyword combos + look-alike domains.
const SCAM_TEXT_RES = [
  /free\s+(?:discord\s+)?nitro/i,
  /(?:steam|nitro)\s*(?:gift|giveaway)\b[\s\S]*?https?:\/\//i,
  /@everyone[\s\S]*?https?:\/\//i,
  /claim\s+your\s+(?:free\s+)?(?:nitro|gift)/i,
];
// Look-alikes only — must NOT match the legitimate "discord.com" / "discordapp.com".
const SCAM_DOMAIN_RE = /(?:d[i1l]sc[o0]rd-?(?:nitro|gift)|d1scord|dlscord|disc0rd|dlsc0rd|free-?nitro|n[i1]tro-?free|gift-?discord|steamcommunity[.-](?!com\b)\w+)/i;

const DAY = 86_400_000;

// ── pure helpers (exported for tests) ────────────────────────────────────────
function isScam(text) {
  if (!text) return false;
  if (SCAM_DOMAIN_RE.test(text)) return true;
  return SCAM_TEXT_RES.some((re) => re.test(text));
}
function matchesWordFilter(text, banned) {
  if (!text || !Array.isArray(banned) || !banned.length) return null;
  const lower = text.toLowerCase();
  for (const w of banned) {
    if (typeof w !== 'string' || !w) continue;
    if (w.startsWith('re:')) {
      try { if (new RegExp(w.slice(3), 'i').test(text)) return w; } catch { /* bad regex */ }
    } else if (lower.includes(w.toLowerCase())) return w;
  }
  return null;
}
// Highest ladder rung at-or-below the warn count. Ladder: { "3":"timeout", ... }
function escalationActionFor(ladder, count) {
  if (!ladder) return null;
  const rung = Object.keys(ladder).map(Number).filter((n) => n === count).sort((a, b) => b - a)[0];
  return rung != null ? ladder[String(rung)] : null;
}
function accountTooYoung(createdTimestamp, minDays, now = Date.now()) {
  if (!minDays) return false;
  return (now - createdTimestamp) < minDays * DAY;
}

// ── shared config helpers ────────────────────────────────────────────────────
const amOf = (guildId) => getGuild(guildId).automod || {};
const setAutomod = (guildId, patch) => {
  const automod = { ...amOf(guildId), ...patch };
  updateGuild(guildId, { automod });
  return automod;
};

const isModerator = (member) => {
  if (!member) return false;
  try {
    const cfg = getGuild(member.guild.id);
    if (member.permissions?.has('ManageMessages')) return true;
    if (cfg.modRoleId && member.roles.cache.has(cfg.modRoleId)) return true;
    for (const k of ['adminRoleId', 'headAdminRoleId', 'headModRoleId', 'trialModRoleId']) {
      if (cfg[k] && member.roles.cache.has(cfg[k])) return true;
    }
  } catch { /* */ }
  return false;
};

const quarantineRole = (guild) => {
  const cfg = getGuild(guild.id);
  return cfg.automod?.quarantineRoleId || cfg.mutedRoleId || null;
};

// Apply a punishment to a member. action: timeout|kick|ban|quarantine|delete-noop
async function applyPunishment(member, action, reason, modlog, durationMs) {
  try {
    if (action === 'timeout') await member.timeout(durationMs || 3_600_000, reason);
    else if (action === 'kick') await member.kick(reason);
    else if (action === 'ban') await member.ban({ reason, deleteMessageSeconds: 0 });
    else if (action === 'quarantine') {
      const rid = quarantineRole(member.guild);
      if (rid) await member.roles.add(rid, reason);
    } else return false;
    modlog?.post(member.guild, { action: action === 'quarantine' ? 'timeout' : action, target: member.user, mod: 'automod', reason });
    return true;
  } catch (e) { console.warn('[automod] punishment failed:', e.message); return false; }
}

// Apply the escalation ladder for a member who now has `count` warnings.
// Called by /warn (after adding) and by warnAndEscalate (automod offences).
async function escalate(guild, member, count, modlog) {
  const cfg = amOf(guild.id);
  if (!cfg.escalation || !member) return null;
  const action = escalationActionFor(cfg.escalationLadder || { 3: 'timeout', 5: 'kick', 7: 'ban' }, count);
  if (!action) return null;
  await applyPunishment(member, action, `Auto-escalation: ${count} warnings`, modlog, cfg.escalationTimeoutMs);
  return action;
}
// Add a warning (automod offence) and escalate if it hits a rung.
async function warnAndEscalate(guild, member, reason, modlog) {
  const count = warnings.add(guild.id, member.id, `[automod] ${reason}`, 'automod');
  return escalate(guild, member, count, modlog);
}

// ── message checks ───────────────────────────────────────────────────────────
async function checkMessage(msg, modlog) {
  if (!msg.guild || msg.system || msg.author?.bot) return null;
  if (isModerator(msg.member)) return null;
  const cfg = amOf(msg.guild.id);
  const text = msg.content || '';
  const hit = async (reason, { escalate = true } = {}) => {
    await msg.delete().catch(() => {});
    modlog?.post(msg.guild, { action: 'filter', target: msg.author, mod: 'automod', reason });
    if (escalate && cfg.escalateAutomod !== false && msg.member) await warnAndEscalate(msg.guild, msg.member, reason, modlog);
    return { action: 'delete', reason };
  };

  // Word filter
  if (cfg.wordFilter) {
    const w = matchesWordFilter(text, cfg.bannedWords);
    if (w) return hit(`banned word: ${w.startsWith('re:') ? '(regex)' : w}`);
  }
  // Scam / phishing
  if (cfg.scamFilter && isScam(text)) {
    if (msg.member) await applyPunishment(msg.member, 'timeout', 'Automod: scam/phishing', modlog, 10 * 60_000);
    return hit('scam / phishing link', { escalate: false });
  }
  // Invite filter
  if (cfg.inviteFilter && INVITE_RE.test(text)) return hit('Discord invite link');
  // Link filter (external, with allow-list)
  if (cfg.linkFilter) {
    const urls = [...text.matchAll(LINK_RE)].map((m) => m[0]);
    const allowed = cfg.allowedDomains || [];
    const bad = urls.find((u) => !allowed.some((d) => u.toLowerCase().includes(d.toLowerCase())));
    if (bad) return hit(`external link: ${bad.slice(0, 80)}`);
  }
  // Mass-mention spam (single message)
  if (cfg.mentionSpam) {
    const limit = cfg.mentionLimit || 5;
    const mentions = (msg.mentions?.users?.size || 0) + (msg.mentions?.roles?.size || 0);
    if (mentions >= limit) {
      if (msg.member) await applyPunishment(msg.member, 'timeout', 'Automod: mass mention', modlog, 5 * 60_000);
      return hit(`mass mention (${mentions})`, { escalate: false });
    }
  }
  // Duplicate-message spam
  if (cfg.dupeSpam && text.length > 3) {
    const key = `${msg.guildId}:${msg.author.id}`;
    const prev = lastMessages.get(key);
    if (prev && prev.text === text) {
      prev.count++;
      if (prev.count >= (cfg.dupeLimit || 4)) {
        lastMessages.delete(key);
        if (msg.member) await applyPunishment(msg.member, 'timeout', 'Automod: duplicate spam', modlog, 5 * 60_000);
        return hit('duplicate-message spam', { escalate: false });
      }
    } else lastMessages.set(key, { text, count: 1 });
  }
  // Flood spam (N messages in window)
  if (cfg.antiSpam) {
    const key = `${msg.guildId}:${msg.author.id}`;
    const now = Date.now();
    const win = cfg.spamWindowMs || 5000;
    const arr = (messageTimes.get(key) || []).filter((t) => now - t < win);
    arr.push(now);
    messageTimes.set(key, arr);
    if (arr.length >= (cfg.spamCount || 5)) {
      messageTimes.delete(key);
      if (msg.member) await applyPunishment(msg.member, 'timeout', 'Automod: spam', modlog, cfg.spamTimeoutMs || 5 * 60_000);
      modlog?.post(msg.guild, { action: 'spam', target: msg.author, mod: 'automod', reason: `${arr.length} msgs / ${win / 1000}s` });
      return { action: 'mute', reason: 'Spam detected' };
    }
  }
  return null;
}

// ── join checks: alt gate + raid shield ──────────────────────────────────────
async function checkJoin(member, modlog) {
  const cfg = amOf(member.guild.id);
  const now = Date.now();

  // Raid detection
  if (cfg.antiRaid) {
    const arr = (recentJoins.get(member.guild.id) || []).filter((t) => now - t < (cfg.raidWindowMs || 10_000));
    arr.push(now);
    recentJoins.set(member.guild.id, arr);
    if (arr.length >= (cfg.raidJoinCount || 5)) {
      raidUntil.set(member.guild.id, now + (cfg.raidLockMs || 5 * 60_000));
      modlog?.post(member.guild, { action: 'raid', target: member.user, mod: 'automod', reason: `${arr.length} joins / ${(cfg.raidWindowMs || 10_000) / 1000}s — raid mode ON` });
    }
  }
  // During an active raid window, action every new joiner.
  const raiding = (raidUntil.get(member.guild.id) || 0) > now;
  if (raiding && cfg.antiRaid) {
    const act = cfg.raidAction === 'kick' ? 'kick' : cfg.raidAction === 'alert' ? null : 'quarantine';
    if (act) { await applyPunishment(member, act, 'Automod: raid mode', modlog); return { action: act, reason: 'raid' }; }
  }
  // Alt / young-account gate
  if (cfg.altGate && accountTooYoung(member.user.createdTimestamp, cfg.minAccountAgeDays || 7, now)) {
    const act = cfg.altAction === 'kick' ? 'kick' : 'quarantine';
    await applyPunishment(member, act, `Account younger than ${cfg.minAccountAgeDays || 7}d`, modlog);
    modlog?.post(member.guild, { action: 'filter', target: member.user, mod: 'automod', reason: `alt gate: account ${Math.floor((now - member.user.createdTimestamp) / DAY)}d old → ${act}` });
    return { action: act, reason: 'alt-gate' };
  }
  return null;
}

// ── anti-nuke: track destructive actions per actor ───────────────────────────
async function recordNuke(guild, actorId, actionType, modlog) {
  const cfg = amOf(guild.id);
  if (!cfg.antiNuke || !actorId) return false;
  if (actorId === guild.ownerId) return false;
  if ((cfg.nukeWhitelist || []).includes(actorId)) return false;
  if (actorId === guild.client.user.id) return false;

  const key = `${guild.id}:${actorId}`;
  const now = Date.now();
  const arr = (nukeActions.get(key) || []).filter((t) => now - t < (cfg.nukeWindowMs || 30_000));
  arr.push(now);
  nukeActions.set(key, arr);
  if (arr.length < (cfg.nukeThreshold || 4)) return false;

  nukeActions.delete(key);
  // Neutralise: strip the actor's roles (removes their permissions) + alert.
  try {
    const member = await guild.members.fetch(actorId).catch(() => null);
    if (member && member.manageable) {
      await member.roles.set([], 'Anti-nuke: rapid destructive actions');
    }
    modlog?.post(guild, { action: 'ban', target: member?.user || { toString: () => `<@${actorId}>` }, mod: 'automod',
      reason: `🚨 ANTI-NUKE — ${arr.length}× ${actionType} in <${(cfg.nukeWindowMs || 30_000) / 1000}s. Roles stripped.` });
  } catch (e) { console.warn('[automod] anti-nuke:', e.message); }
  return true;
}

// ── periodic sweep ───────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of messageTimes) { const f = arr.filter((t) => now - t < 10_000); f.length ? messageTimes.set(k, f) : messageTimes.delete(k); }
  for (const [k, arr] of nukeActions) { const f = arr.filter((t) => now - t < 60_000); f.length ? nukeActions.set(k, f) : nukeActions.delete(k); }
  for (const [g, arr] of recentJoins) { const f = arr.filter((t) => now - t < 60_000); f.length ? recentJoins.set(g, f) : recentJoins.delete(g); }
  lastMessages.clear(); // dupe-spam state is short-lived — reset wholesale
  for (const [g, t] of raidUntil) { if (t < now) raidUntil.delete(g); }
}, 10 * 60_000).unref?.();

module.exports = {
  checkMessage, checkJoin, recordNuke, warnAndEscalate, escalate, applyPunishment, setAutomod,
  // legacy alias (index.js previously called checkRaid)
  checkRaid: (guild) => { const c = amOf(guild.id); if (!c.antiRaid) return false; return (raidUntil.get(guild.id) || 0) > Date.now(); },
  // pure helpers for tests
  isScam, matchesWordFilter, escalationActionFor, accountTooYoung,
};
