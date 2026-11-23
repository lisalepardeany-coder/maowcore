// /starboard: messages with enough ⭐ get reposted in a channel (lib/starboard.js).
const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const { DEFAULT_THRESHOLD } = require('../lib/starboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Repost messages that get enough ⭐ reactions (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('channel').setDescription('Turn it on: the channel starred messages go to')
      .addChannelOption((o) => o.setName('channel').setDescription('Starboard channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('stars').setDescription(`How many ⭐ a message needs (default ${DEFAULT_THRESHOLD})`)
      .addIntegerOption((o) => o.setName('count').setDescription('Stars needed').setRequired(true).setMinValue(1).setMaxValue(100)))
    .addSubcommand((s) => s.setName('selfstar').setDescription('Should the author\'s own ⭐ count?')
      .addBooleanOption((o) => o.setName('allow').setDescription('Count the author\'s own star').setRequired(true)))
    .addSubcommand((s) => s.setName('off').setDescription('Turn the starboard off'))
    .addSubcommand((s) => s.setName('show').setDescription('Show the starboard settings')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId;
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (sub === 'channel') {
      const ch = interaction.options.getChannel('channel');
      updateGuild(gid, { starboardChannelId: ch.id });
      return reply(`⭐ Starboard on: messages with **${getGuild(gid).starboardThreshold || DEFAULT_THRESHOLD}** ⭐ go to ${ch}. Make sure I can post there.`);
    }
    if (sub === 'stars') {
      const n = interaction.options.getInteger('count');
      updateGuild(gid, { starboardThreshold: n });
      return reply(`⭐ A message now needs **${n}** ⭐.`);
    }
    if (sub === 'selfstar') {
      const allow = interaction.options.getBoolean('allow');
      updateGuild(gid, { starboardSelfStar: allow });
      return reply(allow ? '⭐ The author\'s own star counts now.' : '⭐ The author\'s own star doesn\'t count.');
    }
    if (sub === 'off') {
      updateGuild(gid, { starboardChannelId: null });
      return reply('✕ Starboard off.');
    }
    const cfg = getGuild(gid);
    return reply([
      `**Channel:** ${cfg.starboardChannelId ? `<#${cfg.starboardChannelId}>` : '*off*'}`,
      `**Stars needed:** ${cfg.starboardThreshold || DEFAULT_THRESHOLD}`,
      `**Author's own star counts:** ${cfg.starboardSelfStar ? 'yes' : 'no'}`,
    ].join('\n'));
  },
};
