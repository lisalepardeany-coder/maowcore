// lrclib.net — free, no-auth source for time-synced LRC lyrics.
const API = 'https://lrclib.net/api/get';

const parseLRC = (lrc) => {
  if (!lrc) return [];
  const lines = lrc.split(/\r?\n/);
  const out = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const min = parseInt(m[1], 10);
    const sec = parseFloat(m[2]);
    out.push({ t: min * 60 + sec, text: m[3].trim() });
  }
  return out.sort((a, b) => a.t - b.t);
};

const fetchSynced = async ({ trackName, artistName, albumName, duration }) => {
  try {
    const params = new URLSearchParams();
    if (trackName) params.set('track_name', trackName);
    if (artistName) params.set('artist_name', artistName);
    if (albumName) params.set('album_name', albumName);
    if (duration) params.set('duration', String(Math.round(duration)));
    const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': 'MaowCore/1.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      plain: data.plainLyrics || null,
      synced: parseLRC(data.syncedLyrics),
      source: 'lrclib.net',
    };
  } catch {
    return null;
  }
};

const currentLine = (synced, currentTime) => {
  if (!synced?.length) return null;
  let lo = 0, hi = synced.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (synced[mid].t <= currentTime) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return { index: ans, line: synced[ans] };
};

module.exports = { fetchSynced, parseLRC, currentLine };
