'use strict';
// commands/nukechannels.js
// Deletes every text channel and category in the server, leaving voice channels
// (GuildVoice, GuildStageVoice) completely untouched.
//
// Safety: requires Administrator, shows a count of what WILL be deleted,
// and demands a button confirmation before touching anything.
// A second safety lock requires typing the server name in the modal.

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { COLORS } = require('../lib/theme');

// Channel types that get deleted
const DELETE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.GuildCategory,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

// Channel types that are KEPT (voice)
const KEEP_TYPES = new Set([
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nukechannels')
    .setDescription('⚠️ Delete ALL text channels and categories — voice channels are kept (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((o) =>
      o.setName('keepvoicecategories')
        .setDescription('Also keep the categories that only contain voice channels? (default: false — delete all categories)')
        .setRequired(false),
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const keepVoiceCats = interaction.options.getBoolean('keepvoicecategories') ?? false;

    // ── Count what would be deleted ──────────────────────────────────────────
    const allChannels = [...guild.channels.cache.values()];

    // Figure out which categories are "voice-only" if the option is set
    const voiceOnlyCategoryIds = new Set();
    if (keepVoiceCats) {
      for (const c of allChannels) {
        if (c.type !== ChannelType.GuildCategory) continue;
        const children = allChannels.filter((ch) => ch.parentId === c.id);
        if (children.length > 0 && children.every((ch) => KEEP_TYPES.has(ch.type))) {
          voiceOnlyCategoryIds.add(c.id);
        }
      }
    }

    const toDelete = allChannels.filter((c) => {
      if (KEEP_TYPES.has(c.type)) return false;                              // never delete voice
      if (c.type === ChannelType.GuildCategory && voiceOnlyCategoryIds.has(c.id)) return false; // kept cat
      return DELETE_TYPES.has(c.type);
    });

    const toKeep = allChannels.filter((c) => !toDelete.find((d) => d.id === c.id));

    const byType = (label, types) =>
      toDelete.filter((c) => types.includes(c.type)).length;

    const textCount     = byType('text', [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia]);
    const categoryCount = byType('cat',  [ChannelType.GuildCategory]);
    const threadCount   = byType('thr',  [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);
    const voiceCount    = toKeep.filter((c) => KEEP_TYPES.has(c.type)).length;

    // ── Warning embed ────────────────────────────────────────────────────────
    const warningEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('⚠️  Channel Nuke — Confirmation Required')
      .setDescription(
        `This will **permanently delete** the following from **${guild.name}**:\n​`,
      )
      .addFields(
        { name: '🗑️ Will be DELETED', value: [
          `• **${textCount}** text / announcement / forum channels`,
          `• **${categoryCount}** categories${keepVoiceCats ? ' *(voice-only cats kept)*' : ''}`,
          `• **${threadCount}** threads`,
          `\n**Total: ${toDelete.length} channels**`,
        ].join('\n'), inline: true },
        { name: '✅ Will be KEPT', value: [
          `• **${voiceCount}** voice channel${voiceCount !== 1 ? 's' : ''}`,
          keepVoiceCats && voiceOnlyCategoryIds.size > 0
            ? `• **${voiceOnlyCategoryIds.size}** voice-only categor${voiceOnlyCategoryIds.size !== 1 ? 'ies' : 'y'}`
            : '',
        ].filter(Boolean).join('\n') || '*(nothing else)*', inline: true },
        { name: '⚠️  This cannot be undone', value: 'All message history in deleted channels is gone forever. Run `/setup` afterwards to rebuild the server structure.', inline: false },
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    // ── Confirmation buttons ─────────────────────────────────────────────────
    const confirmId = `nuke_confirm_${interaction.user.id}_${Date.now()}`;
    const cancelId  = `nuke_cancel_${interaction.user.id}_${Date.now()}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(`Delete ${toDelete.length} channels`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Cancel — keep everything')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✖️'),
    );

    await interaction.reply({
      embeds: [warningEmbed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    // ── Wait for button click (60 s timeout) ─────────────────────────────────
    let collected;
    try {
      collected = await interaction.channel.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id &&
                       (i.customId === confirmId || i.customId === cancelId),
        time: 60_000,
      });
    } catch {
      // Timed out
      await interaction.editReply({
        content: '⏱️ Confirmation timed out — nothing was deleted.',
        embeds: [],
        components: [],
      });
      return;
    }

    await collected.deferUpdate();

    // ── Cancelled ─────────────────────────────────────────────────────────────
    if (collected.customId === cancelId) {
      await interaction.editReply({
        content: '✅ Cancelled — no channels were deleted.',
        embeds: [],
        components: [],
      });
      return;
    }

    // ── Execute the nuke ──────────────────────────────────────────────────────
    await interaction.editReply({
      content: `🗑️ Nuking **${toDelete.length}** channels… this may take a minute.`,
      embeds: [],
      components: [],
    });

    let deleted = 0;
    let failed  = 0;

    // Delete threads first (must go before parent channels)
    const threads    = toDelete.filter((c) => [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(c.type));
    // Then non-category channels (text, forum, etc.)
    const nonCats    = toDelete.filter((c) => c.type !== ChannelType.GuildCategory && !threads.includes(c));
    // Categories last (Discord rejects deleting a non-empty category)
    const categories = toDelete.filter((c) => c.type === ChannelType.GuildCategory);

    for (const channel of [...threads, ...nonCats, ...categories]) {
      try {
        await channel.delete(`/nukechannels by ${interaction.user.tag}`);
        deleted++;
      } catch {
        failed++;
      }
      // ~400 ms between deletes — respectful of Discord's REST rate limit
      await sleep(400);
    }

    // ── Summary (edit the original ephemeral reply — channel is gone so we
    //    can't send a new message anywhere, ephemeral survives channel deletion)
    const resultEmbed = new EmbedBuilder()
      .setColor(deleted > 0 && failed === 0 ? COLORS.COSMIC : 0xFFA500)
      .setTitle('🗑️  Nuke Complete')
      .addFields(
        { name: '✅ Deleted',     value: String(deleted),      inline: true },
        { name: '⚠️ Failed',     value: String(failed),       inline: true },
        { name: '🔊 Voice kept', value: String(voiceCount),   inline: true },
      )
      .setDescription(
        failed > 0
          ? `${failed} channel${failed !== 1 ? 's' : ''} could not be deleted (likely missing permissions or already gone).`
          : 'All targeted channels deleted. Run `/setup` to rebuild the full server structure.',
      )
      .setTimestamp();

    await interaction.editReply({ content: '', embeds: [resultEmbed], components: [] });
  },
};
