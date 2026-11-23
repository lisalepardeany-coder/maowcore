const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const tools = require('../lib/mod-tools');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Birthday wishes for this server')
    .addSubcommand((s) => s.setName('set').setDescription('Save your birthday (no year needed)')
      .addIntegerOption((o) => o.setName('day').setDescription('Day').setRequired(true).setMinValue(1).setMaxValue(31))
      .addIntegerOption((o) => o.setName('month').setDescription('Month').setRequired(true).addChoices(...MONTHS.map((name, i) => ({ name, value: i + 1 })))))
    .addSubcommand((s) => s.setName('remove').setDescription('Forget your birthday'))
    .addSubcommand((s) => s.setName('list').setDescription('Upcoming birthdays'))
    .addSubcommand((s) => s.setName('setup').setDescription('Where to post wishes, and an optional birthday role (manage server)')
      .addChannelOption((o) => o.setName('channel').setDescription('Wishes channel (empty = turn off)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption((o) => o.setName('role').setDescription('Role given for the day'))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const cfg = getGuild(interaction.guildId).birthdays || { people: {} };
    const people = cfg.people || {};
    if (sub === 'set') {
      const d = interaction.options.getInteger('day'); const m = interaction.options.getInteger('month');
      if (!tools.validDay(d, m)) return interaction.reply({ content: '◌ That date doesn\'t exist.', flags: MessageFlags.Ephemeral });
      people[interaction.user.id] = { d, m };
      updateGuild(interaction.guildId, { birthdays: { ...cfg, people } });
      return interaction.reply({ content: `🎂 Saved: **${d} ${MONTHS[m - 1]}**.${cfg.channelId ? '' : ' (Wishes will start once a mod runs `/birthday setup`.)'}`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'remove') {
      delete people[interaction.user.id];
      updateGuild(interaction.guildId, { birthdays: { ...cfg, people } });
      return interaction.reply({ content: '✕ Birthday removed.', flags: MessageFlags.Ephemeral });
    }
    if (sub === 'list') {
      const now = new Date();
      const next = Object.entries(people).map(([id, b]) => {
        let t = new Date(now.getFullYear(), b.m - 1, b.d);
        if (t < new Date(now.getFullYear(), now.getMonth(), now.getDate())) t = new Date(now.getFullYear() + 1, b.m - 1, b.d);
        return { id, b, t };
      }).sort((a, b) => a.t - b.t).slice(0, 15);
      return interaction.reply({
        content: next.length ? `🎂 **Upcoming birthdays**\n${next.map((x) => `<@${x.id}> — ${x.b.d} ${MONTHS[x.b.m - 1]} (<t:${Math.floor(x.t / 1000)}:R>)`).join('\n')}` : '◌ No birthdays saved yet. Add yours with `/birthday set`.',
        allowedMentions: { users: [] },
      });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '◌ You need the Manage Server permission for this.', flags: MessageFlags.Ephemeral });
    }
    const ch = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');
    if (role && role.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({ content: `◌ I can't give ${role} — move my role above it first.`, flags: MessageFlags.Ephemeral });
    }
    updateGuild(interaction.guildId, { birthdays: { ...cfg, people, channelId: ch?.id || null, roleId: role?.id || null } });
    return interaction.reply({ content: ch ? `🎂 Birthday wishes go to ${ch} at 9:00${role ? `, and ${role} is given for the day` : ''}.` : '✕ Birthday wishes turned off.', flags: MessageFlags.Ephemeral });
  },
};
