const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

const SLOT_COUNT = 4;

const getSlots = (guildId) => {
  const g = getGuild(guildId);
  if (!Array.isArray(g.quickPlaylists)) g.quickPlaylists = new Array(SLOT_COUNT).fill(null);
  while (g.quickPlaylists.length < SLOT_COUNT) g.quickPlaylists.push(null);
  return g.quickPlaylists;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quickset')
    .setDescription('Configure the Quick Playlist slots shown on the dashboard (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('set').setDescription('Set a slot')
        .addIntegerOption((o) => o.setName('slot').setDescription('Slot 1-4').setRequired(true).setMinValue(1).setMaxValue(SLOT_COUNT))
        .addStringOption((o) => o.setName('label').setDescription('Display name').setRequired(true))
        .addStringOption((o) => o.setName('url').setDescription('URL (playlist or single track)').setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('clear').setDescription('Clear a slot')
        .addIntegerOption((o) => o.setName('slot').setDescription('Slot 1-4').setRequired(true).setMinValue(1).setMaxValue(SLOT_COUNT)))
    .addSubcommand((sub) => sub.setName('list').setDescription('Show current slots')),
  async execute(interaction) {
    const slots = getSlots(interaction.guildId);
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const slot = interaction.options.getInteger('slot') - 1;
      slots[slot] = {
        label: interaction.options.getString('label'),
        url: interaction.options.getString('url'),
      };
      updateGuild(interaction.guildId, { quickPlaylists: slots });
      return interaction.reply({ content: `✦  Slot ${slot + 1} set: **${slots[slot].label}**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'clear') {
      const slot = interaction.options.getInteger('slot') - 1;
      slots[slot] = null;
      updateGuild(interaction.guildId, { quickPlaylists: slots });
      return interaction.reply({ content: `✕  Slot ${slot + 1} cleared.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'list') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setAuthor({ name: '⚡  QUICK PLAYLISTS' })
        .setDescription(slots.map((s, i) => s ? `\`${i + 1}.\` **${s.label}** — ${s.url}` : `\`${i + 1}.\` *empty*`).join('\n'));
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
