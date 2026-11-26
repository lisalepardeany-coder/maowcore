const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const playlists = require('../lib/playlists');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('load')
    .setDescription('Load one of your saved playlists into the queue')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Playlist name').setRequired(true).setAutocomplete(true),
    ),
  async autocomplete(interaction) {
    try {
      const focused = String(interaction.options.getFocused() || '').toLowerCase();
      const userLists = playlists.listFor(interaction.guildId, interaction.user.id);
      // Drop falsy / non-string / "undefined" keys defensively — a stale config
      // entry would otherwise render as "undefined" in the dropdown.
      const names = Object.keys(userLists || {}).filter(
        (n) => typeof n === 'string' && n && n !== 'undefined' && n.toLowerCase().includes(focused),
      );
      await interaction.respond(names.slice(0, 25).map((n) => ({ name: n.slice(0, 100), value: n.slice(0, 100) })));
    } catch {
      try { await interaction.respond([]); } catch { /* ignore */ }
    }
  },
  async execute(interaction) {
    const name = interaction.options.getString('name');
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({
        content: '◌ Board a voice channel first.',
        flags: MessageFlags.Ephemeral,
      });
    }
    let urls;
    try {
      urls = playlists.load(interaction.guildId, interaction.user.id, name);
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    let added = 0;
    let failed = 0;
    for (const url of urls) {
      try {
        await interaction.client.distube.play(voice, url, {
          textChannel: interaction.channel,
          member: interaction.member,
        });
        added++;
      } catch {
        failed++;
      }
    }
    return interaction.editReply(
      `⌬  Loaded **${name}** — ${added} signal${added === 1 ? '' : 's'} queued${failed ? `, ${failed} failed` : ''}.`,
    );
  },
};
