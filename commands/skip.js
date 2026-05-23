const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');
const { requireQueue } = require('../lib/guards');
const { getGuild } = require('../lib/config');

const VOTE_WINDOW_MS = 30_000;
const activeVotes = new Map(); // guildId -> { voters: Set, message }

const isDJ = (member, cfg) => {
  if (!cfg.djRoleId) return false;
  return member.roles?.cache?.has(cfg.djRoleId);
};

const isAdmin = (member) => member.permissions?.has('ManageGuild');

module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Warp to the next signal (vote-skip if DJ role is set)'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const cfg = getGuild(interaction.guildId);
    const voteRatio = cfg.voteSkipRatio ?? 0.5;

    // DJ / admin / requester → instant skip
    const member = interaction.member;
    const requester = queue.songs[0]?.user;
    const isRequester = requester && member.user.id === requester.id;
    if (isAdmin(member) || isDJ(member, cfg) || isRequester || !cfg.djRoleId) {
      try {
        const next = await queue.skip();
        return interaction.reply(`⏭  Warping to next signal — **${next.name}**`);
      } catch {
        queue.stop();
        return interaction.reply('⏭  No further signals — engines offline.');
      }
    }

    // Vote-skip path
    const voiceChannel = queue.voice?.channel;
    const listeners = voiceChannel ? [...voiceChannel.members.values()].filter((m) => !m.user.bot) : [];
    const needed = Math.max(2, Math.ceil(listeners.length * voteRatio));
    let vote = activeVotes.get(interaction.guildId);
    if (!vote) {
      vote = { voters: new Set([member.user.id]), createdAt: Date.now() };
      activeVotes.set(interaction.guildId, vote);
    } else {
      vote.voters.add(member.user.id);
    }
    if (vote.voters.size >= needed) {
      activeVotes.delete(interaction.guildId);
      try {
        const next = await queue.skip();
        return interaction.reply(`✦  Skip vote passed (${vote.voters.size}/${needed}) — now **${next.name}**`);
      } catch {
        queue.stop();
        return interaction.reply('✦  Skip vote passed — engines offline.');
      }
    }
    // Set expiry once
    if (!vote.timer) {
      vote.timer = setTimeout(() => activeVotes.delete(interaction.guildId), VOTE_WINDOW_MS);
    }
    return interaction.reply(`✦  Skip vote registered (${vote.voters.size}/${needed}). 30s window.`);
  },
};
