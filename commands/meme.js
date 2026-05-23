const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');

const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Generate a meme image with top/bottom text on the current album art')
    .addStringOption((opt) => opt.setName('top').setDescription('Top text').setRequired(true))
    .addStringOption((opt) => opt.setName('bottom').setDescription('Bottom text').setRequired(false)),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    const song = queue.songs[0];
    const top = interaction.options.getString('top') || '';
    const bottom = interaction.options.getString('bottom') || '';
    await interaction.deferReply();

    let bgUrl = song.thumbnail || null;
    let bgImage = '';
    if (bgUrl) {
      try {
        const res = await fetch(bgUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        bgImage = `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch { /* ignored */ }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <filter id="ink"><feGaussianBlur stdDeviation="2"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  ${bgImage ? `<image href="${bgImage}" x="0" y="0" width="600" height="600" preserveAspectRatio="xMidYMid slice"/>` : '<rect width="600" height="600" fill="#1A1530"/>'}
  <text x="300" y="90" font-family="Impact, sans-serif" font-size="60" font-weight="900" fill="white" stroke="black" stroke-width="3" text-anchor="middle" filter="url(#ink)">${escapeXml(top.toUpperCase())}</text>
  ${bottom ? `<text x="300" y="560" font-family="Impact, sans-serif" font-size="60" font-weight="900" fill="white" stroke="black" stroke-width="3" text-anchor="middle" filter="url(#ink)">${escapeXml(bottom.toUpperCase())}</text>` : ''}
</svg>`;

    const file = new AttachmentBuilder(Buffer.from(svg), { name: 'meme.svg' });
    return interaction.editReply({
      content: `✦  Behold — your meme based on **${song.name}**.`,
      files: [file],
    });
  },
};
