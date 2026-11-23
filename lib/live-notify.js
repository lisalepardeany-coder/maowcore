'use strict';
// lib/live-notify.js
// Watches a Twitch channel (go-live) and a YouTube channel (new uploads /
// premieres / livestreams) per guild, and posts a notification — pinging the
// opt-in 🔴 Live Notifs role — into the configured channel.
//
// Twitch needs an app: set TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET in .env
//   (create one free at https://dev.twitch.tv/console/apps). Without them the
//   Twitch poller no-ops; YouTube needs NO key (it reads the public RSS feed).
//
// Per-guild config (set via /livenotify, or liveChannelId via /setup):
//   twitchLogin          — twitch username to watch
//   youtubeChannelId     — resolved UC… channel id
//   youtubeChannelName   — display name (best-effort)
//   liveChannelId        — where to post (set by /setup go-live channel)
//   notifyChannelId      — override target channel
//   liveNotifyRoleId     — role to ping (🔴 Live Notifs)
// Persisted state:
//   twitchWasLive, lastTwitchStreamId, lastYoutubeVideoId

const { EmbedBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('./config');

const UA = 'MaowCore/1.0 (+https://github.com/lisalepardeany-coder/maowcore)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── input resolvers ──────────────────────────────────────────────────────────

// twitch.tv/Name | @Name | Name → lowercase login
function resolveTwitch(input) {
  const s = String(input || '').trim().replace(/\/+$/, '');
  const m = s.match(/twitch\.tv\/([A-Za-z0-9_]{2,40})/i);
  return (m ? m[1] : s.replace(/^@/, '')).toLowerCase().replace(/[^a-z0-9_]/g, '');
}

// Resolve any YouTube channel reference to a UC… id (+ name when we can find it).
async function resolveYouTube(input) {
  let s = String(input || '').trim();
  // already a channel id
  let m = s.match(/(UC[\w-]{20,})/);
  if (m && !/watch\?/.test(s)) return { channelId: m[1], name: null };

  let url;
  if (/^https?:\/\//i.test(s)) url = s;
  else if (s.startsWith('@')) url = `https://www.youtube.com/${s}`;
  else url = `https://www.youtube.com/@${s.replace(/^@/, '')}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en' } });
    if (!res.ok) return null;
    const html = await res.text();
    m = html.match(/"(?:externalId|channelId)":"(UC[\w-]+)"/)
      || html.match(/\/channel\/(UC[\w-]+)/)
      || html.match(/<meta itemprop="(?:identifier|channelId)" content="(UC[\w-]+)"/);
    if (!m) return null;
    const nameM = html.match(/<meta property="og:title" content="([^"]+)"/)
      || html.match(/"author":"([^"]+)"/);
    return { channelId: m[1], name: nameM ? decodeXml(nameM[1]) : null };
  } catch { return null; }
}

// ── Twitch Helix ─────────────────────────────────────────────────────────────

let twitchToken = null, twitchTokenExp = 0;
async function twitchAppToken() {
  const id = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (twitchToken && Date.now() < twitchTokenExp) return twitchToken;
  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`, { method: 'POST' });
  if (!res.ok) return null;
  const j = await res.json();
  twitchToken = j.access_token;
  twitchTokenExp = Date.now() + Math.max(0, (j.expires_in || 3600) - 60) * 1000;
  return twitchToken;
}

// undefined = creds missing / API error · null = offline · object = live stream
async function twitchStream(login) {
  const token = await twitchAppToken();
  if (!token) return undefined;
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
    headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) { twitchToken = null; return undefined; }
  if (!res.ok) return undefined;
  const j = await res.json();
  return j.data?.[0] || null;
}

function twitchEmbed(login, s) {
  const thumb = (s.thumbnail_url || '').replace('{width}', '640').replace('{height}', '360');
  return new EmbedBuilder()
    .setColor(0x9146FF)
    .setAuthor({ name: `${s.user_name || login} is now LIVE on Twitch` })
    .setTitle(s.title?.slice(0, 256) || 'Live now!')
    .setURL(`https://twitch.tv/${login}`)
    .addFields(
      { name: 'Game', value: s.game_name || '—', inline: true },
      { name: 'Viewers', value: String(s.viewer_count ?? 0), inline: true },
    )
    .setImage(thumb ? `${thumb}?t=${Date.now()}` : null)
    .setFooter({ text: 'Twitch · go watch! 🟣' })
    .setTimestamp();
}

// ── YouTube RSS ──────────────────────────────────────────────────────────────

function decodeXml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#0?39;/g, "'");
}

