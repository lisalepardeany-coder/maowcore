const { SlashCommandBuilder, EmbedBuilder, MessageFlags, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');

const ELEGANT_GOLD = 0xD4AF37;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Wedding / party / event mode — elegant theme + dedication tracking (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('start').setDescription('Start an event session')
      .addStringOption((o) => o.setName('name').setDescription('Event name').setRequired(true)))
    .addSubcommand((s) => s.setName('end').setDescription('End the event and export a summary'))
    .addSubcommand((s) => s.setName('status').setDescription('Show current event status')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = getGuild(interaction.guildId);
    if (sub === 'start') {
      const name = interaction.options.getString('name');
      updateGuild(interaction.guildId, {
        event: { name, startedAt: Date.now(), startedBy: interaction.user.id, songs: [] },
      });
      const embed = new EmbedBuilder()
        .setColor(ELEGANT_GOLD)
        .setTitle(`💍  ${name}`)
        .setDescription(`Event started. All song requests + dedications will be tracked.\nUse \`/event end\` to wrap up and export the summary.`);
      return interaction.reply({ embeds: [embed] });
    }
    if (sub === 'status') {
      if (!cfg.event) return interaction.reply({ content: '◌ No active event.', flags: MessageFlags.Ephemeral });
      return interaction.reply({
        content: `💍  **${cfg.event.name}** — started <t:${Math.floor(cfg.event.startedAt / 1000)}:R> · ${(cfg.event.songs || []).length} songs logged.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (sub === 'end') {
      if (!cfg.event) return interaction.reply({ content: '◌ No active event to end.', flags: MessageFlags.Ephemeral });
      const ev = cfg.event;
      updateGuild(interaction.guildId, { event: null });
      const lines = [
        `# 💍 ${ev.name}`,
        ``,
        `**Started:** ${new Date(ev.startedAt).toLocaleString()}`,
        `**Ended:** ${new Date().toLocaleString()}`,
        `**Songs played:** ${ev.songs?.length || 0}`,
        ``,
        `## Setlist`,
        ...(ev.songs || []).map((s, i) => `${i + 1}. **${s.name}** — requested by ${s.user}${s.dedication ? ` *(for ${s.dedication.to})*` : ''}`),
      ];
      const buf = Buffer.from(lines.join('\n'));
      return interaction.reply({
        content: `🎉  Event **${ev.name}** wrapped up — ${ev.songs?.length || 0} songs played.`,
        files: [new AttachmentBuilder(buf, { name: `${ev.name.replace(/\s+/g, '-')}-summary.md` })],
      });
    }
  },
};
