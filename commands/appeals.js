const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('appeals')
    .setDescription('Let banned people send one appeal (ban members)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addChannelOption((o) => o.setName('channel').setDescription('Where appeals arrive (empty = turn off)').addChannelTypes(ChannelType.GuildText)),
  async execute(interaction) {
    const ch = interaction.options.getChannel('channel');
    if (ch && !ch.permissionsFor(interaction.guild.members.me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return interaction.reply({ content: `◌ I need Send Messages + Embed Links in ${ch}.`, flags: MessageFlags.Ephemeral });
    }
    updateGuild(interaction.guildId, { appeals: { channelId: ch?.id || null } });
    return interaction.reply({
      content: ch
        ? `📝 Appeals are on. When someone is banned (with /ban or the panel) they get a DM with an **Appeal** button; appeals arrive in ${ch} with Accept / Deny buttons. One appeal per person per day.`
        : '✕ Appeals turned off.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
