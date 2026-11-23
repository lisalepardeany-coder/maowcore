// Per-guild Pomodoro: alternates focus and break blocks.
// Each phase replaces what's playing (it used to queue up behind it, so after
// a few cycles the music no longer matched the phase). Focus can use a calm
// ambience loop (/ambience presets) instead of music.
const sessions = new Map();

const PRESET_FOCUS = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';  // lofi
const PRESET_BREAK = 'https://www.youtube.com/watch?v=DWcJFNfaw9c';  // ambient

const stop = (guildId, distube) => {
  const s = sessions.get(guildId);
  if (s?.timer) clearTimeout(s.timer);
  sessions.delete(guildId);
  if (s && distube) distube.getQueue(guildId)?.stop().catch(() => {});
  return !!s;
};

const status = (guildId) => {
  const s = sessions.get(guildId);
  return s ? { phase: s.phase, endsAt: s.endsAt, round: s.round } : null;
};

const cycle = async (distube, guildId, voiceChannel, textChannel, member, opts) => {
  const s = sessions.get(guildId);
  if (!s) return;
  s.phase = s.phase === 'focus' ? 'break' : 'focus';
  if (s.phase === 'focus') s.round = (s.round || 0) + 1;
  const mins = s.phase === 'focus' ? opts.focusMin : opts.breakMin;
  s.endsAt = Date.now() + mins * 60000;
  try {
    await distube.getQueue(guildId)?.stop().catch(() => {});
    if (s.phase === 'focus' && opts.ambience) {
      await require('./ambience').playIn(distube.client, voiceChannel, opts.ambience, { volume: opts.volume || 30, textChannel, member });
    } else {
      const url = s.phase === 'focus' ? opts.focusUrl : opts.breakUrl;
      if (url) await distube.play(voiceChannel, url, { textChannel, member, metadata: { quiet: true } });
    }
  } catch { /* keep the timer going even if a stream fails */ }
  const ts = Math.floor(s.endsAt / 1000);
  textChannel?.send({ content: s.phase === 'focus' ? `🍅 **Focus ${s.round}** — ${mins} min (until <t:${ts}:t>)` : `☕ **Break** — ${mins} min (back <t:${ts}:t>)` }).catch(() => {});
  s.timer = setTimeout(() => cycle(distube, guildId, voiceChannel, textChannel, member, opts), mins * 60000);
};

const start = (distube, guildId, voiceChannel, textChannel, member, opts) => {
  stop(guildId);
  const session = { phase: 'break' /* flips to focus on the first cycle */, timer: null, round: 0 };
  sessions.set(guildId, session);
  cycle(distube, guildId, voiceChannel, textChannel, member, opts);
};

module.exports = { start, stop, status, PRESET_FOCUS, PRESET_BREAK };
