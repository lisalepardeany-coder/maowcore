const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} = require('discord.js');
const { COLORS } = require('../lib/theme');
const { fmtClock, truncate } = require('../lib/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Lock onto a signal (YouTube / Spotify URL or search)')
    .addStringOption((opt) =>
      opt.setName('query').setDescription('Signal name or URL').setRequired(true),
    ),
  async execute(interaction) {
    const query = interaction.options.getString('query');
    const voice = interaction.member.voice.channel;
    if (!voice) {
      return interaction.reply({
        content: '◌ Board a voice channel first — cannot transmit into the void.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const isURL = /^https?:\/\//i.test(query);

    if (isURL) {
      await interaction.deferReply();
      try {
        await interaction.client.distube.play(voice, query, {
          textChannel: interaction.channel,
          member: interaction.member,
        });
        return interaction.editReply(`⌬  Scanning subspace for  \`${truncate(query, 80)}\` ...`);
      } catch (err) {
        return interaction.editReply(`▲ Transmission lost: ${err.message || err}`);
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let results;
    try {
      results = await interaction.client.youtubePlugin.search(query, { limit: 5, type: 'video' });
    } catch (err) {
      return interaction.editReply(`▲ Subspace scan failed: ${err.message || err}`);
    }
    if (!results?.length) return interaction.editReply(`◌ No signals matched  \`${truncate(query, 80)}\``);

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`play:pick:${interaction.user.id}`)
      .setPlaceholder('✦  Select a signal to lock onto')
      .addOptions(
        results.map((r, i) => ({
          label: truncate(`${i + 1}. ${r.name}`, 100),
          description: truncate(`${r.uploader?.name || 'unknown'} · ${fmtClock(r.duration)}`, 100),
          value: r.url,
        })),
      );

    const embed = new EmbedBuilder()
      .setColor(COLORS.COSMIC)
      .setAuthor({ name: '⌬  SUBSPACE SCAN' })
      .setDescription(
        results
          .map(
            (r, i) =>
              `\`${i + 1}\`  **${truncate(r.name, 65)}** \`${fmtClock(r.duration)}\`\n› ${r.uploader?.name || 'unknown'}`,
          )
          .join('\n\n'),
      )
      .setFooter({ text: 'Selection expires in 30s' });

    const msg = await interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)],
    });

    let pick;
    try {
      pick = await msg.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id && i.customId === `play:pick:${interaction.user.id}`,
        time: 30_000,
      });
    } catch {
      return interaction.editReply({ content: '◌ Selection expired.', embeds: [], components: [] });
    }

    const url = pick.values[0];
    await pick.update({ content: '⌬  Locking onto signal ...', embeds: [], components: [] });
    try {
      await interaction.client.distube.play(voice, url, {
        textChannel: interaction.channel,
        member: interaction.member,
      });
    } catch (err) {
      await interaction.editReply(`▲ Transmission lost: ${err.message || err}`);
    }
  },
};
