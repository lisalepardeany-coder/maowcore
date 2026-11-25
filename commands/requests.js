const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('requests')
    .setDescription('Song request channel: type a song name or link there to queue it')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('set').setDescription('Use a channel for song requests')
      .addChannelOption((o) => o.setName('channel').setDescription('Text channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName('off').setDescription('Stop using a song request channel'))
    .addSubcommand((s) => s.setName('show').setDescription('Which channel is it?')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const ch = interaction.options.getChannel('channel');
      updateGuild(interaction.guildId, { songRequestChannelId: ch.id });
      ch.send('🎵 **Song requests are on here.** Join a voice channel and type a song name or paste a link to add it to the queue.\nStart a message with `#` to just chat.').catch(() => {});
      return interaction.reply({ content: `✅ Song requests now go in ${ch}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'off') {
      updateGuild(interaction.guildId, { songRequestChannelId: null });
      return interaction.reply({ content: '◌ Song request channel turned off.', flags: MessageFlags.Ephemeral });
    }
    const id = getGuild(interaction.guildId).songRequestChannelId;
    return interaction.reply({ content: id ? `🎵 Song requests: <#${id}>` : '◌ No song request channel. Set one with `/requests set`.', flags: MessageFlags.Ephemeral });
  },
};
