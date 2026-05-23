const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const modlog = require('../lib/modlog');

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
