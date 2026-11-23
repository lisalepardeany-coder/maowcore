const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');
const PACKS = require('../lib/trivia-packs');
const fun = require('../lib/fun');

const running = new Set();   // channel ids
const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
// Pure (tested): build rounds from a pack, answers shuffled, correct index kept.
const buildRounds = (packKey, n) => {
  const pool = packKey === 'mix' ? Object.values(PACKS).flatMap((p) => p.q) : PACKS[packKey].q;
  return shuffle(pool).slice(0, n).map(([q, ...answers]) => {
    const order = shuffle([0, 1, 2, 3]);
    return { q, answers: order.map((i) => answers[i]), correct: order.indexOf(0) };
  });
};
const L = ['A', 'B', 'C', 'D'];
const SECONDS = 15;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Trivia for everyone in the channel (+5 coins per right answer)')
    .addStringOption((o) => o.setName('pack').setDescription('Topic').setRequired(true)
      .addChoices({ name: '🎲 Mix of everything', value: 'mix' }, ...Object.entries(PACKS).map(([value, p]) => ({ name: p.name, value }))))
    .addIntegerOption((o) => o.setName('questions').setDescription('How many (default 5)').setMinValue(1).setMaxValue(12)),
  async execute(interaction) {
    if (running.has(interaction.channelId)) return interaction.reply({ content: '◌ A trivia game is already running here.', flags: MessageFlags.Ephemeral });
    const pack = interaction.options.getString('pack');
    const rounds = buildRounds(pack, interaction.options.getInteger('questions') || 5);
    running.add(interaction.channelId);
    const scores = new Map();
    const name = pack === 'mix' ? '🎲 Mix' : PACKS[pack].name;
    await interaction.reply(`🧠 **Trivia: ${name}** — ${rounds.length} questions, ${SECONDS} s each. Everyone can answer once per question!`);
    try {
      for (let r = 0; r < rounds.length; r++) {
        const round = rounds[r];
        const answered = new Map();   // userId -> index
        const row = (done) => new ActionRowBuilder().addComponents(round.answers.map((a, i) => new ButtonBuilder()
          .setCustomId(`trv:${i}`).setLabel(`${L[i]}. ${a}`.slice(0, 80))
          .setStyle(done ? (i === round.correct ? ButtonStyle.Success : ButtonStyle.Secondary) : ButtonStyle.Primary).setDisabled(done)));
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`Question ${r + 1}/${rounds.length}`).setDescription(`**${round.q}**`).setFooter({ text: `${SECONDS} seconds…` });
        const msg = await interaction.channel.send({ embeds: [embed], components: [row(false)] });
        await new Promise((resolve) => {
          const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: SECONDS * 1000 });
          col.on('collect', (i) => {
            if (answered.has(i.user.id)) return i.reply({ content: 'You already answered this one!', flags: MessageFlags.Ephemeral });
            answered.set(i.user.id, Number(i.customId.split(':')[1]));
            return i.reply({ content: `Locked in: **${L[Number(i.customId.split(':')[1])]}**`, flags: MessageFlags.Ephemeral });
          });
          col.on('end', resolve);
        });
        const right = [...answered].filter(([, a]) => a === round.correct).map(([u]) => u);
        right.forEach((u) => { scores.set(u, (scores.get(u) || 0) + 1); fun.reward(interaction.guildId, u, 5, 'trivia'); });
        await msg.edit({
          embeds: [embed.setFooter({ text: `Answer: ${L[round.correct]}. ${round.answers[round.correct]}` })
            .setDescription(`**${round.q}**\n\n✅ ${right.length ? right.map((u) => `<@${u}>`).join(', ') : 'Nobody got it!'}`)],
          components: [row(true)],
        }).catch(() => {});
      }
      const top = [...scores].sort((a, b) => b[1] - a[1]);
      await interaction.channel.send({
        content: top.length ? `🏆 **Final scores**\n${top.map(([u, s], i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} <@${u}> — ${s}`).join('\n')}` : '🏁 Game over — nobody scored. Rematch?',
        allowedMentions: { users: [] },
      });
    } finally {
      running.delete(interaction.channelId);
    }
    return null;
  },
  _test: { buildRounds },
};
