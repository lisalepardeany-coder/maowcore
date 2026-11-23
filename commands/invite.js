const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { COLORS } = require('../lib/theme');
const { inviteUrl, userInstallUrl, resolveClientId } = require('../lib/invite');

module.exports = {
  everywhere: true,
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Get links to add MaowCore to a server or to your own account'),
  async execute(interaction) {
    const clientId = resolveClientId(interaction.client);
    const url = inviteUrl(clientId);
    if (!url) {
      return interaction.reply({
        content: '▲ Could not build invite link — client ID unavailable.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: '✦  COSMIC UPLINK' })
      .setTitle('Invite MaowCore')
      .setDescription([
        '**Add to server** — the full bot: music, moderation, setup.',
        'Grants every permission the bot actually uses. No Administrator.',
        '',
        '**Add to my account** — use the portable commands (`/lyrics`, `/nowplaying`,',
        '`/meme`, `/avatar`, `/remind`) in DMs, group chats and any server.',
      ].join('\n'))
      .setFooter({ text: 'Or paste the URL directly into a browser.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('✦ Add to server').setStyle(ButtonStyle.Link).setURL(url),
      new ButtonBuilder().setLabel('✧ Add to my account').setStyle(ButtonStyle.Link).setURL(userInstallUrl(clientId)),
    );
    return interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};
