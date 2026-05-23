// Per-guild Pomodoro state machine. Alternates focus + break with playlists.
const sessions = new Map();

const PRESET_FOCUS = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';  // lofi
const PRESET_BREAK = 'https://www.youtube.com/watch?v=DWcJFNfaw9c';  // ambient

const stop = (guildId) => {
  const s = sessions.get(guildId);
  if (s?.timer) clearTimeout(s.timer);
  sessions.delete(guildId);
};

const cycle = async (distube, guildId, voiceChannel, textChannel, member, opts) => {
  const s = sessions.get(guildId);
  if (!s) return;
  s.phase = s.phase === 'focus' ? 'break' : 'focus';
  const durMs = (s.phase === 'focus' ? opts.focusMin : opts.breakMin) * 60 * 1000;
  const url = s.phase === 'focus' ? opts.focusUrl : opts.breakUrl;
  try {
    await distube.play(voiceChannel, url, { textChannel, member });
  } catch { /* ignored */ }
  textChannel?.send({ content: s.phase === 'focus' ? `🍅 Focus block — ${opts.focusMin} min` : `☕ Break — ${opts.breakMin} min` }).catch(() => {});
  s.timer = setTimeout(() => cycle(distube, guildId, voiceChannel, textChannel, member, opts), durMs);
};

const start = (distube, guildId, voiceChannel, textChannel, member, opts) => {
  stop(guildId);
  const session = { phase: 'break' /* will flip to focus on first cycle */, timer: null };
  sessions.set(guildId, session);
  cycle(distube, guildId, voiceChannel, textChannel, member, opts);
};

module.exports = { start, stop, PRESET_FOCUS, PRESET_BREAK };
