const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const stats = require('../lib/music-stats');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Music stats card: top songs, artists and listeners')
    .addSubcommand((s) => s.setName('show').setDescription('Show the stats card')
      .addStringOption((o) => o.setName('range').setDescription('Time period').addChoices(
        { name: 'Last 24 hours', value: 'day' },
        { name: 'Last 7 days', value: 'week' },
        { name: 'Last 30 days', value: 'month' },
        { name: 'All time', value: 'all' },
      ))
      .addBooleanOption((o) => o.setName('private').setDescription('Only you can see it')))
    .addSubcommand((s) => s.setName('weekly').setDescription('Post the weekly card every Monday (manage server)')
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post it (leave empty to turn off)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'weekly') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '◌ You need the Manage Server permission for this.', flags: MessageFlags.Ephemeral });
      }
      const ch = interaction.options.getChannel('channel');
      if (!ch) {
        updateGuild(interaction.guildId, { weeklyStats: null });
        return interaction.reply({ content: '✕  Weekly stats turned off.', flags: MessageFlags.Ephemeral });
      }
      const me = interaction.guild.members.me;
      if (!ch.permissionsFor(me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return interaction.reply({ content: `◌ I can't post embeds in ${ch}. Give me Send Messages + Embed Links there.`, flags: MessageFlags.Ephemeral });
      }
      const prev = getGuild(interaction.guildId).weeklyStats || {};
      updateGuild(interaction.guildId, { weeklyStats: { channelId: ch.id, lastWeek: prev.lastWeek || null } });
      return interaction.reply({ content: `📊  Every Monday around 10:00 I'll post last week's stats in ${ch}.`, flags: MessageFlags.Ephemeral });
    }
    const range = interaction.options.getString('range') || 'week';
    const s = stats.forGuild(interaction.guildId, range);
    return interaction.reply({
      embeds: [stats.card(interaction.guild?.name || 'This server', s)],
      flags: interaction.options.getBoolean('private') ? MessageFlags.Ephemeral : undefined,
    });
  },
};
