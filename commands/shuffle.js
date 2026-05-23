const { SlashCommandBuilder } = require('discord.js');
const { requireQueue } = require('../lib/guards');

// Smart shuffle — Fisher-Yates with an artist-avoidance pass to prevent
// back-to-back tracks by the same uploader/artist when possible.
const artistOf = (song) =>
  (song?.uploader?.name || song?.artist || song?.url || '').toString().toLowerCase();

const smartShuffle = (songs) => {
  if (songs.length <= 2) return songs;
  // Fisher-Yates first
  const arr = songs.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Then iterate and swap any adjacent same-artist pair with the next non-matching neighbor.
  for (let i = 0; i < arr.length - 1; i++) {
    if (artistOf(arr[i]) === artistOf(arr[i + 1])) {
      for (let j = i + 2; j < arr.length; j++) {
        if (artistOf(arr[j]) !== artistOf(arr[i])) {
          [arr[i + 1], arr[j]] = [arr[j], arr[i + 1]];
          break;
        }
      }
    }
  }
  return arr;
};

module.exports = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Scramble the cargo manifest (smart — avoids back-to-back same artist)'),
  async execute(interaction) {
    const queue = await requireQueue(interaction);
    if (!queue) return;
    if (queue.songs.length <= 2) {
      await queue.shuffle();
    } else {
      // Preserve the currently-playing song at index 0
      const [first, ...rest] = queue.songs;
      const shuffled = smartShuffle(rest);
      queue.songs.splice(0, queue.songs.length, first, ...shuffled);
    }
    return interaction.reply('✦  Cargo manifest scrambled (smart-shuffle).');
  },
};
