// Song request channel: anyone in voice types a song name or pastes a link in
// that channel and it gets queued. No slash command needed.
//
// Set it with /requests channel:#channel (or turn it off with /requests off).
// Messages starting with # are left alone so people can still talk there.
const { getGuild } = require('./config');

const MAX_LEN = 300;

// Pure: what should happen with this message's text? (unit tested)
//   { skip: true }                     → not a request (chat, empty, too long)
//   { query, isUrl }                   → queue this
const parse = (content) => {
  const text = String(content || '').trim();
  if (!text || text.length > MAX_LEN) return { skip: true };
  if (/^[#>]/.test(text)) return { skip: true };           // "# chatting" stays chat
  const url = text.match(/https?:\/\/\S+/i);
  if (url) return { query: url[0].replace(/[>)\]]+$/, ''), isUrl: true };
  return { query: text.replace(/\s+/g, ' '), isUrl: false };
};

const fade = (m, ms = 8000) => setTimeout(() => m?.delete?.().catch(() => {}), ms).unref?.();
const say = async (msg, text) => { const r = await msg.reply({ content: text, allowedMentions: { repliedUser: false } }).catch(() => null); fade(r); return r; };

// Called for every guild message (index.js).
const handle = async (msg) => {
  if (!msg.guild || msg.author?.bot) return false;
  const cfg = getGuild(msg.guild.id);
  if (!cfg.songRequestChannelId || cfg.songRequestChannelId !== msg.channelId) return false;
  const p = parse(msg.content);
  if (p.skip) return false;

  const voice = msg.member?.voice?.channel;
  if (!voice) { await say(msg, '◌ Join a voice channel first, then type your song here again.'); fade(msg); return true; }
  const botVoice = msg.guild.members.me?.voice?.channel;
  if (botVoice && botVoice.id !== voice.id && msg.client.distube.getQueue(msg.guild)) {
    await say(msg, `◌ I'm playing in **${botVoice.name}** right now. Join that channel to add songs.`);
    return true;
  }

  await msg.react('⏳').catch(() => {});
  try {
    let target = p.query;
    if (!p.isUrl) {
      const found = (await msg.client.youtubePlugin.search(p.query, { limit: 1, type: 'video' }) || []).find((r) => r?.url);
      if (!found) throw new Error(`nothing found for "${p.query.slice(0, 60)}"`);
      target = found.url;
    }
    await msg.client.distube.play(voice, target, { textChannel: msg.channel, member: msg.member });
    await msg.reactions.cache.get('⏳')?.users.remove(msg.client.user.id).catch(() => {});
    await msg.react('✅').catch(() => {});
  } catch (e) {
    await msg.reactions.cache.get('⏳')?.users.remove(msg.client.user.id).catch(() => {});
    await msg.react('❌').catch(() => {});
    await say(msg, `▲ Couldn't queue that: ${String(e?.message || e).slice(0, 180)}`);
  }
  return true;
};

module.exports = { parse, handle, MAX_LEN };
