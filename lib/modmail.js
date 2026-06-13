'use strict';
// lib/modmail.js — relay member DMs to a staff thread and staff replies back.
//   • User DMs the bot → a thread opens in the configured modmail channel.
//   • Staff reply in the thread → DM'd to the user (prefix // to keep private).
// Config: getGuild(id).modmailChannelId · state: modmailThreads { userId: threadId }

const { EmbedBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('./config');

const COLOR_IN = 0x5865F2, COLOR_OUT = 0x57F287;
const DAY = 86_400_000;

// Pick the guild whose modmail to use for a DMing user (prefers GUILD_ID).
function findModmailGuild(client, userId) {
  const configured = [...client.guilds.cache.values()].filter((g) => getGuild(g.id).modmailChannelId);
  if (!configured.length) return null;
  const inGuild = configured.filter((g) => g.members.cache.has(userId));
  const pool = inGuild.length ? inGuild : configured;
  return pool.find((g) => g.id === process.env.GUILD_ID) || pool[0];
}

async function getOrCreateThread(guild, user) {
  const cfg = getGuild(guild.id);
  const map = { ...(cfg.modmailThreads || {}) };
  let thread = map[user.id] ? await guild.channels.fetch(map[user.id]).catch(() => null) : null;
  if (thread?.archived) await thread.setArchived(false).catch(() => {});
  if (!thread) {
    const parent = await guild.channels.fetch(cfg.modmailChannelId).catch(() => null);
    if (!parent?.threads) return null;
    thread = await parent.threads.create({ name: `📬 ${user.username}`.slice(0, 90), autoArchiveDuration: 1440, reason: `Modmail: ${user.tag}` }).catch(() => null);
    if (!thread) return null;
    map[user.id] = thread.id;
    updateGuild(guild.id, { modmailThreads: map });
    const ageDays = Math.floor((Date.now() - user.createdTimestamp) / DAY);
    const member = await guild.members.fetch(user.id).catch(() => null);
    await thread.send({ embeds: [new EmbedBuilder().setColor(COLOR_IN).setTitle('📬 New Modmail Thread')
      .setThumbnail(user.displayAvatarURL())
      .setDescription([`**User:** ${user} (\`${user.tag}\` · \`${user.id}\`)`,
        `**Account age:** ${ageDays}d`, member ? `**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '',
        '', 'Reply in this thread to message them. Prefix a line with `//` to keep it private (not sent).'].filter(Boolean).join('\n'))] }).catch(() => {});
  }
  return thread;
}

// Member DM → staff thread. Returns true if handled.
async function handleUserDM(client, message) {
  if (message.author.bot || message.guild) return false;
  const guild = findModmailGuild(client, message.author.id);
  if (!guild) return false;
  const member = guild.members.cache.get(message.author.id) || await guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return false;
  const thread = await getOrCreateThread(guild, message.author);
  if (!thread) return false;
  const files = [...message.attachments.values()].map((a) => a.url);
  await thread.send({
    content: files.length ? files.join('\n') : undefined,
    embeds: [new EmbedBuilder().setColor(COLOR_IN).setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content || '*(no text / attachment only)*').setTimestamp()],
  }).catch(() => {});
  message.react('📨').catch(() => {});
  return true;
}

// Staff reply in a modmail thread → DM the user. Returns true if handled.
async function handleStaffReply(message) {
  if (message.author.bot || !message.guild || !message.channel.isThread?.()) return false;
  const map = getGuild(message.guild.id).modmailThreads || {};
  const userId = Object.keys(map).find((uid) => map[uid] === message.channel.id);
  if (!userId) return false;
  if (message.content.startsWith('//')) { message.react('🤐').catch(() => {}); return true; } // private staff note
  const user = await message.client.users.fetch(userId).catch(() => null);
  if (!user) return false;
  const files = [...message.attachments.values()].map((a) => a.url);
  try {
    await user.send({
      content: files.length ? files.join('\n') : undefined,
      embeds: [new EmbedBuilder().setColor(COLOR_OUT).setAuthor({ name: `${message.member?.displayName || message.author.username} · Staff`, iconURL: message.author.displayAvatarURL() })
        .setDescription(message.content || '*(attachment)*').setFooter({ text: `${message.guild.name} · Modmail` }).setTimestamp()],
    });
    message.react('📨').catch(() => {});
  } catch { message.react('⚠️').catch(() => {}); } // user DMs closed
  return true;
}

async function closeThread(guild, userId, byTag) {
  const map = { ...(getGuild(guild.id).modmailThreads || {}) };
  const threadId = map[userId];
  delete map[userId];
  updateGuild(guild.id, { modmailThreads: map });
  if (threadId) {
    const thread = await guild.channels.fetch(threadId).catch(() => null);
    if (thread) {
      await thread.send(`🔒 Thread closed by ${byTag || 'staff'}.`).catch(() => {});
      await thread.setArchived(true).catch(() => {});
    }
  }
  const user = await guild.client.users.fetch(userId).catch(() => null);
  user?.send({ embeds: [new EmbedBuilder().setColor(0x9CA3AF).setDescription(`🔒 Your modmail thread with **${guild.name}** has been closed. DM again to open a new one.`)] }).catch(() => {});
}

module.exports = { handleUserDM, handleStaffReply, closeThread, findModmailGuild };
