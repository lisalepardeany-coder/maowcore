// External integrations for v2.2.0.
//   - Last.fm scrobbling: notifies last.fm when a track plays
//   - Discord rich presence: updates the bot's status to show current song
//   - Apple Music / YouTube Music search hooks (optional, just URL builders)
//
// All integrations are opt-in via env vars. Without them set, the module
// silently does nothing.

const crypto = require('node:crypto');

// === Last.fm ===
// Set LASTFM_API_KEY + LASTFM_API_SECRET + LASTFM_SESSION_KEY in env.
// LASTFM_SESSION_KEY is obtained per-user via Last.fm's auth flow; for
// most operators this can be set once via the official Last.fm app
// authorization.

const lastfmConfigured = () =>
  !!(process.env.LASTFM_API_KEY && process.env.LASTFM_API_SECRET && process.env.LASTFM_SESSION_KEY);

const lastfmSign = (params) => {
  // Build the signature string per the Last.fm spec: concatenate
  // alphabetized "keyvalue" pairs (excluding `format` and `callback`)
  // + the secret, then MD5.
  const keys = Object.keys(params).filter((k) => k !== 'format' && k !== 'callback').sort();
  const str = keys.map((k) => `${k}${params[k]}`).join('') + process.env.LASTFM_API_SECRET;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
};

const scrobble = async ({ artist, track, album, durationSec }) => {
  if (!lastfmConfigured() || !artist || !track) return { ok: false, reason: 'not configured' };
  const params = {
    method: 'track.scrobble',
    artist,
    track,
    timestamp: Math.floor(Date.now() / 1000),
    api_key: process.env.LASTFM_API_KEY,
    sk: process.env.LASTFM_SESSION_KEY,
  };
  if (album) params.album = album;
  if (durationSec) params.duration = String(Math.round(durationSec));
  params.api_sig = lastfmSign(params);
  params.format = 'json';
  try {
    const res = await fetch('https://ws.audioscrobbler.com/2.0/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const data = await res.json();
    if (data.error) return { ok: false, reason: data.message };
    return { ok: true, response: data };
  } catch (e) { return { ok: false, reason: e.message }; }
};

const nowPlaying = async ({ artist, track, album, durationSec }) => {
  if (!lastfmConfigured() || !artist || !track) return { ok: false };
  const params = {
    method: 'track.updateNowPlaying',
    artist, track,
    api_key: process.env.LASTFM_API_KEY,
    sk: process.env.LASTFM_SESSION_KEY,
  };
  if (album) params.album = album;
  if (durationSec) params.duration = String(Math.round(durationSec));
  params.api_sig = lastfmSign(params);
  params.format = 'json';
  try {
    await fetch('https://ws.audioscrobbler.com/2.0/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    return { ok: true };
  } catch (e) { return { ok: false, reason: e.message }; }
};

// === Cross-service search URL builders ===
// Quick helpers for the dashboard to surface "search this track on other
// services" links. No API key needed.
const searchUrls = (title, artist) => {
  const q = encodeURIComponent(`${title || ''} ${artist || ''}`.trim());
  return {
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    youtubeMusic: `https://music.youtube.com/search?q=${q}`,
    spotify: `https://open.spotify.com/search/${q}`,
    appleMusic: `https://music.apple.com/search?term=${q}`,
    soundcloud: `https://soundcloud.com/search?q=${q}`,
    bandcamp: `https://bandcamp.com/search?q=${q}`,
    lastfm: artist ? `https://www.last.fm/music/${encodeURIComponent(artist)}/_/${encodeURIComponent(title || '')}` : `https://www.last.fm/search?q=${q}`,
  };
};

module.exports = { lastfmConfigured, scrobble, nowPlaying, searchUrls };
