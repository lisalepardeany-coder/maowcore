// Spotify playlists without the Spotify API.
//
// Newer Spotify developer apps get "404 / private or unavailable" for every
// playlist (albums and tracks still work). Spotify's public embed player
// still lists the tracks, so when the API refuses a playlist we read it from
// https://open.spotify.com/embed/playlist/<id> instead. Songs are built like
// the Spotify plugin's own (searched on YouTube when each one is about to play).
const ID = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\/([A-Za-z0-9]{10,30})/i;

const parseUrl = (url) => {
  const m = String(url || '').match(ID);
  return m ? { type: m[1].toLowerCase(), id: m[2] } : null;
};

// Pure (tested): pull the entity out of the embed page HTML.
const parseEmbed = (html) => {
  const m = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[1]); } catch { return null; }
  const e = j?.props?.pageProps?.state?.data?.entity;
  if (!e) return null;
  const image = (e.coverArt?.sources || e.images || []).slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
  const tracks = (e.trackList || []).filter((t) => t && t.title && t.isPlayable !== false).map((t) => ({
    id: String(t.uri || '').split(':').pop() || null,
    name: t.title,
    artists: t.subtitle || '',
    duration: Math.round((t.duration || 0) / 1000),
  })).filter((t) => t.id);
  return { name: e.name || e.title || 'Spotify playlist', image, tracks };
};

const fetchPlaylist = async (url) => {
  const p = parseUrl(url);
  if (!p || p.type !== 'playlist') throw new Error('Not a Spotify playlist link.');
  const r = await fetch(`https://open.spotify.com/embed/playlist/${p.id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`Spotify embed answered ${r.status}`);
  const data = parseEmbed(await r.text());
  if (!data?.tracks.length) throw new Error('This Spotify playlist is private or empty.');
  return { ...data, url: `https://open.spotify.com/playlist/${p.id}` };
};

// Make the Spotify plugin fall back to the embed for playlists.
const patchPlugin = (plugin) => {
  const { Song, Playlist } = require('distube');
  const orig = plugin.resolve.bind(plugin);
  plugin.resolve = async (url, options) => {
    try {
      return await orig(url, options);
    } catch (e) {
      if (parseUrl(url)?.type !== 'playlist') throw e;
      const data = await fetchPlaylist(url);
      return new Playlist({
        source: 'spotify',
        name: data.name,
        url: data.url,
        thumbnail: data.image,
        songs: data.tracks.map((t) => new Song({
          plugin, source: 'spotify', id: t.id, playFromSource: false,
          name: t.name, thumbnail: data.image, uploader: { name: t.artists },
          url: `https://open.spotify.com/track/${t.id}`, duration: t.duration,
        }, options)),
      }, options);
    }
  };
  return plugin;
};

module.exports = { parseUrl, parseEmbed, fetchPlaylist, patchPlugin };
