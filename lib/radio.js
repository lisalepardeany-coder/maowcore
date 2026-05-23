// Hand-curated internet radio presets (YouTube live streams — most reliable
// source for 24/7 stations). Add/remove freely.
const PRESETS = [
  { name: 'lofi',       title: 'Lofi Girl — beats to relax/study',     url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
  { name: 'chillhop',   title: 'Chillhop Radio — jazzy & lofi beats',  url: 'https://www.youtube.com/watch?v=5yx6BWlEVcY' },
  { name: 'synthwave',  title: 'The Bootleg Boy — synthwave',          url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY' },
  { name: 'jazz',       title: 'Smooth Jazz Radio',                    url: 'https://www.youtube.com/watch?v=Dx5qFachd3A' },
  { name: 'classical',  title: 'Classical Music for Studying',          url: 'https://www.youtube.com/watch?v=jgpJVI3tDbY' },
  { name: 'study',      title: 'Study With Me — focus ambience',        url: 'https://www.youtube.com/watch?v=DWcJFNfaw9c' },
  { name: 'rain',       title: 'Rain & Thunder — sleep ambience',       url: 'https://www.youtube.com/watch?v=mPZkdNFkNps' },
  { name: 'space',      title: 'Space Ambient — NASA-style drone',      url: 'https://www.youtube.com/watch?v=L_LUpnjgPso' },
];

const byName = Object.fromEntries(PRESETS.map((p) => [p.name, p]));

module.exports = { PRESETS, byName };
