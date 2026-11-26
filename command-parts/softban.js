const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const modlog = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Ban then immediately unban — purges their recent messages without permanent ban')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Softban — message purge.';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member && !member.bannable) return interaction.reply({ content: '◌ I cannot ban this member (role hierarchy).', flags: MessageFlags.Ephemeral });
    const hierarchy = require('../lib/hierarchy');
    if (!hierarchy.canModerate(await hierarchy.actorOf(interaction), member)) return interaction.reply({ content: hierarchy.MOD_MSG, flags: MessageFlags.Ephemeral });
    try {
      await interaction.guild.bans.create(user.id, { reason, deleteMessageSeconds: 7 * 86400 });
      await interaction.guild.bans.remove(user.id, 'softban release');
      modlog.post(interaction.guild, { action: 'softban', target: user, mod: interaction.user, reason });
      return interaction.reply(`🌀  Softbanned **${user.tag}** — their last 7 days of messages were purged.`);
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
