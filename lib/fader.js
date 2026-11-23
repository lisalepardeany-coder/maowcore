// Smooth song changes ("crossfade", /crossfade): the song fades in over the
// first seconds and fades out over the last seconds, using the live volume
// (no ffmpeg filter, so the stream never restarts).
const FADE_IN_MS = 3000;
const FADE_OUT_MS = 5000;
const STEP_MS = 150;

const timers = new Map();   // guildId -> { ramp, out, target }
const targets = new Map();  // guildId -> the "real" volume (survives between songs)
const lastTarget = (guildId) => targets.get(guildId);

const clear = (guildId) => {
  const t = timers.get(guildId);
  if (!t) return;
  clearInterval(t.ramp); clearTimeout(t.out);
  timers.delete(guildId);
};

// Pure: the volume at a point of a ramp (unit tested).
const rampVolume = (from, to, elapsedMs, totalMs) => {
  if (elapsedMs >= totalMs) return to;
  const p = Math.max(0, elapsedMs / totalMs);
  const eased = p * p * (3 - 2 * p);   // smoothstep: gentle at both ends
  return Math.round(from + (to - from) * eased);
};

const ramp = (queue, from, to, ms, state, done) => {
  const start = Date.now();
  let last = from;
  try { queue.setVolume(from); } catch { return; }
  clearInterval(state.ramp);
  state.ramp = setInterval(() => {
    // Someone changed the volume by hand during the fade: stop fading and keep theirs.
    if (queue.volume !== last) { clearInterval(state.ramp); state.target = queue.volume; targets.set(queue.id, queue.volume); return; }
    const v = rampVolume(from, to, Date.now() - start, ms);
    try { queue.setVolume(v); last = v; } catch { clearInterval(state.ramp); return; }
    if (v === to) { clearInterval(state.ramp); done?.(); }
  }, STEP_MS);
};

// Call when a song starts. target = the volume the song should end up at.
const onSongStart = (queue, song, target) => {
  clear(queue.id);
  targets.set(queue.id, target);
  const state = { ramp: null, out: null, target };
  timers.set(queue.id, state);
  ramp(queue, Math.max(1, Math.round(target * 0.05)), target, FADE_IN_MS, state);
  const dur = Number(song?.duration) || 0;
  if (dur * 1000 > FADE_IN_MS + FADE_OUT_MS + 5000 && !song?.isLive) {
    const at = dur * 1000 - FADE_OUT_MS - Math.max(0, (queue.currentTime || 0) * 1000);
    state.out = setTimeout(() => {
      if (queue.repeatMode === 1) return;   // looping one song: don't fade it out
      ramp(queue, queue.volume, Math.max(1, Math.round(state.target * 0.05)), FADE_OUT_MS, state);
    }, at);
  }
};

// The volume to use for the next song when the server has no saved volume.
// (queue.volume can still be at the faded-out level from the last song.)
const targetFor = (queue) => {
  const t = targets.get(queue.id);
  return typeof t === 'number' ? t : (queue.volume || 100);
};

module.exports = { onSongStart, clear, rampVolume, lastTarget, targetFor, FADE_IN_MS, FADE_OUT_MS };
