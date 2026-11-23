const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { COLORS } = require('../lib/theme');

const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

// Pure (tested): result lines with bars.
const results = (options, counts) => {
  const total = counts.reduce((a, b) => a + b, 0);
  return options.map((o, i) => {
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    const filled = Math.round(pct / 10);
    return `${NUM[i]} **${o}**\n\`${'█'.repeat(filled)}${'░'.repeat(10 - filled)}\` ${pct}% (${counts[i]})`;
  }).join('\n');
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll (buttons, live results, optional picture)')
    .addStringOption((o) => o.setName('question').setDescription('Poll question').setRequired(true).setMaxLength(250))
    .addStringOption((o) => o.setName('options').setDescription('Comma-separated options (2–10)').setRequired(true))
    .addAttachmentOption((o) => o.setName('image').setDescription('A picture to show with the poll'))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Close after this many minutes (default 60)').setMinValue(1).setMaxValue(10080))
    .addBooleanOption((o) => o.setName('multiple').setDescription('Allow picking more than one option')),
  async execute(interaction) {
    const question = interaction.options.getString('question');
    const options = interaction.options.getString('options').split(',').map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 10);
    if (options.length < 2) return interaction.reply({ content: '◌ Need at least 2 options.', flags: MessageFlags.Ephemeral });
    const image = interaction.options.getAttachment('image');
    if (image && !/^image\//.test(image.contentType || '')) return interaction.reply({ content: '◌ The attachment must be a picture.', flags: MessageFlags.Ephemeral });
    const minutes = interaction.options.getInteger('minutes') || 60;
    const multiple = interaction.options.getBoolean('multiple') || false;
    const votes = new Map();   // userId -> Set(indexes)
    const counts = () => options.map((_, i) => [...votes.values()].filter((s) => s.has(i)).length);
    const ends = Date.now() + minutes * 60000;
    const embed = (closed) => {
      const e = new EmbedBuilder().setColor(closed ? 0x99aab5 : COLORS.COSMIC)
        .setAuthor({ name: `📊 Poll by ${interaction.user.username}` })
        .setTitle(question)
        .setDescription(results(options, counts()))
        .setFooter({ text: closed ? `Closed · ${votes.size} voter${votes.size === 1 ? '' : 's'}` : `${multiple ? 'Pick one or more' : 'Pick one'} · ${votes.size} voter${votes.size === 1 ? '' : 's'}` });
      if (!closed) e.setDescription(`${results(options, counts())}\n\nCloses <t:${Math.floor(ends / 1000)}:R>`);
      if (image) e.setImage(image.url);
      return e;
    };
    const rows = (off) => {
      const out = [];
      for (let r = 0; r < options.length; r += 5) {
        out.push(new ActionRowBuilder().addComponents(options.slice(r, r + 5).map((o, j) => new ButtonBuilder()
          .setCustomId(`poll:${r + j}`).setLabel(o.slice(0, 40)).setEmoji(NUM[r + j]).setStyle(ButtonStyle.Secondary).setDisabled(off))));
      }
      return out;
    };
    const msg = await interaction.reply({ embeds: [embed(false)], components: rows(false), withResponse: true }).then((r) => r.resource?.message);
    if (!msg) return null;
    // Collectors can't outlive a restart; long polls still close cleanly if the bot keeps running.
    const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: Math.min(minutes * 60000, 2 ** 31 - 1) });
    col.on('collect', async (i) => {
      const idx = Number(i.customId.split(':')[1]);
      const mine = votes.get(i.user.id) || new Set();
      if (multiple) { if (mine.has(idx)) mine.delete(idx); else mine.add(idx); } else if (mine.has(idx)) mine.clear(); else { mine.clear(); mine.add(idx); }
      if (mine.size) votes.set(i.user.id, mine); else votes.delete(i.user.id);
      await i.update({ embeds: [embed(false)] }).catch(() => {});
    });
    col.on('end', () => msg.edit({ embeds: [embed(true)], components: rows(true) }).catch(() => {}));
    return null;
  },
  _test: { results },
};
