const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const tools = require('../lib/mod-tools');
const modlog = require('../lib/modlog');

// Private notes about members — only moderators can see them.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Private mod notes about a member (mods only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) => s.setName('add').setDescription('Add a note')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('text').setDescription('The note').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('list').setDescription('Show notes and mod history for a member')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a note')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('id').setDescription('Note id (from /note list)').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');
    const gid = interaction.guildId;
    if (sub === 'add') {
      const n = tools.addNote(gid, user.id, interaction.options.getString('text'), interaction.user.tag);
      modlog.record(gid, { action: 'note', target: user, mod: interaction.user, reason: n.text });
      return interaction.reply({ content: `📝 Note \`${n.id}\` saved for **${user.tag}**. Only mods can see it.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'remove') {
      const ok = tools.removeNote(gid, user.id, interaction.options.getString('id').trim());
      return interaction.reply({ content: ok ? '✕ Note removed.' : '◌ No note with that id.', flags: MessageFlags.Ephemeral });
    }
    const list = tools.notes(gid, user.id);
    const history = modlog.list(gid, { targetId: user.id, limit: 10 }).filter((e) => e.action !== 'note');
    const embed = new EmbedBuilder().setColor(0x9ca3af).setTitle(`📝 ${user.tag}`)
      .addFields(
        { name: `Notes (${list.length})`, value: list.length ? list.slice(-15).map((n) => `\`${n.id}\` <t:${Math.floor(n.ts / 1000)}:d> **${n.by}**: ${n.text.slice(0, 180)}`).join('\n').slice(0, 1024) : '—' },
        { name: 'Recent mod actions', value: history.length ? history.map((e) => `<t:${Math.floor(e.ts / 1000)}:d> **${e.action}**${e.reason ? ` — ${e.reason.slice(0, 80)}` : ''}`).join('\n').slice(0, 1024) : '—' },
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
