// ===== Starboard =====
// A message that gets enough ⭐ reactions is reposted in the server's starboard
// channel (set by /setup's ⭐-starboard, or /starboard channel). The repost's
// star count is kept up to date, and each message is posted only once.
//
// Settings (guild config): starboardChannelId, starboardThreshold (default 3),
// starboardSelfStar (default false: the author's own star doesn't count).
const path = require('node:path');
const { EmbedBuilder } = require('discord.js');
const { readJson, writeJson } = require('./safe-json');
const { getGuild } = require('./config');

const FILE = process.env.NODE_TEST_CONTEXT
  ? path.join(require('node:os').tmpdir(), `maow-starboard-${process.pid}.json`)
  : path.join(__dirname, '..', 'data', 'starboard.json');
const STAR = '⭐';
const DEFAULT_THRESHOLD = 3;
const KEEP = 5000; // posted messages remembered (oldest forgotten first)

let posted = null; // { [messageId]: { star: starboardMessageId, ch: starboardChannelId, at } }
const load = () => { if (!posted) posted = readJson(FILE, {}, { valid: (d) => d && typeof d === 'object' && !Array.isArray(d), label: 'starboard' }); return posted; };
const save = () => {
  const ids = Object.keys(posted);
  if (ids.length > KEEP) ids.sort((a, b) => posted[a].at - posted[b].at).slice(0, ids.length - KEEP).forEach((id) => delete posted[id]);
  try { writeJson(FILE, posted); } catch (e) { console.warn('[starboard] save failed:', e.message); }
};

// Pure (tested): how many stars count, and does it qualify?
const countStars = (users, authorId, selfStar = false) => users.filter((u) => !u.bot && (selfStar || u.id !== authorId)).length;
const qualifies = (count, threshold = DEFAULT_THRESHOLD) => count >= Math.max(1, Number(threshold) || DEFAULT_THRESHOLD);

const buildPost = (msg, count) => {
  const embed = new EmbedBuilder()
    .setColor(0xf5c542)
    .setAuthor({ name: msg.member?.displayName || msg.author?.username || 'Unknown', iconURL: msg.author?.displayAvatarURL?.({ size: 64 }) })
    .setDescription((msg.content || '').slice(0, 4000) || null)
    .addFields({ name: 'Source', value: `[Jump to message](${msg.url})`, inline: true })
    .setTimestamp(msg.createdAt || new Date())
    .setFooter({ text: `#${msg.channel?.name || 'channel'}` });
  const img = msg.attachments?.find?.((a) => /^image\//.test(a.contentType || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.name || ''));
  if (img) embed.setImage(img.url);
  else if (msg.embeds?.[0]?.image?.url) embed.setImage(msg.embeds[0].image.url);
  return { content: `${STAR} **${count}** · <#${msg.channelId}>`, embeds: [embed] };
};

// Called for every reaction add/remove. Never throws.
const handle = async (reaction) => {
  try {
    if (reaction.partial) await reaction.fetch();
    const msg = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    if (!msg.guildId || reaction.emoji?.name !== STAR) return;
    const cfg = getGuild(msg.guildId);
    const boardId = cfg.starboardChannelId;
    if (!boardId || msg.channelId === boardId || msg.author?.bot) return; // not set up, or a starboard post itself
    const board = msg.guild.channels.cache.get(boardId);
    if (!board?.send) return;
    const users = [...(await reaction.users.fetch()).values()];
    const count = countStars(users, msg.author?.id, !!cfg.starboardSelfStar);
    load();
    const known = posted[msg.id];
    if (known) {
      // already on the board: keep its count current
      const post = await board.messages.fetch(known.star).catch(() => null);
      if (post) await post.edit({ content: `${STAR} **${count}** · <#${msg.channelId}>` }).catch(() => {});
      return;
    }
    if (!qualifies(count, cfg.starboardThreshold)) return;
    const sent = await board.send(buildPost(msg, count));
    posted[msg.id] = { star: sent.id, ch: board.id, at: Date.now() };
    save();
  } catch (e) {
    if (!/Unknown Message|Missing Access/.test(e.message)) console.warn('[starboard]', e.message);
  }
};

const _reset = () => { posted = null; };

module.exports = { handle, countStars, qualifies, buildPost, DEFAULT_THRESHOLD, FILE, _reset };
