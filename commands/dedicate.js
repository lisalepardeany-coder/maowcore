const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dedicate')
    .setDescription('Queue a song with a dedication note shown in Now Transmitting')
    .addStringOption((opt) => opt.setName('query').setDescription('URL or search').setRequired(true))
    .addStringOption((opt) => opt.setName('for').setDescription('Who/what it is for').setRequired(true))
    .addStringOption((opt) => opt.setName('note').setDescription('Optional message').setRequired(false)),
  async execute(interaction) {
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    const query = interaction.options.getString('query');
    const recipient = interaction.options.getString('for');
    const note = interaction.options.getString('note') || '';
    await interaction.deferReply();
    try {
      await interaction.client.distube.play(voice, query, {
        textChannel: interaction.channel,
        member: interaction.member,
        metadata: { dedicatedTo: recipient, dedicationNote: note },
      });
      const queue = interaction.client.distube.getQueue(interaction.guildId);
      // Attach dedication to the just-queued song (last one in queue)
      const target = queue?.songs?.[queue.songs.length - 1];
      if (target) target.dedication = { to: recipient, note };
      return interaction.editReply(`✦  Dedicated to **${recipient}**${note ? ` — "${note}"` : ''}.`);
    } catch (err) {
      return interaction.editReply(`▲ Dedication failed: ${err.message || err}`);
    }
  },
};
