const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const modlog = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock the current channel (or all with /unlock all)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addBooleanOption((o) => o.setName('all').setDescription('Unlock every text channel')),
  async execute(interaction) {
    const all = interaction.options.getBoolean('all') || false;
    const targets = all
      ? [...interaction.guild.channels.cache.values()].filter((c) => c.type === ChannelType.GuildText)
      : [interaction.channel];
    let count = 0;
    for (const ch of targets) {
      try {
        await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
        count++;
      } catch { /* skip */ }
    }
    modlog.post(interaction.guild, {
      action: 'unlock',
      target: all ? `${count} channels` : interaction.channel.name,
      mod: interaction.user,
    });
    return interaction.reply(`🔓  Unlocked ${all ? `${count} channels` : `**#${interaction.channel.name}**`}.`);
  },
};
