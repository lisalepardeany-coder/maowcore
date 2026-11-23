const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Roles given automatically when someone joins (manage roles)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName('add').setDescription('Give this role to new members')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Stop giving this role')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show auto-roles'))
    .addSubcommand((s) => s.setName('bots').setDescription('Also give auto-roles to bots?')
      .addBooleanOption((o) => o.setName('on').setDescription('On or off').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = { roles: [], bots: false, ...(getGuild(interaction.guildId).autoRoles || {}) };
    const save = () => updateGuild(interaction.guildId, { autoRoles: cfg });
    if (sub === 'add') {
      const role = interaction.options.getRole('role');
      const me = interaction.guild.members.me;
      if (role.managed || role.id === interaction.guildId) return interaction.reply({ content: '◌ That role can\'t be given by bots.', flags: MessageFlags.Ephemeral });
      if (role.position >= me.roles.highest.position) return interaction.reply({ content: `◌ Move my role above ${role} first, then try again.`, flags: MessageFlags.Ephemeral });
      if (!cfg.roles.includes(role.id)) cfg.roles.push(role.id);
      if (cfg.roles.length > 10) return interaction.reply({ content: '◌ Up to 10 auto-roles.', flags: MessageFlags.Ephemeral });
      save();
      return interaction.reply({ content: `✓ New members now get ${role}.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'remove') {
      const role = interaction.options.getRole('role');
      cfg.roles = cfg.roles.filter((id) => id !== role.id);
      save();
      return interaction.reply({ content: `✕ ${role} is no longer given on join.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'bots') {
      cfg.bots = interaction.options.getBoolean('on');
      save();
      return interaction.reply({ content: `Bots ${cfg.bots ? 'will' : 'won\'t'} get auto-roles.`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({
      content: cfg.roles.length ? `New members get: ${cfg.roles.map((id) => `<@&${id}>`).join(', ')}${cfg.bots ? ' (bots too)' : ''}` : '◌ No auto-roles yet. Add one with `/autorole add`.',
      flags: MessageFlags.Ephemeral, allowedMentions: { roles: [] },
    });
  },
};
