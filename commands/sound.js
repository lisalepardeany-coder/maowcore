// /sound — every audio effect in one command (was /filter, /eq, /pitch,
// /speed, /normalize, /crossfade, /karaoke). The effects live unchanged in
// command-parts/; see lib/command-group.js.
const { group } = require('../lib/command-group');
const part = (name, description) => ({ name, module: require(`../command-parts/${name}`), description });

module.exports = group({
  name: 'sound',
  description: 'Audio effects: filters, EQ, pitch, speed, normalize, crossfade, karaoke',
  parts: [
    part('filter', 'Audio filters (bassboost, nightcore, echo …)'),
    part('eq', '10-band equalizer presets'),
    part('pitch', 'Shift pitch in semitones (0 resets, ±12 = one octave)'),
    part('speed', 'Playback speed, pitch kept (1.0 = normal)'),
    part('normalize', 'Toggle volume normalization (loud and quiet songs even)'),
    part('crossfade', 'Toggle smooth fades between songs'),
    part('karaoke', 'Toggle vocal removal for sing-along'),
  ],
});
