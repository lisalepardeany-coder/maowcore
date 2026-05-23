const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const tts = require('../lib/tts');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Speak text aloud in the voice channel via TTS')
    .addStringOption((opt) => opt.setName('text').setDescription('What to say').setRequired(true))
    .addStringOption((opt) => opt.setName('lang').setDescription('Language code (en, es, fr, etc.)').setRequired(false)),
  async execute(interaction) {
    const text = interaction.options.getString('text');
    const lang = interaction.options.getString('lang') || 'en';
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    const urls = tts.speakUrls(text, lang);
    for (const url of urls) {
      try {
        await interaction.client.distube.play(voice, url, {
          textChannel: interaction.channel,
          member: interaction.member,
        });
      } catch { /* ignored */ }
    }
    return interaction.editReply(`🔊  Speaking: *${text.slice(0, 100)}*`);
  },
};
