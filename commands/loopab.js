const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { requireQueue } = require('../lib/guards');
const abLoop = require('../lib/ab-loop');

const parseTime = (s) => {
  if (!s) return null;
  s = String(s).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return null;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loopab')
    .setDescription('Loop a section of the current signal between two timestamps')
    .addStringOption((opt) => opt.setName('start').setDescription('Start time (seconds or m:ss). Pass "off" to disable.').setRequired(true))
    .addStringOption((opt) => opt.setName('end').setDescription('End time (seconds or m:ss)').setRequired(false)),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const startArg = interaction.options.getString('start');
    if (startArg && startArg.toLowerCase() === 'off') {
      abLoop.stop(interaction.guildId);
      return interaction.reply('✕  A-B loop disengaged.');
    }
    const endArg = interaction.options.getString('end');
    const start = parseTime(startArg);
    const end = parseTime(endArg);
    if (start == null || end == null || end <= start) {
      return interaction.reply({
        content: '◌ Provide start and end (e.g. `1:30` and `2:15`). End must be after start.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const song = queue.songs[0];
    abLoop.start(interaction.client.distube, interaction.guildId, song.url, start, end);
    return interaction.reply(`↻  A-B loop engaged — ${start}s ↔ ${end}s of **${song.name}**.`);
  },
};
