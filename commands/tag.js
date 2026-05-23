const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

const getTags = (guildId) => {
  const g = getGuild(guildId);
  if (!g.tags) g.tags = {};
  return g.tags;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Manage server snippets/quick-responses')
    .addSubcommand((s) => s.setName('add').setDescription('Add a tag (mod only)')
      .addStringOption((o) => o.setName('name').setDescription('Tag name').setRequired(true))
      .addStringOption((o) => o.setName('content').setDescription('Tag content').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a tag (mod only)')
      .addStringOption((o) => o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('show').setDescription('Show a tag')
      .addStringOption((o) => o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List all tags')),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const names = Object.keys(getTags(interaction.guildId)).filter((n) => n.includes(focused));
    await interaction.respond(names.slice(0, 25).map((n) => ({ name: n, value: n })));
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const tags = getTags(interaction.guildId);
    if (sub === 'add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '◌ Mods only.', flags: MessageFlags.Ephemeral });
      }
      const name = interaction.options.getString('name').toLowerCase().trim();
      tags[name] = interaction.options.getString('content');
      updateGuild(interaction.guildId, { tags });
      return interaction.reply({ content: `✦  Tag **${name}** saved.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'remove') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '◌ Mods only.', flags: MessageFlags.Ephemeral });
      }
      const name = interaction.options.getString('name').toLowerCase();
      delete tags[name];
      updateGuild(interaction.guildId, { tags });
      return interaction.reply({ content: `✕  Tag **${name}** removed.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'show') {
      const name = interaction.options.getString('name').toLowerCase();
      const t = tags[name];
      if (!t) return interaction.reply({ content: `◌ No tag named **${name}**.`, flags: MessageFlags.Ephemeral });
      return interaction.reply(t);
    }
    if (sub === 'list') {
      const names = Object.keys(tags).sort();
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setAuthor({ name: '✦  Server Tags' })
        .setDescription(names.length ? names.map((n) => `\`${n}\``).join(' · ') : '*— no tags —*');
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
