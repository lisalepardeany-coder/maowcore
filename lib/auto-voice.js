// Auto voice rooms: which voice channel is the "Create Room" trigger.
//
// /setup saves the trigger's ID as autoVoiceRoomId, but that only exists in the
// data/ folder of the bot that ran /setup. A server moved to another host (or a
// trigger channel made by hand) would never work. So when the saved ID is
// missing or points to a deleted channel, a voice channel whose name says
// "Create Room" is used, and its ID is saved for next time.
const { ChannelType } = require('discord.js');

// "➕ Create Room", "create-room", "Create a room", "Join to Create" …
const looksLikeTrigger = (name) => {
  const n = String(name || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  return /\bcreate (a )?room\b/.test(n) || /\bjoin to create\b/.test(n);
};

const isVoice = (ch) => ch && (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice);

// Returns the trigger channel (or null). Saves a newly found ID via `save(id)`.
function findTrigger(guild, cfg, save) {
  const saved = cfg?.autoVoiceRoomId ? guild.channels.cache.get(cfg.autoVoiceRoomId) : null;
  if (isVoice(saved)) return saved;
  const found = guild.channels.cache.find((ch) => ch.type === ChannelType.GuildVoice && looksLikeTrigger(ch.name)) || null;
  if (found && found.id !== cfg?.autoVoiceRoomId && save) {
    try { save(found.id); } catch { /* config write failed: still works this time */ }
  }
  return found;
}

module.exports = { findTrigger, looksLikeTrigger };
