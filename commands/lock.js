const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const modlog = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock the current channel (or all text channels with /lock all)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addBooleanOption((o) => o.setName('all').setDescription('Lock every text channel in the server (emergency mode)')),
  async execute(interaction) {
    const all = interaction.options.getBoolean('all') || false;
    const targets = all
      ? [...interaction.guild.channels.cache.values()].filter((c) => c.type === ChannelType.GuildText)
      : [interaction.channel];
    // Discord interactions time out after 3s. Iterating 50+ channels with
    // per-channel awaits blows past that, so defer when locking everything.
    if (all) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let count = 0;
    for (const ch of targets) {
      try {
        await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
        count++;
      } catch { /* skip */ }
    }
    modlog.post(interaction.guild, {
      action: 'lock',
      target: all ? `${count} channels` : interaction.channel.name,
      mod: interaction.user,
    });
    const msg = `🔒  Locked ${all ? `${count} channels` : `**#${interaction.channel.name}**`}.`;
    return all ? interaction.editReply(msg) : interaction.reply(msg);
  },
};
