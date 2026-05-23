const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');
const { COLORS } = require('../lib/theme');
const { fmtTotal, loopLabel } = require('../lib/format');

const PAGE = 10;

const buildEmbed = (queue, page) => {
  const upcoming = queue.songs.slice(1);
  const totalPages = Math.max(1, Math.ceil(upcoming.length / PAGE));
  page = Math.max(0, Math.min(page, totalPages - 1));
  const start = page * PAGE;
  const slice = upcoming.slice(start, start + PAGE);

  const list =
    slice
      .map(
        (s, i) =>
          `\`${String(start + i + 1).padStart(2, '0')}\`  ✦ **${s.name}**  \`${s.formattedDuration}\``,
      )
      .join('\n') || '*— cargo hold empty —*';

  const totalSec = queue.songs.reduce((a, s) => a + (s.duration || 0), 0);
  const current = queue.songs[0];

  return {
    embed: new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: '✦  TRANSMISSION QUEUE' })
      .setDescription(
        `**◇ Now transmitting**\n› **${current.name}** \`${current.formattedDuration}\`\n\n**◇ Up next** *(page ${page + 1}/${totalPages})*\n${list}`,
      )
      .setFooter({
        text: `⟡ ${queue.songs.length} signals · ${fmtTotal(totalSec)} total · vol ${queue.volume}% · loop ${loopLabel(queue.repeatMode)}`,
      }),
    totalPages,
    page,
  };
};

const buildNav = (page, totalPages) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('queue:first').setLabel('⏮').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('queue:prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('queue:next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId('queue:last').setLabel('⏭').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );

module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription('View the transmission queue'),
  async execute(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guildId);
    if (!queue) {
      return interaction.reply({ content: '◌ Queue is empty.', flags: MessageFlags.Ephemeral });
    }
    let page = 0;
    const { embed, totalPages } = buildEmbed(queue, page);
    const reply = await interaction.reply({
      embeds: [embed],
      components: totalPages > 1 ? [buildNav(page, totalPages)] : [],
      withResponse: true,
    });
    const msg = reply.resource?.message;
    if (!msg || totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 3 * 60 * 1000,
      filter: (i) => i.customId.startsWith('queue:'),
    });
    collector.on('collect', async (btn) => {
      const q = interaction.client.distube.getQueue(interaction.guildId);
      if (!q) return btn.update({ components: [] }).catch(() => {});
      if (btn.customId === 'queue:first') page = 0;
      else if (btn.customId === 'queue:prev') page--;
      else if (btn.customId === 'queue:next') page++;
      else if (btn.customId === 'queue:last') page = Number.MAX_SAFE_INTEGER;
      const next = buildEmbed(q, page);
      page = next.page;
      await btn.update({ embeds: [next.embed], components: [buildNav(page, next.totalPages)] });
    });
    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
