const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion to the configured suggestions channel')
    .addStringOption((o) => o.setName('text').setDescription('Your suggestion').setRequired(true)),
  async execute(interaction) {
    const text = interaction.options.getString('text');
    const cfg = getGuild(interaction.guildId);
    const ch = cfg.suggestionsChannelId ? interaction.guild.channels.cache.get(cfg.suggestionsChannelId) : null;
    if (!ch) {
      return interaction.reply({ content: '◌ No suggestions channel configured. Run `/setup` or `/setsuggestions`.', flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: `💡 Suggestion by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(text)
      .setTimestamp();
    const msg = await ch.send({ embeds: [embed] });
    await msg.react('👍').catch(() => {});
    await msg.react('👎').catch(() => {});
    return interaction.reply({ content: `✦  Suggestion posted in ${ch}.`, flags: MessageFlags.Ephemeral });
  },
};
