// Fill in missing YouTube titles.
//
// With cookies (needed when YouTube asks "confirm you're not a bot"), the
// signed-in response that @distube/youtube reads sometimes has an empty title
// while artist/duration are fine. YouTube's public oEmbed endpoint still has
// the title, needs no login and answers fast, so we ask it for any song that
// came back nameless.
const cache = new Map();
const MAX_CACHE = 500;

const videoId = (url) => (String(url || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1] || null;

const lookup = async (url, fetchImpl = fetch) => {
  const id = videoId(url);
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  try {
    const r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    const title = String(j.title || '').trim() || null;
    if (title) {
      if (cache.size > MAX_CACHE) cache.clear();
      cache.set(id, title);
    }
    return title;
  } catch { return null; }
};

// Fix one Song or every song in a Playlist, in place. Returns how many were fixed.
const fix = async (result, fetchImpl) => {
  const songs = Array.isArray(result?.songs) ? result.songs : (result ? [result] : []);
  const missing = songs.filter((s) => s && !String(s.name || '').trim() && s.url);
  await Promise.all(missing.slice(0, 50).map(async (s) => {
    const t = await lookup(s.url, fetchImpl);
    s.name = t || (s.uploader?.name ? `${s.uploader.name} – untitled` : 'Untitled song');
  }));
  return missing.length;
};

module.exports = { fix, lookup, videoId };
