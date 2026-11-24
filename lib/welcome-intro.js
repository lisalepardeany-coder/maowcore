// Server welcome sound before the first song of a music session.
//
// When a queue is created (initQueue) we start looking up the welcome sound
// in the background. When its first song starts (playSong), the welcome sound
// is put in front: [welcome, the song, ...rest], and we skip to it. So people
// hear the welcome sound first, then the song from its start.
//
// Before this, the welcome sound only played when the bot joined with an
// empty queue, so joining through /play (the usual way) never played it.
const pending = new Map(); // queue → Promise<Song|null>

// A new session: start the lookup now so it's ready when the song starts.
const prepare = (distube, queue, url, log = () => {}) => {
  if (!url) return;
  const p = distube.handler.resolve(url, { metadata: { welcomeIntro: true, localName: '👋 Welcome sound' } })
    .then((s) => (s && Array.isArray(s.songs) ? s.songs[0] || null : s))   // a playlist link: its first song
    .catch((e) => { log(`Welcome sound couldn't be loaded: ${e.message}`); return null; });
  pending.set(queue, p);
};

// The intro for this queue, once. True when it took over (the caller should
// then skip its own "now playing" work for `song`, which plays again next).
const maybeIntro = async (queue, song) => {
  const p = pending.get(queue);
  if (!p) return false;
  pending.delete(queue);
  if (song?.metadata?.welcomeIntro) return false;
  const intro = await p;
  if (!intro || !queue.songs?.length || queue.songs[0] !== song) return false;  // gone or moved on meanwhile
  queue.songs.splice(1, 0, intro, song);
  await queue.skip();
  return true;
};

const isIntro = (song) => !!song?.metadata?.welcomeIntro;
const forget = (queue) => pending.delete(queue);

module.exports = { prepare, maybeIntro, isIntro, forget, _pending: pending };
