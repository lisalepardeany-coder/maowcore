const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const modlog = require('../lib/modlog');
const hierarchy = require('../lib/hierarchy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Add or remove a role from a member (mod only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName('add').setDescription('Grant a role')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Revoke a role')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '◌ Member not found.', flags: MessageFlags.Ephemeral });
    // Like Discord's own menu: only roles below your highest role, and only on
    // members below you (otherwise Manage Roles could hand out Admin).
    const actor = await hierarchy.actorOf(interaction);
    if (!hierarchy.canAssignRole(actor, role)) return interaction.reply({ content: hierarchy.ROLE_MSG, flags: MessageFlags.Ephemeral });
    if (!hierarchy.canModerate(actor, member, { allowSelf: true })) return interaction.reply({ content: hierarchy.MOD_MSG, flags: MessageFlags.Ephemeral });
    try {
      if (sub === 'add') {
        await member.roles.add(role);
        modlog.post(interaction.guild, { action: 'role-add', target: user, mod: interaction.user, reason: `+${role.name}` });
        return interaction.reply(`✦  Added **${role.name}** to ${user}.`);
      } else {
        await member.roles.remove(role);
        modlog.post(interaction.guild, { action: 'role-remove', target: user, mod: interaction.user, reason: `-${role.name}` });
        return interaction.reply(`✕  Removed **${role.name}** from ${user}.`);
      }
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
