const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome / farewell embeds (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('channel').setDescription('Set the channel for welcome/farewell messages')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('message').setDescription('Customize text (use {user} for the user mention, {server} for server name)')
      .addStringOption((o) => o.setName('kind').setDescription('welcome or farewell').setRequired(true)
        .addChoices({ name: 'welcome', value: 'welcome' }, { name: 'farewell', value: 'farewell' }))
      .addStringOption((o) => o.setName('text').setDescription('Message body').setRequired(true)))
    .addSubcommand((s) => s.setName('off').setDescription('Disable welcome/farewell messages'))
    .addSubcommand((s) => s.setName('show').setDescription('Show current config')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = getGuild(interaction.guildId);
    if (sub === 'channel') {
      const ch = interaction.options.getChannel('channel');
      updateGuild(interaction.guildId, { welcomeChannelId: ch.id });
      return interaction.reply({ content: `✦  Welcome messages will post in ${ch}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'message') {
      const kind = interaction.options.getString('kind');
      const text = interaction.options.getString('text');
      const key = kind === 'welcome' ? 'welcomeMessage' : 'farewellMessage';
      updateGuild(interaction.guildId, { [key]: text });
      return interaction.reply({ content: `✦  ${kind} message set.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'off') {
      updateGuild(interaction.guildId, { welcomeChannelId: null });
      return interaction.reply({ content: '✕  Welcome/farewell messages disabled.', flags: MessageFlags.Ephemeral });
    }
    if (sub === 'show') {
      const lines = [
        `**Channel:** ${cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : '*not set*'}`,
        `**Welcome:** ${cfg.welcomeMessage || '*default*'}`,
        `**Farewell:** ${cfg.farewellMessage || '*default*'}`,
      ];
      return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    }
  },
};
