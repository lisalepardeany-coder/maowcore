// /playlist — your saved playlists in one command (was /save, /load,
// /myplaylists, /deleteplaylist, /share, /importpl). The parts live unchanged
// in command-parts/; see lib/command-group.js.
const { group } = require('../lib/command-group');
const part = (name, file, description) => ({ name, module: require(`../command-parts/${file}`), description });

module.exports = group({
  name: 'playlist',
  description: 'Your saved playlists: save, load, list, delete, share, import',
  parts: [
    part('save', 'save', 'Save the current queue as a playlist'),
    part('load', 'load', 'Load one of your playlists into the queue'),
    part('list', 'myplaylists', 'Show your saved playlists'),
    part('delete', 'deleteplaylist', 'Delete one of your playlists'),
    part('share', 'share', 'Export a playlist as a file friends can import'),
    part('import', 'importpl', 'Import a playlist file shared by a friend'),
  ],
});
