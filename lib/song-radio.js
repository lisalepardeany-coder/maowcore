// Song radio ("more like this"): queue songs related to the one playing,
// skipping anything already queued or played recently.
const history = require('./history');

// Pure (tested): pick fresh related songs.
const pickFresh = (related, { queued = [], recent = [], count = 5 } = {}) => {
  const seen = new Set([...queued, ...recent].filter(Boolean).map(String));
  const out = [];
  for (const s of related || []) {
    if (!s?.url || seen.has(s.url)) continue;
    if (s.isLive || (s.duration && s.duration > 15 * 60)) continue;   // no 2-hour mixes or livestreams
    seen.add(s.url);
    out.push(s);
    if (out.length >= count) break;
  }
  return out;
};

const addSimilar = async (client, queue, { count = 5, member } = {}) => {
  const current = queue?.songs?.[0];
  if (!current) throw new Error('Nothing is playing.');
  const yt = client.youtubePlugin;
  let related = [];
  try { related = await yt.getRelatedSongs(current); } catch { related = []; }
  // Spotify/SoundCloud songs have no YouTube "related" list: search instead.
  if (!related?.length) {
    const q = `${current.uploader?.name || ''} ${current.name} similar songs`.trim();
    related = await yt.search(q, { limit: 15, type: 'video' }).catch(() => []);
  }
  const picks = pickFresh(related, {
    queued: queue.songs.map((s) => s.url),
    recent: history.list(queue.id, 60).map((e) => e.url),
    count,
  });
  if (!picks.length) throw new Error('No new similar songs found.');
  const pl = await client.distube.createCustomPlaylist(picks.map((s) => s.url), {
    member, parallel: true, name: `📻 More like ${current.name}`.slice(0, 90), metadata: { quiet: true },
  });
  await client.distube.play(queue.voice.channel, pl, { member, textChannel: queue.textChannel, metadata: { quiet: true } });
  return { added: pl.songs.length, names: pl.songs.map((s) => s.name), seed: current.name };
};

module.exports = { pickFresh, addSimilar };
