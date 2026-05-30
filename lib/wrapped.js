// Music Wrapped — Spotify-Wrapped-style yearly summary derived from
// lib/history.js. All pure aggregation; no I/O outside reading history.

const history = require('./history');

// Build a wrapped summary for a specific guild + year. Year omitted = last 365 days.
const buildWrapped = (guildId, year) => {
  const all = history.list(guildId, 500);
  let scoped;
  let label;
  if (year) {
    const start = new Date(`${year}-01-01T00:00:00`).getTime();
    const end = new Date(`${year + 1}-01-01T00:00:00`).getTime();
    scoped = all.filter((e) => e.ts >= start && e.ts < end);
    label = String(year);
  } else {
    const cutoff = Date.now() - 365 * 86400000;
    scoped = all.filter((e) => e.ts >= cutoff);
    label = 'last 365 days';
  }
  if (!scoped.length) {
    return { label, empty: true, total: 0, totalSec: 0 };
  }

  // Totals
  const total = scoped.length;
  const totalSec = scoped.reduce((s, e) => s + (e.duration || 0), 0);

  // Top tracks (by play count)
  const byName = new Map();
  for (const e of scoped) byName.set(e.name, (byName.get(e.name) || 0) + 1);
  const topTracks = [...byName.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, plays]) => ({ name, plays }));

  // Top artists (by play count) — uses e.artist when populated
  const byArtist = new Map();
  for (const e of scoped) {
    if (!e.artist) continue;
    byArtist.set(e.artist, (byArtist.get(e.artist) || 0) + 1);
  }
  const topArtists = [...byArtist.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, plays]) => ({ name, plays }));

  // Per-month breakdown — 12 buckets
  const byMonth = new Array(12).fill(0);
  for (const e of scoped) byMonth[new Date(e.ts).getMonth()]++;

  // Listening streak — longest run of consecutive days with at least 1 play
  const dayKeys = new Set(scoped.map((e) => new Date(e.ts).toISOString().slice(0, 10)));
  const sortedDays = [...dayKeys].sort();
  let streak = 0;
  let bestStreak = 0;
  let prev = null;
  for (const d of sortedDays) {
    if (prev) {
      const diff = (new Date(d) - new Date(prev)) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    bestStreak = Math.max(bestStreak, streak);
    prev = d;
  }

  // Top listeners (most-active users)
  const byUser = new Map();
  for (const e of scoped) {
    if (!e.user) continue;
    byUser.set(e.user, (byUser.get(e.user) || 0) + 1);
  }
  const topUsers = [...byUser.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([user, plays]) => ({ user, plays }));

  // Discovery score — fraction of plays that were the FIRST time we saw the song
  const firstSeen = new Map();
  for (let i = all.length - 1; i >= 0; i--) firstSeen.set(all[i].name, all[i].ts);
  const newPlays = scoped.filter((e) => firstSeen.get(e.name) === e.ts).length;
  const discoveryPct = total > 0 ? Math.round((newPlays / total) * 100) : 0;

  // Most-active hour of day (0-23)
  const byHour = new Array(24).fill(0);
  for (const e of scoped) byHour[new Date(e.ts).getHours()]++;
  const peakHour = byHour.indexOf(Math.max(...byHour));

  // Most-active day of week (Sun=0..Sat=6)
  const byDow = new Array(7).fill(0);
  for (const e of scoped) byDow[new Date(e.ts).getDay()]++;
  const peakDow = byDow.indexOf(Math.max(...byDow));

  return {
    label,
    empty: false,
    total,
    totalSec,
    totalMinutes: Math.round(totalSec / 60),
    totalHours: Math.round(totalSec / 3600),
    uniqueTracks: byName.size,
    uniqueArtists: byArtist.size,
    discoveryPct,
    newDiscoveries: newPlays,
    bestStreak,
    activeDays: dayKeys.size,
    topTracks,
    topArtists,
    topUsers,
    byMonth,
    byHour,
    byDow,
    peakHour,
    peakDow,
  };
};

// Year list — years where we have at least one play. Plus a sentinel for "last 365 days".
const availableYears = (guildId) => {
  const all = history.list(guildId, 500);
  const years = new Set();
  for (const e of all) years.add(new Date(e.ts).getFullYear());
  return [...years].sort((a, b) => b - a);
};

module.exports = { buildWrapped, availableYears };
