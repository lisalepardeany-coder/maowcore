'use strict';
// lib/leveling.js — text + voice XP, levels, auto-managed milestone roles.
//
// Per-guild config (getGuild(id).leveling):
//   enabled, textXp, voiceXp, textCooldownMs, xpMultiplier, doubleXpUntil,
//   noXpChannels[], noXpRoles[], levelUpChannelId, announceEvery, stackRoles,
//   levelRoles { "<level>": roleId }, roleInterval, roleMaxLevel
// Per-user XP:  getGuild(id).levels { userId: { xp, t } }   (t = last text-xp ts)

const { getGuild, updateGuild } = require('./config');

// ── XP curve ─────────────────────────────────────────────────────────────────
// Cost to reach level L = BASE*L. Cumulative XP to reach level L = BASE*L*(L+1)/2.
const BASE = 100;
const totalXpForLevel = (level) => (BASE * level * (level + 1)) / 2;
const levelForXp = (xp) => Math.max(0, Math.floor((-1 + Math.sqrt(1 + (8 * xp) / BASE)) / 2));
const xpIntoLevel = (xp) => { const L = levelForXp(xp); return { level: L, into: xp - totalXpForLevel(L), need: totalXpForLevel(L + 1) - totalXpForLevel(L) }; };

const cfgOf = (gid) => getGuild(gid).leveling || {};
const setCfg = (gid, patch) => { updateGuild(gid, { leveling: { ...cfgOf(gid), ...patch } }); return cfgOf(gid); };
const levelsOf = (gid) => getGuild(gid).levels || {};
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// ── effective multiplier for a member ────────────────────────────────────────
function multiplierFor(guild, member) {
  const c = cfgOf(guild.id);
  let mult = c.xpMultiplier || 1;
  if (c.doubleXpUntil && Date.now() < c.doubleXpUntil) mult *= 2;
  if (member && c.roleMultipliers) {
    let roleMax = 1;
    for (const [rid, m] of Object.entries(c.roleMultipliers)) if (member.roles.cache.has(rid)) roleMax = Math.max(roleMax, m);
    mult *= roleMax;
  }
  return mult;
}

// ── core: add XP, return level transition ────────────────────────────────────
function addXp(guildId, userId, amount) {
  const all = { ...levelsOf(guildId) };
  const prev = all[userId]?.xp || 0;
  const next = Math.max(0, prev + amount);
  const oldLevel = levelForXp(prev);
  const newLevel = levelForXp(next);
  all[userId] = { ...(all[userId] || {}), xp: next };
  updateGuild(guildId, { levels: all });
  return { oldLevel, newLevel, xp: next, leveledUp: newLevel > oldLevel };
}

function setXp(guildId, userId, xp) {
  const all = { ...levelsOf(guildId) };
  all[userId] = { ...(all[userId] || {}), xp: Math.max(0, xp) };
  updateGuild(guildId, { levels: all });
  return levelForXp(all[userId].xp);
}
const setLevel = (guildId, userId, level) => setXp(guildId, userId, totalXpForLevel(Math.max(0, level)));

// ── milestone roles ──────────────────────────────────────────────────────────
// Highest configured milestone <= level.
function milestoneFor(guildId, level) {
  const roles = cfgOf(guildId).levelRoles || {};
  const reached = Object.keys(roles).map(Number).filter((l) => l <= level).sort((a, b) => b - a);
  return reached.length ? { level: reached[0], roleId: roles[reached[0]] } : null;
}

// Sync a member's reward roles to their level. Returns the newly-earned role (or null).
async function applyRewards(guild, member, level) {
  const c = cfgOf(guild.id);
  const roles = c.levelRoles || {};
  if (!Object.keys(roles).length || !member) return null;
  const earnedLevels = Object.keys(roles).map(Number).filter((l) => l <= level);
  const top = earnedLevels.length ? Math.max(...earnedLevels) : null;
  let newlyEarned = null;
  try {
    if (c.stackRoles) {
      for (const l of earnedLevels) {
        const rid = roles[l];
        if (rid && !member.roles.cache.has(rid)) { await member.roles.add(rid, `Level ${l}`).catch(() => {}); if (l === top) newlyEarned = rid; }
      }
    } else {
      // single-tier: keep only the top role, remove the rest
      for (const [l, rid] of Object.entries(roles)) {
        const lvl = Number(l);
        if (lvl === top) { if (!member.roles.cache.has(rid)) { await member.roles.add(rid, `Level ${lvl}`).catch(() => {}); newlyEarned = rid; } }
        else if (member.roles.cache.has(rid)) await member.roles.remove(rid, 'Level tier changed').catch(() => {});
      }
    }
  } catch { /* perms/hierarchy */ }
  return newlyEarned;
}

