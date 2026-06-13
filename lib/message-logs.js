'use strict';
// lib/message-logs.js — in-memory ring buffer of deleted/edited messages per
// guild (newest first). Not persisted (logs are transient by nature).

const MAX_PER_GUILD = 300;
const byGuild = new Map(); // guildId → [event]

// event: { type:'delete'|'edit', guildId, channelId, channelName, authorId,
//          authorTag, content, newContent?, ts }
function record(event) {
  if (!event?.guildId) return;
  const arr = byGuild.get(event.guildId) || [];
  arr.unshift({ ts: Date.now(), ...event });
  if (arr.length > MAX_PER_GUILD) arr.length = MAX_PER_GUILD;
  byGuild.set(event.guildId, arr);
}

function list(guildId, limit = 200) {
  return (byGuild.get(guildId) || []).slice(0, limit);
}

module.exports = { record, list };
