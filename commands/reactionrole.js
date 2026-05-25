const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

const getStore = (guildId) => {
  const g = getGuild(guildId);
  if (!g.reactionRoles) g.reactionRoles = {};
  return g.reactionRoles;
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Create a self-assign role embed (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((o) => o.setName('title').setDescription('Embed title').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Role to grant').setRequired(true))
    .addStringOption((o) => o.setName('emoji').setDescription('Emoji that grants the role').setRequired(true)),
  async execute(interaction) {
    const title = interaction.options.getString('title');
    const role = interaction.options.getRole('role');
    const emoji = interaction.options.getString('emoji');
    // Validate the role is grantable. The bot can only manage roles strictly
    // below its own highest role and can't touch @everyone or managed (bot)
    // roles. Catching this here avoids the silent "reactions do nothing"
    // failure mode the user would otherwise hit later.
    if (role.id === interaction.guild.id) {
      return interaction.reply({ content: '◌ Cannot use @everyone as a reaction role.', flags: MessageFlags.Ephemeral });
    }
    if (role.managed) {
      return interaction.reply({ content: '◌ Managed roles (bot-owned) can\'t be assigned by another bot.', flags: MessageFlags.Ephemeral });
    }
    const me = interaction.guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
      return interaction.reply({ content: '◌ That role is higher than my highest role — move my role above it first, or pick a lower role.', flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setTitle(`✦  ${title}`)
      .setDescription(`React with ${emoji} to receive **${role.name}**.\nUn-react to remove.`);
    await interaction.reply({ embeds: [embed] });
    const msg = await interaction.fetchReply();
    try { await msg.react(emoji); } catch { /* invalid emoji */ }
    const store = getStore(interaction.guildId);
    store[msg.id] = { emoji, roleId: role.id };
    updateGuild(interaction.guildId, { reactionRoles: store });
  },
};
