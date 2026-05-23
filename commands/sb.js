const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const SOUND_DIR = path.join(__dirname, '..', 'data', 'sounds');

const listSounds = () => {
  try {
    if (!fs.existsSync(SOUND_DIR)) return [];
    return fs.readdirSync(SOUND_DIR).filter((f) => /\.(mp3|wav|ogg|m4a)$/i.test(f)).map((f) => path.basename(f, path.extname(f)));
  } catch { return []; }
};

const findSound = (name) => {
  if (!fs.existsSync(SOUND_DIR)) return null;
  const files = fs.readdirSync(SOUND_DIR);
  return files.find((f) => path.basename(f, path.extname(f)).toLowerCase() === name.toLowerCase()) || null;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sb')
    .setDescription('Play a soundboard clip from data/sounds/')
    .addStringOption((opt) => opt.setName('name').setDescription('Sound name').setRequired(true).setAutocomplete(true)),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const names = listSounds().filter((n) => n.toLowerCase().includes(focused));
    await interaction.respond(names.slice(0, 25).map((n) => ({ name: n, value: n })));
  },
  async execute(interaction) {
    const name = interaction.options.getString('name');
    const file = findSound(name);
    if (!file) {
      return interaction.reply({ content: `◌ Sound \`${name}\` not found. Drop .mp3/.wav/.ogg files in \`data/sounds/\`.`, flags: MessageFlags.Ephemeral });
    }
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    try {
      await interaction.client.distube.play(voice, path.join(SOUND_DIR, file), {
        textChannel: interaction.channel,
        member: interaction.member,
      });
      return interaction.editReply(`🔊  Played **${name}**`);
    } catch (err) {
      return interaction.editReply(`▲ Sound failed: ${err.message || err}`);
    }
  },
};
