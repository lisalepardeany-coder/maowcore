const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { COLORS } = require('../lib/theme');

const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll with reaction-based voting')
    .addStringOption((o) => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption((o) => o.setName('options').setDescription('Comma-separated options (2–10)').setRequired(true)),
  async execute(interaction) {
    const question = interaction.options.getString('question');
    const options = interaction.options.getString('options').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (options.length < 2) {
      return interaction.reply({ content: '◌ Need at least 2 options.', flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: `📊 Poll by ${interaction.user.username}` })
      .setTitle(question)
      .setDescription(options.map((o, i) => `${EMOJIS[i]} ${o}`).join('\n'))
      .setFooter({ text: 'React to vote' });
    await interaction.reply({ embeds: [embed] });
    const msg = await interaction.fetchReply();
    for (let i = 0; i < options.length; i++) await msg.react(EMOJIS[i]).catch(() => {});
  },
};
