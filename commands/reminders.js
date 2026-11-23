const { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const reminders = require('../lib/reminders');
const { REPEAT_LABEL } = require('./remind');

// List your reminders and cancel them with a dropdown.
// The dropdown is handled in index.js (customId "remind:cancel").
const build = (userId) => {
  const list = reminders.forUser(userId);
  if (!list.length) return { content: '◌ You have no reminders. Set one with `/remind`.', embeds: [], components: [] };
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`⏰ Your reminders (${list.length})`)
    .setDescription(list.slice(0, 20).map((r, i) => {
      const ts = Math.floor(r.fireAt / 1000);
      return `**${i + 1}.** ${r.what.slice(0, 90)}\n<t:${ts}:f> (<t:${ts}:R>)${r.repeat ? ` · 🔁 ${REPEAT_LABEL[r.repeat]}` : ''}`;
    }).join('\n\n'))
    .setFooter({ text: list.length > 20 ? `Showing the next 20 of ${list.length}` : 'Pick one below to cancel it' });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('remind:cancel')
    .setPlaceholder('Cancel a reminder…')
    .addOptions(list.slice(0, 25).map((r, i) => ({
      label: `${i + 1}. ${r.what}`.slice(0, 100),
      description: `${new Date(r.fireAt).toLocaleString()}${r.repeat ? ` · ${REPEAT_LABEL[r.repeat]}` : ''}`.slice(0, 100),
      value: r.id,
    })));
  return { content: '', embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
};

module.exports = {
  everywhere: true,
  data: new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('See and cancel your reminders'),
  async execute(interaction) {
    return interaction.reply({ ...build(interaction.user.id), flags: MessageFlags.Ephemeral });
  },
  build,
};
