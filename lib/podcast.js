// Minimal RSS parser for podcasts. No deps — uses regex (good enough for valid feeds).
const { getGuild, updateGuild } = require('./config');

const fetchFeed = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'MaowCore/1.0' } });
  if (!res.ok) throw new Error(`Feed fetch ${res.status}`);
  const xml = await res.text();
  const titleM = xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/);
  const podTitle = (titleM ? decodeEntities(stripCdata(titleM[1])) : 'Untitled').trim();
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < 50) {
    const block = m[1];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const enclosure = (block.match(/<enclosure[^>]*url=["']([^"']+)["']/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    items.push({
      title: decodeEntities(stripCdata(title)).trim(),
      audioUrl: enclosure,
      pubDate: pubDate.trim(),
    });
  }
  return { title: podTitle, items };
};

const stripCdata = (s) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const getSubs = (guildId) => {
  const g = getGuild(guildId);
  if (!g.podcasts) g.podcasts = {};
  return g.podcasts;
};

const subscribe = (guildId, name, url) => {
  const subs = getSubs(guildId);
  subs[name] = { url, addedAt: Date.now() };
  updateGuild(guildId, { podcasts: subs });
};

const unsubscribe = (guildId, name) => {
  const subs = getSubs(guildId);
  delete subs[name];
  updateGuild(guildId, { podcasts: subs });
};

const list = (guildId) => Object.entries(getSubs(guildId)).map(([name, info]) => ({ name, ...info }));

module.exports = { fetchFeed, subscribe, unsubscribe, list, getSubs };
