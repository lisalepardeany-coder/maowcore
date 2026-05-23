const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('statschannels')
    .setDescription('Create auto-updating voice channels with server stats (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) => s.setName('create').setDescription('Create the stats voice channels'))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove the stats voice channels')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = getGuild(interaction.guildId);

    if (sub === 'create') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const created = {};
      for (const [key, label] of [['members', '◆ Members:'], ['bots', '✦ Bots:'], ['channels', '⌬ Channels:']]) {
        try {
          const ch = await interaction.guild.channels.create({
            name: `${label} —`,
            type: ChannelType.GuildVoice,
            permissionOverwrites: [
              { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.Connect] },
            ],
          });
          created[key] = ch.id;
        } catch (e) {
          return interaction.editReply(`▲ Failed to create ${key} channel: ${e.message}`);
        }
      }
      updateGuild(interaction.guildId, { statsChannels: created });
      return interaction.editReply(`✦  Stats channels created. They'll auto-update every 10 minutes.`);
    }

    if (sub === 'remove') {
      const ids = cfg.statsChannels || {};
      for (const id of Object.values(ids)) {
        const ch = interaction.guild.channels.cache.get(id);
        if (ch) await ch.delete().catch(() => {});
      }
      updateGuild(interaction.guildId, { statsChannels: null });
      return interaction.reply({ content: '✕  Stats channels removed.', flags: MessageFlags.Ephemeral });
    }
  },
};
