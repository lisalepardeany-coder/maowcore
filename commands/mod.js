// /mod — all member moderation in one command (Discord allows 100 slash
// commands per server). tempban, tempmute, history, note and modmail come from
// command-parts/mod-tools.js; kick, ban, softban, unban and timeout (formerly
// their own commands) from their files in command-parts/. See
// lib/command-group.js.
//
// Each action still needs its own permission (Kick Members, Ban Members,
// Timeout Members), checked when it runs. Discord shows /mod to people with
// Timeout Members unless the server changes that in Server Settings →
// Integrations.
const { PermissionFlagsBits } = require('discord.js');
const { group } = require('../lib/command-group');
const part = (name, description) => ({ name, module: require(`../command-parts/${name}`), description });

module.exports = group({
  name: 'mod',
  description: 'Moderation: kick, ban, timeout, temp punishments, notes, history, modmail',
  defaultPermission: PermissionFlagsBits.ModerateMembers,
  parts: [
    part('kick', 'Kick a member'),
    part('ban', 'Ban a user (members and IDs)'),
    part('softban', 'Ban and unban at once to delete their recent messages'),
    part('unban', 'Unban a user by ID'),
    part('timeout', 'Time out a member'),
    { name: 'tools', module: require('../command-parts/mod-tools'), flat: true },
  ],
});
