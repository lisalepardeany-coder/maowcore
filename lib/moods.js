// Mood auto-DJ: build a short queue for a mood from the server's own taste.
//
// Plan = your top artists + a mood word ("<artist> chill"), a couple of your
// highest-rated songs, and generic mood searches to fill up. The pure planner
// is unit tested; resolve() turns the plan into YouTube URLs.
const history = require('./history');

const MOODS = {
  chill:  { label: 'Chill',  emoji: '🌙', words: ['chill', 'lofi', 'acoustic'], fill: ['lofi hip hop chill beats', 'chill indie acoustic', 'chillwave'] },
  spooky: { label: 'Spooky', emoji: '🎃', words: ['dark', 'creepy', 'eerie'], fill: ['dark ambient horror music', 'darksynth', 'creepy atmospheric music'] },
  hype:   { label: 'Hype',   emoji: '⚡', words: ['remix', 'hype', 'energetic'], fill: ['hype gaming music mix', 'energetic edm', 'phonk mix'] },
  focus:  { label: 'Focus',  emoji: '🎯', words: ['instrumental', 'ambient', 'focus'], fill: ['deep focus instrumental music', 'study ambient music', 'post rock instrumental'] },
  happy:  { label: 'Happy',  emoji: '☀️', words: ['upbeat', 'happy', 'feel good'], fill: ['feel good upbeat songs', 'happy indie pop', 'summer good vibes'] },
  sad:    { label: 'Sad',    emoji: '🌧', words: ['sad', 'slowed', 'piano'], fill: ['sad songs playlist', 'melancholic piano', 'slowed reverb sad'] },
  cozy:   { label: 'Cozy',   emoji: '🍵', words: ['cozy', 'jazz', 'soft'], fill: ['cozy coffee shop jazz', 'soft folk cozy', 'rainy day jazz'] },
  space:  { label: 'Space',  emoji: '🚀', words: ['ambient', 'synth', 'space'], fill: ['space ambient music', 'synthwave space', 'sci fi ambient soundtrack'] },
};

const pick = (arr, n, rnd = Math.random) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};

// Pure: what to search / queue. entries = history, rated = [{url,name,avg}]
const plan = (mood, entries, rated = [], { size = 8, rnd = Math.random } = {}) => {
  const m = MOODS[mood];
  if (!m) throw new Error(`Unknown mood: ${mood}`);
  const counts = new Map();
  for (const e of entries) if (e.artist) counts.set(e.artist, (counts.get(e.artist) || 0) + 1);
  const topArtists = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a]) => a);
  const favs = pick(rated.filter((r) => r.avg >= 4 && r.url), 2, rnd).map((r) => ({ url: r.url, why: `rated ${r.avg.toFixed(1)}★` }));
  const searches = pick(topArtists, Math.min(4, size - favs.length), rnd)
    .map((a) => ({ query: `${a} ${pick(m.words, 1, rnd)[0]}`, why: `you play ${a}` }));
  const fill = pick(m.fill, m.fill.length, rnd);
  let i = 0;
  while (favs.length + searches.length < size && i < size * 2) {
    searches.push({ query: `${fill[i % fill.length]}${i >= fill.length ? ` ${i}` : ''}`, why: `${m.label.toLowerCase()} mix` });
    i++;
  }
  return { mood: m, items: [...favs, ...searches].slice(0, size) };
};

// Turn the plan into playable URLs (skips anything that fails).
const resolve = async (youtubePlugin, p) => {
  const seen = new Set();
  const out = [];
  for (const it of p.items) {
    try {
      let url = it.url;
      let name = null;
      if (!url) {
        const res = await youtubePlugin.search(it.query, { limit: 3, type: 'video' });
        const hit = (res || []).find((r) => r?.url && !seen.has(r.url) && (!r.duration || r.duration < 15 * 60));
        url = hit?.url; name = hit?.name;
      }
      if (url && !seen.has(url)) { seen.add(url); out.push({ url, name, why: it.why }); }
    } catch { /* skip */ }
  }
  return out;
};

const ratedFor = (guildId) => { try { return require('./ratings').topRated(guildId, 30); } catch { return []; } };
const forGuild = (mood, guildId, opts) => plan(mood, history.list(guildId, 1000), ratedFor(guildId), opts);

module.exports = { MOODS, plan, resolve, forGuild };
