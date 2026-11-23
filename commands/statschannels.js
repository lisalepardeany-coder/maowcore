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

    // Deleting a few channels can take longer than Discord's 3s reply window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const removeOld = async () => {
      for (const id of Object.values(cfg.statsChannels || {})) {
        const ch = interaction.guild.channels.cache.get(id);
        if (ch) await ch.delete('Stats channels replaced/removed').catch(() => {});
      }
    };

    if (sub === 'create') {
      // Running create again used to leave the old set behind as duplicates.
      await removeOld();
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
          // Don't leave half a set behind.
          for (const id of Object.values(created)) {
            await interaction.guild.channels.cache.get(id)?.delete('Stats setup failed').catch(() => {});
          }
          updateGuild(interaction.guildId, { statsChannels: null });
          return interaction.editReply(`▲ Failed to create ${key} channel: ${e.message}`);
        }
      }
      updateGuild(interaction.guildId, { statsChannels: created });
      return interaction.editReply(`✦  Stats channels created. They'll auto-update every 10 minutes.`);
    }

    if (sub === 'remove') {
      await removeOld();
      updateGuild(interaction.guildId, { statsChannels: null });
      return interaction.editReply('✕  Stats channels removed.');
    }
  },
};
