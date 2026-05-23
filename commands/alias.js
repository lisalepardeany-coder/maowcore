const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

const getAliases = (guildId) => {
  const g = getGuild(guildId);
  if (!g.aliases) g.aliases = {};
  return g.aliases;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alias')
    .setDescription('Manage console-command aliases — used in the web dashboard console (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('set').setDescription('Create or update an alias')
        .addStringOption((o) => o.setName('name').setDescription('Alias name (e.g. bops)').setRequired(true))
        .addStringOption((o) => o.setName('expansion').setDescription('What it expands to (e.g. play lofi)').setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Delete an alias')
        .addStringOption((o) => o.setName('name').setDescription('Alias to delete').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub.setName('list').setDescription('List all aliases')),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const aliases = Object.keys(getAliases(interaction.guildId));
    await interaction.respond(aliases.filter((n) => n.includes(focused)).slice(0, 25).map((n) => ({ name: n, value: n })));
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const name = interaction.options.getString('name').toLowerCase().trim();
      const exp = interaction.options.getString('expansion').trim();
      const aliases = getAliases(interaction.guildId);
      aliases[name] = exp;
      updateGuild(interaction.guildId, { aliases });
      return interaction.reply({ content: `✦  Alias **/${name}** → \`${exp}\``, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'remove') {
      const name = interaction.options.getString('name').toLowerCase();
      const aliases = getAliases(interaction.guildId);
      if (!aliases[name]) {
        return interaction.reply({ content: `◌ No alias named **${name}**.`, flags: MessageFlags.Ephemeral });
      }
      delete aliases[name];
      updateGuild(interaction.guildId, { aliases });
      return interaction.reply({ content: `✕  Alias **${name}** removed.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'list') {
      const aliases = getAliases(interaction.guildId);
      const entries = Object.entries(aliases);
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setAuthor({ name: '✦  COMMAND ALIASES' })
        .setDescription(entries.length ? entries.map(([k, v]) => `**/${k}** → \`${v}\``).join('\n') : '*— no aliases configured —*');
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
