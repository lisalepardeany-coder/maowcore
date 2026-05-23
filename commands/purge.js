const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const modlog = require('../lib/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk-delete recent messages (skips pinned)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName('count').setDescription('How many (2–100)').setRequired(true).setMinValue(2).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Only delete from this user').setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const count = interaction.options.getInteger('count');
    const user = interaction.options.getUser('user');
    try {
      const fetched = await interaction.channel.messages.fetch({ limit: 100 });
      const candidates = [...fetched.values()].filter((m) => !m.pinned && (!user || m.author.id === user.id)).slice(0, count);
      const deleted = await interaction.channel.bulkDelete(candidates, true);
      modlog.post(interaction.guild, {
        action: 'purge',
        target: user || `${deleted.size} message${deleted.size === 1 ? '' : 's'}`,
        mod: interaction.user,
        reason: `In #${interaction.channel.name}`,
      });
      return interaction.editReply(`🧹  Deleted ${deleted.size} message${deleted.size === 1 ? '' : 's'}.`);
    } catch (e) {
      return interaction.editReply(`▲ ${e.message} (Discord only bulk-deletes messages newer than 14 days.)`);
    }
  },
};
