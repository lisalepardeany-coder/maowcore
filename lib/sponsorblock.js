// SponsorBlock integration — auto-skips non-music segments inside YouTube videos.
// API docs: https://wiki.sponsor.ajay.app/w/API_Docs
const { getGuild } = require('./config');

const API = 'https://sponsor.ajay.app/api/skipSegments';
const CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic'];

const videoIdFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};

const fetchSegments = async (videoId) => {
  const qs = new URLSearchParams();
  qs.set('videoID', videoId);
  CATEGORIES.forEach((c) => qs.append('category', c));
  const res = await fetch(`${API}?${qs.toString()}`, {
    headers: { 'User-Agent': 'MaowCore/1.0' },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`SponsorBlock API ${res.status}`);
  const data = await res.json();
  return data
    .map((d) => ({ start: d.segment[0], end: d.segment[1], category: d.category }))
    .sort((a, b) => a.start - b.start);
};

class SponsorBlockManager {
  constructor() {
    this.timers = new Map();        // guildId -> [Timeout]
    this.cache = new Map();         // videoId -> segments[]
  }

  isEnabled(guildId) {
    return !!getGuild(guildId).sponsorblock;
  }

  clearForGuild(guildId) {
    const timers = this.timers.get(guildId);
    if (timers) timers.forEach(clearTimeout);
    this.timers.delete(guildId);
  }

  async onPlay(queue, song, log) {
    this.clearForGuild(queue.id);
    if (!this.isEnabled(queue.id)) return;
    const videoId = videoIdFromUrl(song.url);
    if (!videoId) return;

    let segments;
    try {
      if (this.cache.has(videoId)) segments = this.cache.get(videoId);
      else {
        segments = await fetchSegments(videoId);
        this.cache.set(videoId, segments);
      }
    } catch (e) {
      log?.(`SponsorBlock fetch failed: ${e.message}`, 'warn');
      return;
    }
    if (!segments.length) return;
    log?.(`SponsorBlock: ${segments.length} segment(s) flagged`);

    const timers = [];
    for (const seg of segments) {
      const delay = Math.max(0, (seg.start - (queue.currentTime || 0)) * 1000);
      const t = setTimeout(() => {
        try {
          const q = queue.distube?.getQueue?.(queue.id);
          if (!q || q.songs[0]?.url !== song.url) return;
          q.seek(Math.ceil(seg.end));
          log?.(`SponsorBlock: skipped ${seg.category} (${Math.floor(seg.start)}s → ${Math.ceil(seg.end)}s)`);
        } catch (e) {
          log?.(`SponsorBlock skip failed: ${e.message}`, 'warn');
        }
      }, delay);
      timers.push(t);
    }
    this.timers.set(queue.id, timers);
  }
}

module.exports = { SponsorBlockManager };
