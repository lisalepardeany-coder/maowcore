// Minimal Spotify API client for audio-features and track search.
// Reuses the same credentials as @distube/spotify.

let cachedToken = null;
let tokenExpiresAt = 0;

const featuresCache = new Map();   // trackId -> features OR { failedAt } sentinel
const idCache = new Map();         // url|name|artist -> trackId
const CACHE_MAX = 500;
// How long to remember a failed fetch before re-trying. Spotify removed the
// /v1/audio-features endpoint for non-grandfathered apps in late 2024 — once
// we know it's dead for this app, hammering it on every play is wasteful.
const FAILURE_TTL_MS = 30 * 60 * 1000;  // 30 minutes

const trim = (m) => {
  if (m.size > CACHE_MAX) {
    const firstKey = m.keys().next().value;
    if (firstKey !== undefined) m.delete(firstKey);
  }
};

const getToken = async () => {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = await res.json();
  cachedToken = data.access_token || null;
  tokenExpiresAt = Date.now() + (data.expires_in || 0) * 1000;
  return cachedToken;
};

const extractTrackId = (url) => {
  if (!url) return null;
  const m = String(url).match(/spotify[.:](?:com\/track\/|track[:/])([A-Za-z0-9]+)/);
  return m ? m[1] : null;
};

const searchTrackId = async (name, artist = '') => {
  const key = `${name}|${artist}`.toLowerCase();
  if (idCache.has(key)) return idCache.get(key);
  const t = await getToken();
  if (!t) return null;
  const q = encodeURIComponent(`${name} ${artist}`.trim());
  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`, {
    headers: { 'Authorization': `Bearer ${t}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const id = data.tracks?.items?.[0]?.id || null;
  idCache.set(key, id);
  trim(idCache);
  return id;
};

const getAudioFeatures = async (trackId) => {
  if (!trackId) return null;
  const cached = featuresCache.get(trackId);
  if (cached) {
    // Failure sentinel — re-try after TTL elapses, otherwise skip the API.
    if (cached._failedAt) {
      if (Date.now() - cached._failedAt < FAILURE_TTL_MS) return null;
      featuresCache.delete(trackId);
    } else {
      return cached;
    }
  }
  const t = await getToken();
  if (!t) {
    featuresCache.set(trackId, { _failedAt: Date.now() });
    trim(featuresCache);
    return null;
  }
  const res = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
    headers: { 'Authorization': `Bearer ${t}` },
  });
  if (!res.ok) {
    // Cache the failure too so we don't pound the endpoint for tracks Spotify
    // refuses to return features for (403 since the late-2024 deprecation).
    featuresCache.set(trackId, { _failedAt: Date.now() });
    trim(featuresCache);
    return null;
  }
  const data = await res.json();
  featuresCache.set(trackId, data);
  trim(featuresCache);
  return data;
};

const KEY_NAMES = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
const formatKey = (key, mode) => {
  if (key == null || key < 0 || key > 11) return '—';
  return `${KEY_NAMES[key]} ${mode === 0 ? 'minor' : 'major'}`;
};

// Attach features to a song object (populates song.features on resolve).
const attachFeatures = async (song) => {
  let trackId = extractTrackId(song.url) || song.spotifyId;
  if (!trackId && song.name) {
    trackId = await searchTrackId(song.name, song.uploader?.name);
  }
  if (!trackId) return null;
  const f = await getAudioFeatures(trackId);
  if (f) {
    song.features = {
      tempo: Math.round(f.tempo),
      key: formatKey(f.key, f.mode),
      energy: f.energy,
      danceability: f.danceability,
      valence: f.valence,
    };
  }
  return song.features || null;
};

module.exports = { attachFeatures, getAudioFeatures, extractTrackId, searchTrackId, formatKey };
