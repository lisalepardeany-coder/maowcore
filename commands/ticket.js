const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const tools = require('../lib/mod-tools');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Help tickets: private threads between a member and staff')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('setup').setDescription('Post the "Open a ticket" button in a channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Where the button goes (tickets become threads here)').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addRoleOption((o) => o.setName('staff').setDescription('Role that gets pinged for new tickets')))
    .addSubcommand((s) => s.setName('off').setDescription('Stop new tickets (open ones stay)')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = getGuild(interaction.guildId).tickets || {};
    if (sub === 'off') {
      updateGuild(interaction.guildId, { tickets: { ...cfg, channelId: null } });
      return interaction.reply({ content: '✕ Tickets turned off.', flags: MessageFlags.Ephemeral });
    }
    const ch = interaction.options.getChannel('channel');
    const me = interaction.guild.members.me;
    const need = ['ViewChannel', 'SendMessages', 'CreatePrivateThreads', 'SendMessagesInThreads', 'ManageThreads'];
    const missing = need.filter((p) => !ch.permissionsFor(me)?.has(p));
    if (missing.length) return interaction.reply({ content: `◌ I need these permissions in ${ch}: ${missing.join(', ')}.`, flags: MessageFlags.Ephemeral });
    const staff = interaction.options.getRole('staff');
    updateGuild(interaction.guildId, { tickets: { ...cfg, channelId: ch.id, staffRoleId: staff?.id || null, open: cfg.open || {} } });
    await ch.send(tools.ticketPanel());
    return interaction.reply({ content: `🎫 Ticket button posted in ${ch}.${staff ? ` ${staff} gets pinged for new tickets.` : ''}`, flags: MessageFlags.Ephemeral });
  },
};
