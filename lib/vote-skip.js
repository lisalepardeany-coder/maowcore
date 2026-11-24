// Vote-skip, shared by /skip and the ⏭ button under the now-playing message.
//
// Skips right away for: admins (Manage Server), root owners, the DJ role, the
// person who queued the song, and everyone when no DJ role is set.
// Anyone else votes. Only people in the bot's voice channel can vote, a vote
// is for the current song only, and it lapses after 30 s.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const owners = require('./owners');

const VOTE_WINDOW_MS = 30_000;
const votes = new Map(); // guildId -> { song, voters: Set<userId>, timer }

// Votes needed with `listeners` people (not bots) in voice. Never more than
// are there, so one person alone can always skip.
const needed = (listeners, ratio = 0.5) => Math.max(1, Math.min(listeners, Math.ceil(listeners * ratio)));

const clear = (guildId) => {
  const v = votes.get(guildId);
  if (v?.timer) clearTimeout(v.timer);
  votes.delete(guildId);
};

// Pure vote counting. `songKey` ties the vote to one song; `listenerIds` are
// the people in voice right now.
function vote(guildId, { userId, songKey, listenerIds, ratio }) {
  if (!listenerIds.includes(userId)) return { ok: false, reason: 'not-in-voice' };
  let v = votes.get(guildId);
  if (!v || v.song !== songKey) {
    clear(guildId);
    v = { song: songKey, voters: new Set() };
    v.timer = setTimeout(() => { if (votes.get(guildId) === v) votes.delete(guildId); }, VOTE_WINDOW_MS);
    v.timer.unref?.();
    votes.set(guildId, v);
  }
  for (const id of v.voters) if (!listenerIds.includes(id)) v.voters.delete(id); // left the channel
  v.voters.add(userId);
  const need = needed(listenerIds.length, ratio);
  const count = v.voters.size;
  if (count >= need) clear(guildId);
  return { ok: true, passed: count >= need, count, needed: need };
}

const canSkipNow = ({ isAdmin, isOwner, isDJ, isRequester, djRoleSet }) =>
  !!(isAdmin || isOwner || isDJ || isRequester || !djRoleSet);

const voteButton = (count, need) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('music:skip').setStyle(ButtonStyle.Secondary).setEmoji('⏭').setLabel(`Vote to skip (${count}/${need})`),
);

// Runs a skip request from a slash command or button. Returns the reply to send.
async function request(interaction, queue, cfg) {
  const member = interaction.member;
  const userId = interaction.user.id;
  const song = queue.songs[0];
  const skipNow = async (prefix) => {
    clear(queue.id);
    try {
      const next = await queue.skip();
      return { content: `${prefix} — now **${next.name}**` };
    } catch {
      await Promise.resolve(queue.stop()).catch(() => {});
      return { content: `${prefix} — nothing left in the queue.` };
    }
  };

  if (canSkipNow({
    isAdmin: interaction.memberPermissions?.has('ManageGuild'),
    isOwner: owners.isOwner(userId),
    isDJ: !!cfg.djRoleId && member?.roles?.cache?.has(cfg.djRoleId),
    isRequester: !!song?.user && song.user.id === userId,
    djRoleSet: !!cfg.djRoleId,
  })) return skipNow('⏭  Skipped');

  const listenerIds = [...(queue.voice?.channel?.members?.values() || [])].filter((m) => !m.user?.bot).map((m) => m.id);
  const r = vote(queue.id, { userId, songKey: song?.url || song?.name || '', listenerIds, ratio: cfg.voteSkipRatio ?? 0.5 });
  if (!r.ok) return { content: '◌  Join the bot\'s voice channel to vote.', ephemeral: true };
  if (r.passed) return skipNow(`✦  Skip vote passed (${r.count}/${r.needed})`);
  return {
    content: `✦  <@${userId}> wants to skip **${song?.name || 'this song'}** — ${r.count}/${r.needed} votes. Tap below within 30 s to agree.`,
    components: [voteButton(r.count, r.needed)],
    allowedMentions: { parse: [] },
  };
}

module.exports = { VOTE_WINDOW_MS, needed, vote, clear, canSkipNow, request };
