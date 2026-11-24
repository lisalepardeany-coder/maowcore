const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const { getGuild } = require('../lib/config');
const voteSkip = require('../lib/vote-skip');

module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the song (a vote when a DJ role is set)'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const r = await voteSkip.request(interaction, queue, getGuild(interaction.guildId));
    const { ephemeral, ...reply } = r;
    return interaction.reply(ephemeral ? { ...reply, flags: MessageFlags.Ephemeral } : reply);
  },
};
