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
      // Pass dedication via DisTube metadata; the playSong handler in
      // index.js attaches `song.dedication` from metadata on the actual song
      // object. The previous approach (set dedication on queue.songs[last]
      // after play resolves) was racy when other plays interleaved.
      await interaction.client.distube.play(voice, query, {
        textChannel: interaction.channel,
        member: interaction.member,
        metadata: { dedication: { to: recipient, note } },
      });
      return interaction.editReply(`✦  Dedicated to **${recipient}**${note ? ` — "${note}"` : ''}.`);
    } catch (err) {
      return interaction.editReply(`▲ Dedication failed: ${err.message || err}`);
    }
  },
};
