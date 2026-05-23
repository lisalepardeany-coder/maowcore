const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const podcast = require('../lib/podcast');
const { COLORS } = require('../lib/theme');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('podcast')
    .setDescription('Manage podcast RSS subscriptions')
    .addSubcommand((s) => s.setName('subscribe').setDescription('Add an RSS feed')
      .addStringOption((o) => o.setName('name').setDescription('Short name').setRequired(true))
      .addStringOption((o) => o.setName('url').setDescription('RSS feed URL').setRequired(true)))
    .addSubcommand((s) => s.setName('unsubscribe').setDescription('Remove a feed')
      .addStringOption((o) => o.setName('name').setDescription('Subscription name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List subscriptions'))
    .addSubcommand((s) => s.setName('play').setDescription('Play the latest episode of a subscription')
      .addStringOption((o) => o.setName('name').setDescription('Subscription name').setRequired(true).setAutocomplete(true))),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const names = Object.keys(podcast.getSubs(interaction.guildId)).filter((n) => n.includes(focused));
    await interaction.respond(names.slice(0, 25).map((n) => ({ name: n, value: n })));
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'subscribe') {
      const name = interaction.options.getString('name').toLowerCase();
      const url = interaction.options.getString('url');
      try {
        await podcast.fetchFeed(url); // validate
        podcast.subscribe(interaction.guildId, name, url);
        return interaction.reply({ content: `🎙  Subscribed to **${name}**.`, flags: MessageFlags.Ephemeral });
      } catch (e) {
        return interaction.reply({ content: `▲ Could not parse feed: ${e.message}`, flags: MessageFlags.Ephemeral });
      }
    }
    if (sub === 'unsubscribe') {
      const name = interaction.options.getString('name');
      podcast.unsubscribe(interaction.guildId, name);
      return interaction.reply({ content: `✕  Unsubscribed from **${name}**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'list') {
      const subs = podcast.list(interaction.guildId);
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setAuthor({ name: '🎙  PODCAST SUBSCRIPTIONS' })
        .setDescription(subs.length ? subs.map((s) => `**${s.name}** — ${s.url}`).join('\n') : '*— no subscriptions —*');
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'play') {
      const name = interaction.options.getString('name');
      const subs = podcast.getSubs(interaction.guildId);
      if (!subs[name]) return interaction.reply({ content: `◌ No subscription named **${name}**.`, flags: MessageFlags.Ephemeral });
      const voice = interaction.member.voice.channel;
      if (!voice) return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
      await interaction.deferReply();
      try {
        const feed = await podcast.fetchFeed(subs[name].url);
        const latest = feed.items[0];
        if (!latest?.audioUrl) throw new Error('No episode audio found.');
        await interaction.client.distube.play(voice, latest.audioUrl, {
          textChannel: interaction.channel,
          member: interaction.member,
        });
        return interaction.editReply(`🎙  Playing latest **${name}** episode — *${latest.title}*`);
      } catch (e) {
        return interaction.editReply(`▲ Playback failed: ${e.message}`);
      }
    }
  },
};