async function youtubeEntries(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((mm) => {
    const e = mm[1];
    const id = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = decodeXml((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const author = decodeXml((e.match(/<author>[\s\S]*?<name>([^<]*)<\/name>/) || [])[1]);
    const published = (e.match(/<published>([^<]+)<\/published>/) || [])[1];
    return { id, title, author, published };
  }).filter((v) => v.id);
}

function youtubeEmbed(v) {
  return new EmbedBuilder()
    .setColor(0xFF0000)
    .setAuthor({ name: `${v.author || 'YouTube'} posted a new video` })
    .setTitle(v.title?.slice(0, 256) || 'New video')
    .setURL(`https://www.youtube.com/watch?v=${v.id}`)
    .setImage(`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)
    .setFooter({ text: 'YouTube · new upload 📹' })
    .setTimestamp(v.published ? new Date(v.published) : new Date());
}

// ── posting ──────────────────────────────────────────────────────────────────

async function targetChannel(client, cfg) {
  const id = cfg.notifyChannelId || cfg.liveChannelId || cfg.announcementsChannelId;
  if (!id) return null;
  return client.channels.fetch(id).catch(() => null);
}

async function announce(channel, cfg, content, embed) {
  const roleId = cfg.liveNotifyRoleId;
  const ping = roleId && channel.guild?.roles.cache.has(roleId);
  await channel.send({
    content: ping ? `<@&${roleId}> ${content}` : content,
    embeds: [embed],
    allowedMentions: ping ? { roles: [roleId] } : { parse: [] },
  }).catch((e) => console.warn('[live-notify] send:', e.message));
}

// ── pollers ──────────────────────────────────────────────────────────────────

async function pollTwitch(client, guildId, cfg) {
  if (!cfg.twitchLogin) return;
  const stream = await twitchStream(cfg.twitchLogin);
  if (stream === undefined) return;          // creds missing / transient error
  const live = !!stream, was = !!cfg.twitchWasLive;
  if (live && !was) {
    const ch = await targetChannel(client, cfg);
    if (ch) await announce(ch, cfg, `🔴 **${stream.user_name || cfg.twitchLogin}** is now live on Twitch!`, twitchEmbed(cfg.twitchLogin, stream));
  }
  if (live !== was) updateGuild(guildId, { twitchWasLive: live, lastTwitchStreamId: stream?.id || null });
}

async function pollYouTube(client, guildId, cfg) {
  if (!cfg.youtubeChannelId) return;
  const entries = await youtubeEntries(cfg.youtubeChannelId);
  if (!entries.length) return;
  const latest = entries[0].id;
  if (latest === cfg.lastYoutubeVideoId) return;

  // First run: only post the newest to avoid a backlog dump.
  const lastIdx = entries.findIndex((v) => v.id === cfg.lastYoutubeVideoId);
  const newOnes = !cfg.lastYoutubeVideoId || lastIdx === -1 ? [entries[0]] : entries.slice(0, lastIdx).reverse();

  const ch = await targetChannel(client, cfg);
  if (ch) {
    for (const v of newOnes) {
      await announce(ch, cfg, `📹 **${v.author}** posted a new video!`, youtubeEmbed(v));
      await sleep(900);
    }
  }
  updateGuild(guildId, { lastYoutubeVideoId: latest, youtubeChannelName: entries[0].author || cfg.youtubeChannelName });
}

// ── start ────────────────────────────────────────────────────────────────────

function startLiveNotify(client) {
  let tw = null, yt = null;
  const runAll = async (fn, label) => {
    for (const [guildId] of client.guilds.cache) {
      try { await fn(client, guildId, getGuild(guildId)); }
      catch (e) { console.error(`[live-notify] ${label} (guild ${guildId}):`, e.message); }
    }
  };
  setTimeout(() => { runAll(pollTwitch, 'twitch'); tw = setInterval(() => runAll(pollTwitch, 'twitch'), 2 * 60_000); tw.unref?.(); }, 45_000);
  setTimeout(() => { runAll(pollYouTube, 'youtube'); yt = setInterval(() => runAll(pollYouTube, 'youtube'), 5 * 60_000); yt.unref?.(); }, 75_000);

  const hasTwitch = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
  console.log(`[live-notify] started — Twitch ${hasTwitch ? 'enabled' : 'DISABLED (set TWITCH_CLIENT_ID/SECRET)'} · YouTube enabled`);
  return () => { clearInterval(tw); clearInterval(yt); };
}

module.exports = {
  startLiveNotify,
  resolveTwitch, resolveYouTube,
  twitchStream, twitchEmbed,
  youtubeEntries, youtubeEmbed,
  pollTwitch, pollYouTube,
};
