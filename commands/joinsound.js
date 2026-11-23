const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { getGuild, updateGuild } = require('../lib/config');

const SOUND_DIR = path.join(__dirname, '..', 'data', 'sounds');
const sounds = () => { try { return fs.readdirSync(SOUND_DIR).filter((f) => /\.(mp3|wav|ogg|m4a)$/i.test(f)); } catch { return []; } };

// Your own sound when you join the bot's voice channel (instead of the
// server's welcome sound). Plays only when no music is playing.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('joinsound')
    .setDescription('Your personal sound when you join the bot\'s voice channel')
    .addSubcommand((s) => s.setName('set').setDescription('Pick your sound (from the soundboard)')
      .addStringOption((o) => o.setName('sound').setDescription('Sound').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('clear').setDescription('Remove your join sound'))
    .addSubcommand((s) => s.setName('show').setDescription('Show your join sound')),
  async autocomplete(interaction) {
    const f = interaction.options.getFocused().toLowerCase();
    await interaction.respond(sounds().filter((s) => s.toLowerCase().includes(f)).slice(0, 25).map((s) => ({ name: path.basename(s, path.extname(s)).slice(0, 100), value: s.slice(0, 100) })));
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const all = getGuild(interaction.guildId).joinSounds || {};
    const eph = { flags: MessageFlags.Ephemeral };
    if (sub === 'set') {
      const want = interaction.options.getString('sound');
      const file = sounds().find((s) => s === want || path.basename(s, path.extname(s)).toLowerCase() === want.toLowerCase());
      if (!file) return interaction.reply({ content: '◌ That sound isn\'t on the soundboard. Upload sounds in the panel (Soundboard page).', ...eph });
      all[interaction.user.id] = file;
      updateGuild(interaction.guildId, { joinSounds: all });
      return interaction.reply({ content: `🔔 Your join sound is **${path.basename(file, path.extname(file))}**. It plays when you join the bot's voice channel and nothing else is playing.`, ...eph });
    }
    if (sub === 'clear') {
      delete all[interaction.user.id];
      updateGuild(interaction.guildId, { joinSounds: all });
      return interaction.reply({ content: '✕ Join sound removed.', ...eph });
    }
    const f = all[interaction.user.id];
    return interaction.reply({ content: f ? `🔔 Your join sound: **${path.basename(f, path.extname(f))}**` : '◌ No join sound set. Use `/joinsound set`.', ...eph });
  },
};
