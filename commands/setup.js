const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const { getGuild, updateGuild } = require('../lib/config');
const { COLORS } = require('../lib/theme');

const findOrCreate = async (guild, opts) => {
  // Try to find by name first; create if missing
  const existing = guild.channels.cache.find((c) => c.name === opts.name && c.type === opts.type && c.parentId === (opts.parent || null));
  if (existing) return existing;
  return guild.channels.create(opts);
};

const findOrCreateRole = async (guild, name, color) => {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;
  return guild.roles.create({ name, color, reason: 'MaowCore /setup' });
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Auto-create the MaowCore channels, roles, and logging structure (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild;

    try {
      // 1. Create category
      const category = await findOrCreate(guild, {
        name: '✦ MaowCore',
        type: ChannelType.GuildCategory,
      });

      // 2. Text channels under category
      const channels = {};
      channels.music = await findOrCreate(guild, { name: '🎵-music',         type: ChannelType.GuildText, parent: category.id });
      channels.feed  = await findOrCreate(guild, { name: '◆-now-transmitting', type: ChannelType.GuildText, parent: category.id });
      channels.modlog = await findOrCreate(guild, { name: '⌬-modlog',          type: ChannelType.GuildText, parent: category.id });
      channels.welcome = await findOrCreate(guild, { name: '✧-welcome',        type: ChannelType.GuildText, parent: category.id });
      channels.suggestions = await findOrCreate(guild, { name: '💡-suggestions', type: ChannelType.GuildText, parent: category.id });

      // 3. Voice channels
      const voiceCat = await findOrCreate(guild, { name: '🎙 Voice', type: ChannelType.GuildCategory });
      channels.createRoom = await findOrCreate(guild, { name: '➕ Create Room', type: ChannelType.GuildVoice, parent: voiceCat.id });

      // 4. Stats voice channels (locked from Connect)
      const statsIds = {};
      for (const [key, label] of [['members', '◆ Members:'], ['bots', '✦ Bots:'], ['channels', '⌬ Channels:']]) {
        const ch = await findOrCreate(guild, {
          name: `${label} —`,
          type: ChannelType.GuildVoice,
          parent: voiceCat.id,
          permissionOverwrites: [{ id: guild.roles.everyone, deny: [PermissionFlagsBits.Connect] }],
        });
        statsIds[key] = ch.id;
      }

      // 5. Create roles
      const djRole = await findOrCreateRole(guild, 'DJ', 0x8B5CF6);
      const modRole = await findOrCreateRole(guild, 'Moderator', 0x06B6D4);
      const mutedRole = await findOrCreateRole(guild, 'Muted', 0x6B7280);

      // 6. Save the channel IDs into config so other features auto-wire
      updateGuild(guild.id, {
        setupComplete: true,
        welcomeChannelId: channels.welcome.id,
        modlogChannelId: channels.modlog.id,
        suggestionsChannelId: channels.suggestions.id,
        autoVoiceRoomId: channels.createRoom.id,
        statsChannels: statsIds,
        djRoleId: djRole.id,
        modRoleId: modRole.id,
        mutedRoleId: mutedRole.id,
      });

      // 7. Post a self-introduction in the music channel
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setTitle('◆  MaowCore setup complete')
        .setDescription([
          'The cosmic uplink is live. Created channels under **✦ MaowCore**:',
          '',
          `• ${channels.music} — primary command channel`,
          `• ${channels.feed} — now-playing feed`,
          `• ${channels.modlog} — audit log`,
          `• ${channels.welcome} — member join/leave embeds`,
          `• ${channels.suggestions} — community suggestions`,
          `• ${channels.createRoom} — join to spawn your own voice room`,
          '',
          `Created roles: **DJ**, **Moderator**, **Muted**.`,
          `Stats voice channels will auto-update every 10 min.`,
          '',
          'Open the cosmic dashboard at `http://127.0.0.1:8765/`.',
        ].join('\n'))
        .setFooter({ text: '✦  Use /help for the full command list.' });

      channels.music.send({ embeds: [embed] }).catch(() => {});

      return interaction.editReply(`✦  Setup complete — created/found ${Object.keys(channels).length + 3} channels and 3 roles.`);
    } catch (e) {
      return interaction.editReply(`▲ Setup failed: ${e.message}`);
    }
  },
};
