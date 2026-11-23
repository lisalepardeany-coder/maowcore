// Build the OAuth2 invite URL for this bot. Centralized so the console
// banner, /invite slash command, and dashboard all stay in sync.
//
// Permission set covers every gated action the bot can actually perform —
// music (Connect/Speak/UseVAD), moderation (Kick/Ban/ModerateMembers),
// management (ManageChannels/Roles/Nicknames/Messages), and reactions.
// No Administrator — that's a footgun on community servers.
const { PermissionFlagsBits } = require('discord.js');

const REQUIRED_PERMS = [
  // Read/write basics
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.AddReactions,
  // Music / voice
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.PrioritySpeaker,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.MoveMembers,
  // Moderation
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,        // timeouts
  PermissionFlagsBits.ManageMessages,         // /purge, automod deletes
  // Setup helpers — needed for /setup, /reactionrole, /lock, auto voice rooms,
  // stats channels, /welcome, /nick, etc.
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.CreateInstantInvite,
];

const computePermsBitfield = () =>
  REQUIRED_PERMS.reduce((acc, b) => acc | b, 0n).toString();

// Build the canonical invite URL. clientId can come from the live Discord
// client (`client.user.id` once ready) or from process.env.CLIENT_ID as a
// fallback for pre-login contexts.
const inviteUrl = (clientId) => {
  if (!clientId) return null;
  const perms = computePermsBitfield();
  // `bot` lets the bot join servers; `applications.commands` lets slash
  // commands work without re-authorizing later.
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${perms}&scope=bot+applications.commands`;
};

// Link that adds the bot to the user's own account (user install), so its
// portable commands work in DMs, group chats and any server.
const userInstallUrl = (clientId) => (clientId
  ? `https://discord.com/oauth2/authorize?client_id=${clientId}&integration_type=1&scope=applications.commands`
  : null);

// Resolve the most-trusted available client ID:
//   1. Live Discord client (set once Ready fires) — always correct.
//   2. CLIENT_ID env var (set for /deploy) — correct if it matches the token.
//   3. null — caller should warn rather than show a broken URL.
const resolveClientId = (client) =>
  client?.user?.id || process.env.CLIENT_ID || null;

module.exports = { inviteUrl, userInstallUrl, resolveClientId, computePermsBitfield, REQUIRED_PERMS };
