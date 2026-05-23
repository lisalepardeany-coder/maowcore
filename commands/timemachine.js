const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timemachine')
    .setDescription('Play top hits from a year or decade')
    .addStringOption((o) => o.setName('era').setDescription('Year (e.g. 2010), decade (90s, 2000s), or "random"').setRequired(true)),
  async execute(interaction) {
    const era = interaction.options.getString('era').trim().toLowerCase();
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }

    let query;
    if (era === 'random') {
      const decades = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
      const pick = decades[Math.floor(Math.random() * decades.length)];
      query = `top hits ${pick}`;
    } else if (/^\d{4}$/.test(era)) {
      query = `top hits ${era}`;
    } else if (/^(\d{1,2}|\d{4})s$/.test(era)) {
      query = `top hits ${era}`;
    } else {
      return interaction.reply({
        content: '◌ Try a year (e.g. `2010`), decade (`90s`, `2000s`), or `random`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();
    try {
      const results = await interaction.client.youtubePlugin.search(query, { limit: 10, type: 'video' });
      if (!results?.length) return interaction.editReply(`◌ No hits found for **${era}**.`);
      // Queue all 10 results in random order
      const shuffled = results.sort(() => Math.random() - 0.5);
      for (const r of shuffled) {
        try {
          await interaction.client.distube.play(voice, r.url, {
            textChannel: interaction.channel,
            member: interaction.member,
          });
        } catch { /* skip broken */ }
      }
      return interaction.editReply(`🕰  Time machine engaged — top hits from **${era}** queued.`);
    } catch (e) {
      return interaction.editReply(`▲ Time machine failed: ${e.message}`);
    }
  },
};
