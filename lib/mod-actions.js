'use strict';
// lib/mod-actions.js — duration parsing + temp-ban/temp-mute with auto-expiry.
// Native Discord timeouts auto-expire on their own (≤28d); temp-bans and
// long mutes are reversed by a ticker that reads getGuild(id).tempActions.

const { getGuild, updateGuild } = require('./config');
const modlog = require('./modlog');

const UNIT = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
const MAX_TIMEOUT = 28 * UNIT.d; // Discord native timeout cap

// "7d", "2h30m", "1w", "90m" → milliseconds (null if unparseable)
function parseDuration(str) {
  if (!str) return null;
  let total = 0, found = false;
  const re = /(\d+)\s*(w|d|h|m|s)/gi; let m;
  while ((m = re.exec(str))) { total += parseInt(m[1], 10) * UNIT[m[2].toLowerCase()]; found = true; }
  return found ? total : null;
}
function formatDuration(ms) {
  if (ms == null) return '∞';
  const parts = [];
  for (const [u, v] of [['w', UNIT.w], ['d', UNIT.d], ['h', UNIT.h], ['m', UNIT.m]]) {
    const n = Math.floor(ms / v); if (n) { parts.push(`${n}${u}`); ms -= n * v; }
  }
  return parts.join(' ') || '<1m';
}

function addTempAction(guildId, action) {
  const list = (getGuild(guildId).tempActions || []).filter((a) => !(a.type === action.type && a.userId === action.userId));
  list.push(action);
  updateGuild(guildId, { tempActions: list });
}
function clearTempAction(guildId, type, userId) {
  updateGuild(guildId, { tempActions: (getGuild(guildId).tempActions || []).filter((a) => !(a.type === type && a.userId === userId)) });
}

// Ban now, schedule the unban.
async function tempBan(guild, user, durationMs, reason, modTag) {
  await guild.bans.create(user.id, { reason: `Temp-ban (${formatDuration(durationMs)}): ${reason}`, deleteMessageSeconds: 0 });
  addTempAction(guild.id, { type: 'ban', userId: user.id, until: Date.now() + durationMs, reason });
  modlog.post(guild, { action: 'ban', target: user, mod: modTag || 'automod', reason: `(temp ${formatDuration(durationMs)}) ${reason}` });
}

// Mute via native timeout when ≤28d (auto-expires); else quarantine role + ticker.
async function tempMute(guild, member, durationMs, reason, modTag) {
  if (durationMs <= MAX_TIMEOUT) {
    await member.timeout(durationMs, reason);
  } else {
    const rid = getGuild(guild.id).automod?.quarantineRoleId || getGuild(guild.id).mutedRoleId;
    if (!rid) throw new Error('No quarantine/muted role set (use /automod quarantinerole).');
    await member.roles.add(rid, reason);
    addTempAction(guild.id, { type: 'mute', userId: member.id, until: Date.now() + durationMs, reason });
  }
  modlog.post(guild, { action: 'timeout', target: member.user, mod: modTag || 'automod', reason: `(${formatDuration(durationMs)}) ${reason}` });
}

// Reverse any expired temp actions. Call on an interval.
async function sweepTempActions(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const list = getGuild(guild.id).tempActions || [];
    if (!list.length) continue;
    const due = list.filter((a) => a.until <= now);
    for (const a of due) {
      try {
        if (a.type === 'ban') {
          await guild.bans.remove(a.userId, 'Temp-ban expired').catch(() => {});
          modlog.post(guild, { action: 'unban', target: { toString: () => `<@${a.userId}>` }, mod: 'automod', reason: 'Temp-ban expired' });
        } else if (a.type === 'mute') {
          const m = await guild.members.fetch(a.userId).catch(() => null);
          const rid = getGuild(guild.id).automod?.quarantineRoleId || getGuild(guild.id).mutedRoleId;
          if (m && rid) await m.roles.remove(rid, 'Temp-mute expired').catch(() => {});
          modlog.post(guild, { action: 'unlock', target: { toString: () => `<@${a.userId}>` }, mod: 'automod', reason: 'Temp-mute expired' });
        }
      } catch (e) { console.warn('[mod-actions] sweep:', e.message); }
    }
    if (due.length) updateGuild(guild.id, { tempActions: list.filter((a) => a.until > now) });
  }
}

function startTempActions(client) {
  const iv = setInterval(() => sweepTempActions(client).catch(() => {}), 60_000);
  iv.unref?.();
  return () => clearInterval(iv);
}

module.exports = { parseDuration, formatDuration, tempBan, tempMute, sweepTempActions, startTempActions, clearTempAction, MAX_TIMEOUT };
