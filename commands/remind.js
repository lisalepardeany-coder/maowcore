const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const reminders = require('../lib/reminders');
const { botInServer, CONTEXT } = require('../lib/guards');

const REPEAT_LABEL = { hourly: 'every hour', daily: 'every day', weekdays: 'every weekday', weekly: 'every week' };

module.exports = {
  everywhere: true,
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder (once or repeating)')
    .addStringOption((o) => o.setName('when').setDescription('30min, 2h, 1d, 9:00, 21:30, 9am, tomorrow 9:00').setRequired(true))
    .addStringOption((o) => o.setName('what').setDescription('Reminder text').setRequired(true).setMaxLength(500))
    .addStringOption((o) => o.setName('repeat').setDescription('Repeat it').setRequired(false).addChoices(
      { name: 'Every hour', value: 'hourly' },
      { name: 'Every day', value: 'daily' },
      { name: 'Every weekday (Mon–Fri)', value: 'weekdays' },
      { name: 'Every week', value: 'weekly' },
    ))
    .addBooleanOption((o) => o.setName('here').setDescription('Ping in this channel instead of DM').setRequired(false))
    .addStringOption((o) => o.setName('profile').setDescription('Which of your panel profiles it\'s for (optional)').setAutocomplete(true)),
  async autocomplete(interaction) {
    const f = String(interaction.options.getFocused() || '').toLowerCase();
    let ps = [];
    try { ps = require('../lib/profiles').list(interaction.user.id); } catch { /* no database */ }
    return interaction.respond(ps.filter((p) => p.name.toLowerCase().includes(f)).slice(0, 25).map((p) => ({ name: `${p.emoji || '🎭'} ${p.name}`.slice(0, 100), value: p.id })));
  },
  async execute(interaction) {
    const when = interaction.options.getString('when');
    const what = interaction.options.getString('what');
    const repeat = interaction.options.getString('repeat');
    // The bot can only post where it's a member (or in its own DMs); in group
    // DMs and servers it isn't in, "here" falls back to a DM.
    const wantsHere = interaction.options.getBoolean('here') || false;
    const canPostHere = botInServer(interaction) || interaction.context === CONTEXT.BOT_DM;
    const here = wantsHere && canPostHere;
    const fireAt = reminders.parseWhen(when);
    if (!fireAt) {
      return interaction.reply({ content: '◌ I didn\'t get that time. Try `30min`, `2h`, `1d`, `9:00`, `21:30`, `9am` or `tomorrow 9:00`.', flags: MessageFlags.Ephemeral });
    }
    if (repeat === 'hourly' && fireAt - Date.now() > 3600000) {
      return interaction.reply({ content: '◌ For hourly reminders, pick a start within the next hour.', flags: MessageFlags.Ephemeral });
    }
    let r;
    try {
      const pid = interaction.options.getString('profile');
      let profile = null;
      if (pid) { try { const p = require('../lib/profiles').list(interaction.user.id).find((x) => x.id === pid || x.name.toLowerCase() === pid.toLowerCase()); if (p) profile = { id: p.id, name: p.name, emoji: p.emoji }; } catch { /* */ } }
      r = reminders.add({ userId: interaction.user.id, channelId: here ? interaction.channelId : null, what, fireAt, repeat, profile });
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
    const ts = Math.floor(r.fireAt / 1000);
    return interaction.reply({
      content: `⏰  Reminder set for <t:${ts}:f> (<t:${ts}:R>)${r.repeat ? `, then ${REPEAT_LABEL[r.repeat]}` : ''} — ${here ? 'in this channel' : 'I\'ll DM you'}.`
        + `${wantsHere && !here ? ' (I can\'t post in this chat, so it\'ll come by DM.)' : ''}\nSee or cancel them with \`/reminders\`.`,
      flags: MessageFlags.Ephemeral,
    });
  },
  REPEAT_LABEL,
};