// Create/maintain milestone roles automatically. interval=25, maxLevel=500 → roles
// at 25,50,…,500 (+ 750,1000). Idempotent: reuses existing same-named roles.
async function setupRoles(guild, interval = 25, maxLevel = 500) {
  interval = Math.max(1, interval);
  // Clamp the milestone count — Discord caps a guild at 250 roles total, and
  // creating hundreds of roles would churn for minutes and partially fail.
  // Widen the effective interval so we never make more than ~48 tier roles.
  const MAX_TIERS = 48;
  const step = Math.max(interval, Math.ceil(maxLevel / MAX_TIERS));
  const levels = [];
  for (let l = step; l <= maxLevel; l += step) levels.push(l);
  for (const big of [Math.round(maxLevel * 1.5), maxLevel * 2]) if (big > maxLevel && !levels.includes(big)) levels.push(big);
  const roleMap = { ...(cfgOf(guild.id).levelRoles || {}) };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let created = 0;
  for (const lvl of levels) {
    const name = `🏅 Level ${lvl}`;
    let role = guild.roles.cache.find((r) => r.name === name) || (roleMap[lvl] && guild.roles.cache.get(roleMap[lvl]));
    if (!role) {
      // tier colour gradient green→gold→red
      const t = Math.min(1, lvl / (maxLevel || 500));
      const color = t < 0.5 ? 0x57F287 : t < 0.8 ? 0xFEE75C : 0xFF6B6B;
      role = await guild.roles.create({ name, color, hoist: false, mentionable: false, reason: 'MaowCore /levelxp setup' }).catch(() => null);
      if (role) created++;
      await sleep(300);
    }
    if (role) roleMap[lvl] = role.id;
  }
  setCfg(guild.id, { levelRoles: roleMap, roleInterval: step, roleMaxLevel: maxLevel });
  return { created, total: Object.keys(roleMap).length, levels };
}

// ── leaderboard / rank ───────────────────────────────────────────────────────
function leaderboard(guildId, limit = 10) {
  return Object.entries(levelsOf(guildId))
    .map(([userId, d]) => ({ userId, xp: d.xp || 0, level: levelForXp(d.xp || 0) }))
    .sort((a, b) => b.xp - a.xp).slice(0, limit);
}
function rankOf(guildId, userId) {
  const sorted = Object.entries(levelsOf(guildId)).map(([u, d]) => ({ userId: u, xp: d.xp || 0 })).sort((a, b) => b.xp - a.xp);
  const idx = sorted.findIndex((e) => e.userId === userId);
  const xp = levelsOf(guildId)[userId]?.xp || 0;
  return { xp, ...xpIntoLevel(xp), rank: idx < 0 ? null : idx + 1, total: sorted.length };
}

// ── runtime hooks ────────────────────────────────────────────────────────────
// Award text XP on a message. Returns the level-up result (or null).
async function onMessage(msg) {
  if (!msg.guild || msg.author?.bot || msg.system) return null;
  const c = cfgOf(msg.guild.id);
  if (!c.enabled) return null;
  if ((c.noXpChannels || []).includes(msg.channelId) || (c.noXpChannels || []).includes(msg.channel.parentId)) return null;
  if (msg.member && (c.noXpRoles || []).some((r) => msg.member.roles.cache.has(r))) return null;
  // cooldown
  const all = levelsOf(msg.guild.id);
  const last = all[msg.author.id]?.t || 0;
  const now = Date.now();
  if (now - last < (c.textCooldownMs ?? 30_000)) return null;
  const base = rnd(c.textXpMin || 18, c.textXpMax || 32);
  const gain = Math.round(base * multiplierFor(msg.guild, msg.member));
  // persist last-ts together with xp
  const merged = { ...all };
  merged[msg.author.id] = { ...(merged[msg.author.id] || {}), t: now };
  updateGuild(msg.guild.id, { levels: merged });
  const res = addXp(msg.guild.id, msg.author.id, gain);
  if (res.leveledUp) await onLevelUp(msg.guild, msg.member, res, msg.channel);
  return res;
}

// Award voice XP — call on an interval for everyone in voice.
async function voiceTick(client) {
  for (const guild of client.guilds.cache.values()) {
    const c = cfgOf(guild.id);
    if (!c.enabled || (c.voiceXp ?? 15) <= 0) continue;
    const afkId = guild.afkChannelId;
    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== 2 && ch.type !== 13) continue; // GuildVoice | GuildStageVoice
      if (ch.id === afkId || (c.noXpChannels || []).includes(ch.id)) continue;
      const members = ch.members?.filter((m) => !m.user.bot && !m.voice.selfDeaf && !m.voice.serverDeaf);
      if (!members || members.size < 1) continue;
      // (don't reward if alone — needs ≥2 humans to count as activity)
      if (members.size < 2) continue;
      for (const m of members.values()) {
        if ((c.noXpRoles || []).some((r) => m.roles.cache.has(r))) continue;
        const gain = Math.round((c.voiceXp ?? 15) * multiplierFor(guild, m));
        const res = addXp(guild.id, m.id, gain);
        if (res.leveledUp) await onLevelUp(guild, m, res, null);
      }
    }
  }
}

async function onLevelUp(guild, member, res, channel) {
  const c = cfgOf(guild.id);
  const earned = await applyRewards(guild, member, res.newLevel);
  const milestone = earned || res.newLevel % (c.announceEvery || 10) === 0;
  if (c.levelUpAnnounce === false || !milestone) return;
  const target = c.levelUpChannelId ? guild.channels.cache.get(c.levelUpChannelId) : channel;
  if (!target?.send) return;
  const roleLine = earned ? `\n🏅 Unlocked <@&${earned}>!` : '';
  target.send({
    content: `🎉 ${member} reached **Level ${res.newLevel}**!${roleLine}`,
    allowedMentions: { users: [member.id], roles: earned ? [earned] : [] },
  }).catch(() => {});
}

function startVoiceXp(client) {
  const iv = setInterval(() => voiceTick(client).catch(() => {}), 60_000);
  iv.unref?.();
  return () => clearInterval(iv);
}

module.exports = {
  totalXpForLevel, levelForXp, xpIntoLevel, multiplierFor,
  addXp, setXp, setLevel, milestoneFor, applyRewards, setupRoles,
  leaderboard, rankOf, onMessage, voiceTick, startVoiceXp, cfgOf, setCfg,
};
