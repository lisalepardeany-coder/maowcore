const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  MessageFlags,
} = require('discord.js');
const { COLORS } = require('../lib/theme');

const RB_API = 'https://de1.api.radio-browser.info/json/stations/search';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('radiosearch')
    .setDescription('Search the Radio-Browser.info directory (thousands of stations)')
    .addStringOption((opt) => opt.setName('query').setDescription('Search by name, tag, or country').setRequired(true)),
  async execute(interaction) {
    const q = interaction.options.getString('query');
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({ content: '◌ Board a voice channel first.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let stations;
    try {
      const params = new URLSearchParams({ name: q, limit: '10', order: 'votes', reverse: 'true', hidebroken: 'true' });
      const res = await fetch(`${RB_API}?${params}`, { headers: { 'User-Agent': 'MaowCore/1.0' } });
      if (!res.ok) throw new Error(`API ${res.status}`);
      stations = await res.json();
    } catch (err) {
      return interaction.editReply(`▲ Radio directory unreachable: ${err.message || err}`);
    }
    if (!stations?.length) return interaction.editReply(`◌ No stations matched \`${q}\``);

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`radio:pick:${interaction.user.id}`)
      .setPlaceholder('📻  Choose a station')
      .addOptions(stations.slice(0, 10).map((s) => ({
        label: (s.name || 'Unknown').slice(0, 100),
        description: `${s.country || '?'} · ${s.tags?.split(',')[0] || 'misc'} · ${s.votes || 0} votes`.slice(0, 100),
        value: s.url_resolved || s.url,
      })));

    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: '📻  RADIO DIRECTORY' })
      .setDescription(stations.slice(0, 10).map((s, i) => `\`${i + 1}\`  **${s.name}** · ${s.country || '?'}`).join('\n'))
      .setFooter({ text: 'Selection expires in 30s · powered by radio-browser.info' });

    const reply = await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    let pick;
    try {
      pick = await reply.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 30_000,
      });
    } catch {
      return interaction.editReply({ content: '◌ Selection expired.', embeds: [], components: [] });
    }
    await pick.update({ content: '📻  Tuning…', embeds: [], components: [] });
    try {
      await interaction.client.distube.play(voice, pick.values[0], {
        textChannel: interaction.channel,
        member: interaction.member,
      });
    } catch (err) {
      await interaction.editReply(`▲ Tune failed: ${err.message || err}`);
    }
  },
};
