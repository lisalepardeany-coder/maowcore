const { EmbedBuilder } = require('discord.js');

const COLORS = {
  COSMIC: 0x8B5CF6,
  NEBULA: 0x06B6D4,
  FLARE: 0xEF4444,
};

const themedEmbed = (color, title, desc) =>
  new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);

module.exports = { COLORS, themedEmbed };
