const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const favorites = require('../lib/favorites');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('favorite')
    .setDescription('Star or list favorite signals')
    .addSubcommand((sub) => sub.setName('add').setDescription('Star the current signal'))
    .addSubcommand((sub) =>
      sub.setName('remove').setDescription('Un-star by URL')
        .addStringOption((o) => o.setName('url').setDescription('Song URL').setRequired(true)))
    .addSubcommand((sub) => sub.setName('list').setDescription('List your favorites')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      const queue = await requireQueue(interaction);
      if (!queue) return;
      const song = queue.songs[0];
      try {
        const added = favorites.add(interaction.guildId, interaction.user.id, song);
        return interaction.reply({
          content: added ? `★  Starred **${song.name}**.` : `★  Already in your favorites.`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (e) {
        return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
      }
    }
    if (sub === 'remove') {
      const url = interaction.options.getString('url');
      const removed = favorites.remove(interaction.guildId, interaction.user.id, url);
      return interaction.reply({
        content: removed ? `✕  Un-starred.` : `◌ Not in your favorites.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (sub === 'list') {
      const list = favorites.listFor(interaction.guildId, interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setAuthor({ name: '★  YOUR FAVORITES' })
        .setDescription(
          list.length
            ? list.slice(0, 25).map((s, i) => `\`${i + 1}.\` **[${s.name}](${s.url})** \`${s.formattedDuration || ''}\``).join('\n')
            : '*— no favorites yet —*\nUse `/favorite add` while a song is playing.'
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
