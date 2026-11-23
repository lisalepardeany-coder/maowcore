const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const routines = require('../lib/routines');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('routine')
    .setDescription('One-press routines: Morning, Wind down, Gaming… (edit them in the panel)')
    .addSubcommand((s) => s.setName('run').setDescription('Run a routine')
      .addStringOption((o) => o.setName('name').setDescription('Routine').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Your routines and their steps')),
  async autocomplete(interaction) {
    const f = interaction.options.getFocused().toLowerCase();
    return interaction.respond(routines.list(interaction.user.id).filter((r) => r.name.toLowerCase().includes(f)).slice(0, 25).map((r) => ({ name: `${r.emoji} ${r.name}`, value: r.id })));
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const desc = (s) => ({ theme: `🎨 theme ${s.id}`, gentle: `🌙 gentle ${s.on ? 'on' : 'off'}`, mood: `🎛 ${s.mood} mix`, radio: `📻 ${s.station}`, ambience: `🌫 ${s.preset}`, volume: `🔊 ${s.value}%`, stop: '⏹ stop', checklist: `☑️ checklist${s.match ? ` "${s.match}"` : ''}` }[s.type] || s.type);
    if (sub === 'list') {
      const all = routines.list(interaction.user.id);
      return interaction.reply({ content: all.map((r) => `${r.emoji} **${r.name}** — ${r.steps.map(desc).join(' → ')}`).join('\n'), flags: MessageFlags.Ephemeral });
    }
    const r = routines.find(interaction.user.id, interaction.options.getString('name'));
    if (!r) return interaction.reply({ content: '◌ No routine with that name. See `/routine list`.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await routines.runServer(interaction.client, { guild: interaction.guild, voice: interaction.member?.voice?.channel || null, userId: interaction.user.id, routine: r, textChannel: interaction.channel });
    const panelBits = res.panel.length ? `\n🖥 In the panel: ${res.panel.map(desc).join(', ')} (press the routine there to apply those too).` : '';
    return interaction.editReply(`${r.emoji} **${r.name}** — ${res.done.length ? res.done.join(' · ') : 'nothing to do in Discord'}${res.skipped.length ? `\n◌ Skipped: ${res.skipped.join(', ')}` : ''}${panelBits}`);
  },
};
