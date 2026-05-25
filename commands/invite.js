const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { COLORS } = require('../lib/theme');
const { inviteUrl, resolveClientId } = require('../lib/invite');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get the OAuth2 link to invite MaowCore to another server'),
  async execute(interaction) {
    const url = inviteUrl(resolveClientId(interaction.client));
    if (!url) {
      return interaction.reply({
        content: '▲ Could not build invite link — client ID unavailable.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: '✦  COSMIC UPLINK' })
      .setTitle('Invite MaowCore to your server')
      .setDescription([
        'Click the button below to add MaowCore to another server.',
        '',
        'The link grants every permission the bot actually uses — music',
        'playback, moderation tools, channel/role management. No Administrator.',
      ].join('\n'))
      .setFooter({ text: 'Or paste the URL directly into a browser.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('✦ Invite').setStyle(ButtonStyle.Link).setURL(url),
    );
    return interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};
