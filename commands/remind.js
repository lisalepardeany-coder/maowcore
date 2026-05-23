const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const reminders = require('../lib/reminders');

const parseDuration = (s) => {
  // "30min", "1h", "2h30m", "1d" → ms
  if (!s) return 0;
  const re = /(\d+)\s*(d|h|m|min|s|sec)/gi;
  let total = 0;
  let m;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    total += n * (u.startsWith('d') ? 86400000 : u.startsWith('h') ? 3600000 : u.startsWith('s') ? 1000 : 60000);
  }
  return total;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption((o) => o.setName('when').setDescription('Duration (e.g. 30min, 2h, 1d)').setRequired(true))
    .addStringOption((o) => o.setName('what').setDescription('Reminder text').setRequired(true))
    .addBooleanOption((o) => o.setName('here').setDescription('Ping in this channel instead of DM').setRequired(false)),
  async execute(interaction) {
    const when = interaction.options.getString('when');
    const what = interaction.options.getString('what');
    const here = interaction.options.getBoolean('here') || false;
    const ms = parseDuration(when);
    if (!ms || ms < 1000) {
      return interaction.reply({ content: '◌ Bad duration. Examples: `30min`, `2h`, `1d`, `2h30m`.', flags: MessageFlags.Ephemeral });
    }
    const fireAt = Date.now() + ms;
    reminders.add({
      userId: interaction.user.id,
      channelId: here ? interaction.channelId : null,
      what,
      fireAt,
    });
    return interaction.reply({
      content: `⏰  Reminder set for <t:${Math.floor(fireAt / 1000)}:R> — ${here ? `in this channel` : 'I\'ll DM you'}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
