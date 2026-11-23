const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const lists = require('../lib/checklists');

const profileFor = (userId, wanted) => {
  if (!wanted) return null;
  try { const p = require('../lib/profiles').list(userId).find((x) => x.id === wanted || x.name.toLowerCase() === String(wanted).toLowerCase()); return p ? { id: p.id, name: p.name, emoji: p.emoji } : null; } catch { return null; }
};

module.exports = {
  everywhere: true,
  data: new SlashCommandBuilder()
    .setName('checklist')
    .setDescription('Tick-off checklists (meds, routines) — optional daily DM')
    .addSubcommand((s) => s.setName('new').setDescription('Make a checklist')
      .addStringOption((o) => o.setName('name').setDescription('e.g. Morning meds').setRequired(true).setMaxLength(40))
      .addStringOption((o) => o.setName('items').setDescription('Comma-separated, e.g. Vitamin D, Water, Breakfast').setRequired(true))
      .addStringOption((o) => o.setName('time').setDescription('Send it to me daily at (e.g. 09:00) — optional'))
      .addStringOption((o) => o.setName('profile').setDescription('Which profile it belongs to (optional)').setAutocomplete(true)))
    .addSubcommand((s) => s.setName('show').setDescription('Show a checklist with tick buttons')
      .addStringOption((o) => o.setName('name').setDescription('Checklist').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Your checklists'))
    .addSubcommand((s) => s.setName('time').setDescription('Change (or remove) the daily time')
      .addStringOption((o) => o.setName('name').setDescription('Checklist').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('time').setDescription('e.g. 21:30 — empty to stop daily DMs')))
    .addSubcommand((s) => s.setName('delete').setDescription('Delete a checklist')
      .addStringOption((o) => o.setName('name').setDescription('Checklist').setRequired(true).setAutocomplete(true))),
  async autocomplete(interaction) {
    const opt = interaction.options.getFocused(true);
    const f = String(opt.value || '').toLowerCase();
    if (opt.name === 'profile') {
      let ps = [];
      try { ps = require('../lib/profiles').list(interaction.user.id); } catch { /* */ }
      return interaction.respond(ps.filter((p) => p.name.toLowerCase().includes(f)).slice(0, 25).map((p) => ({ name: `${p.emoji || '🎭'} ${p.name}`.slice(0, 100), value: p.id })));
    }
    return interaction.respond(lists.forUser(interaction.user.id).filter((l) => l.name.toLowerCase().includes(f)).slice(0, 25).map((l) => ({ name: l.name, value: l.name })));
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const uid = interaction.user.id;
    const eph = { flags: MessageFlags.Ephemeral };
    try {
      if (sub === 'new') {
        const l = lists.create({ userId: uid, name: interaction.options.getString('name'), items: interaction.options.getString('items'), at: interaction.options.getString('time')?.trim() || null, profile: profileFor(uid, interaction.options.getString('profile')) });
        return interaction.reply({ content: `☑️ Made **${l.name}** with ${l.items.length} item${l.items.length === 1 ? '' : 's'}.${l.at ? ` I'll DM it to you every day at **${l.at}** (and nudge once if it's not done after 2 h).` : ' Show it any time with `/checklist show`.'}`, ...eph });
      }
      if (sub === 'list') {
        const mine = lists.forUser(uid);
        return interaction.reply({ content: mine.length ? mine.map((l) => `☑️ **${l.name}** — ${lists.ticked(l).length}/${l.items.length} today${l.at ? ` · daily ${l.at}` : ''}${lists.streak(l) ? ` · 🔥 ${lists.streak(l)}` : ''}${l.profile ? ` · ${l.profile.emoji || '🎭'} ${l.profile.name}` : ''}`).join('\n') : '◌ No checklists yet. Make one with `/checklist new`.', ...eph });
      }
      const l = lists.findByName(uid, interaction.options.getString('name'));
      if (!l) return interaction.reply({ content: '◌ No checklist with that name.', ...eph });
      if (sub === 'show') return interaction.reply({ ...lists.message(l), ...eph });
      if (sub === 'time') {
        const at = interaction.options.getString('time')?.trim() || null;
        lists.update(uid, l.id, { at });
        return interaction.reply({ content: at ? `⏰ **${l.name}** now comes daily at **${at}**.` : `✕ **${l.name}** won't be DMed daily any more.`, ...eph });
      }
      if (sub === 'delete') { lists.remove(uid, l.id); return interaction.reply({ content: `✕ Deleted **${l.name}**.`, ...eph }); }
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, ...eph });
    }
    return null;
  },
};
