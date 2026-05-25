// Per-guild sleep timers. Triggers a fade-out + queue stop + voice leave.
const timers = new Map();   // guildId -> { mainTimeout, fadeInterval, scheduledFor }

const cancel = (guildId) => {
  const e = timers.get(guildId);
  if (!e) return false;
  clearTimeout(e.mainTimeout);
  // fadeKickoff is a setTimeout that, if it fires after cancel, starts a fade
  // interval which then orphans (because the map entry is gone). Always clear.
  if (e.fadeKickoff) clearTimeout(e.fadeKickoff);
  if (e.fadeInterval) clearInterval(e.fadeInterval);
  timers.delete(guildId);
  return true;
};

const schedule = (distube, guildId, minutes, { fadeSeconds = 15 } = {}) => {
  cancel(guildId);
  const totalMs = minutes * 60 * 1000;
  const fadeMs = Math.min(fadeSeconds * 1000, totalMs);
  const fadeStartDelay = totalMs - fadeMs;

  let fadeInterval = null;

  const mainTimeout = setTimeout(() => {
    const queue = distube.getQueue(guildId);
    if (queue) {
      try { queue.stop(); } catch { /* ignored */ }
    }
    try { distube.voices.get(guildId)?.leave(); } catch { /* ignored */ }
    timers.delete(guildId);
  }, totalMs);

  // Schedule the fade-out
  const fadeKickoff = setTimeout(() => {
    const queue = distube.getQueue(guildId);
    if (!queue) return;
    const startVol = queue.volume;
    const steps = 30;
    let step = 0;
    fadeInterval = setInterval(() => {
      step++;
      const next = Math.max(0, Math.round(startVol * (1 - step / steps)));
      try { queue.setVolume(next); } catch { /* ignored */ }
      if (step >= steps) {
        clearInterval(fadeInterval);
        fadeInterval = null;
      }
    }, fadeMs / 30);
    const e = timers.get(guildId);
    if (e) e.fadeInterval = fadeInterval;
  }, fadeStartDelay);

  timers.set(guildId, { mainTimeout, fadeInterval, fadeKickoff, scheduledFor: Date.now() + totalMs });
};

const status = (guildId) => {
  const e = timers.get(guildId);
  if (!e) return null;
  return { remainingMs: Math.max(0, e.scheduledFor - Date.now()) };
};

module.exports = { schedule, cancel, status };
