const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Change a member\'s nickname (mod only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('nickname').setDescription('New nickname (omit to reset)').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const nickname = interaction.options.getString('nickname') || null;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '◌ Member not found.', flags: MessageFlags.Ephemeral });
    try {
      await member.setNickname(nickname);
      return interaction.reply(`✦  ${user} is now **${nickname || user.username}**.`);
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
