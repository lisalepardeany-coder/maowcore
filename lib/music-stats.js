// Listening stats for /stats and the weekly stats post.
const history = require('./history');

const RANGES = { day: 86400000, week: 7 * 86400000, month: 30 * 86400000, all: Infinity };
const RANGE_LABEL = { day: 'last 24 hours', week: 'last 7 days', month: 'last 30 days', all: 'all time' };

// Pure (unit tested): crunch a list of history entries.
const compute = (entries, range = 'week', now = Date.now()) => {
  const span = RANGES[range] ?? RANGES.week;
  const list = entries.filter((e) => now - e.ts <= span);
  const count = (key) => {
    const m = new Map();
    for (const e of list) { const k = key(e); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byHour = new Array(24).fill(0);
  for (const e of list) byHour[new Date(e.ts).getHours()]++;
  const peak = byHour.indexOf(Math.max(...byHour));
  return {
    range,
    plays: list.length,
    seconds: list.reduce((s, e) => s + (Number(e.duration) || 0), 0),
    songs: count((e) => e.name).slice(0, 5),
    artists: count((e) => e.artist).slice(0, 5),
    listeners: count((e) => e.user || e.user_name).slice(0, 5),
    unique: new Set(list.map((e) => e.url || e.name)).size,
    peakHour: list.length ? peak : null,
  };
};

const fmtTime = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

const bar = (n, max, width = 10) => '▰'.repeat(Math.max(1, Math.round((n / max) * width))) + '▱'.repeat(Math.max(0, width - Math.max(1, Math.round((n / max) * width))));

// A Discord embed "card".
const card = (guildName, s, color = 0x5865f2) => {
  const medal = ['🥇', '🥈', '🥉', '4.', '5.'];
  const rows = (arr) => (arr.length ? arr.map(([k, n], i) => `${medal[i]} ${String(k).slice(0, 60)} · **${n}**`).join('\n') : '—');
  const maxSong = s.songs[0]?.[1] || 1;
  return {
    color,
    title: `📊 ${guildName} · ${RANGE_LABEL[s.range]}`,
    description: s.plays
      ? `**${s.plays}** plays · **${fmtTime(s.seconds)}** of music · **${s.unique}** different songs`
        + (s.peakHour != null ? `\n🕒 Busiest hour: **${String(s.peakHour).padStart(2, '0')}:00**` : '')
      : 'No music played in this period yet. Queue something with `/play`!',
    fields: s.plays ? [
      { name: '🎵 Top songs', value: s.songs.map(([k, n], i) => `${medal[i]} ${String(k).slice(0, 50)}\n\`${bar(n, maxSong)}\` ${n}`).join('\n').slice(0, 1024) || '—' },
      { name: '🎤 Top artists', value: rows(s.artists).slice(0, 1024), inline: true },
      { name: '🎧 Top listeners', value: rows(s.listeners).slice(0, 1024), inline: true },
    ] : [],
    footer: { text: 'MaowCore stats' },
    timestamp: new Date().toISOString(),
  };
};

const forGuild = (guildId, range) => compute(history.list(guildId, 5000), range);

// ISO-ish week key, used so the weekly post happens once per week.
const weekKey = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y) / 86400000 + 1) / 7)}`;
};

module.exports = { compute, card, forGuild, weekKey, fmtTime, RANGE_LABEL };
