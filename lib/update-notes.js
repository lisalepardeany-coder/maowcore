// ===== Update notes =====
// After the bot starts on a newer version (a Pterodactyl auto-update, a git
// pull, a new desktop build), tell people what changed: every CHANGELOG
// section newer than the version it ran before. Skipped versions are included,
// so updating 3.12.0 → 3.13.2 lists 3.13.2, 3.13.1 and 3.13.0.
//
//   • a DM to the main owner        UPDATE_NOTES = 1 (default) | 0
//   • a post in each server's updates channel (dashboard → Welcome & Updates,
//     on by default where /setup made 🔔-bot-updates), pinging 🔔 Bot Updates
//     when that's switched on. Each server remembers the last version it was
//     shown (lastUpdateAnnounced, also set by /announceupdate), so nothing is
//     posted twice.
//
// The last version seen is kept in data/.last-version.json. A first start
// (no file yet) only records the version: a new install posts nothing.
const fs = require('node:fs');
const path = require('node:path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const ROOT = path.join(__dirname, '..');
const STATE = path.join(ROOT, 'data', '.last-version.json');
const REPO = `${process.env.GITHUB_OWNER || 'lisalepardeany-coder'}/${process.env.GITHUB_REPO || 'maowcore'}`;

// Pure: -1 / 0 / 1 for "3.13.2"-style versions (missing parts count as 0).
const cmpVersion = (a, b) => {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
};

// Pure: CHANGELOG sections with from < version <= to, newest first.
const sectionsBetween = (md, from, to) => {
  const out = [];
  for (const part of String(md).replace(/\r\n/g, '\n').split(/\n(?=## \[)/)) {
    const m = part.match(/^## \[(\d+\.\d+\.\d+)\]([^\n]*)\n?([\s\S]*)$/);
    if (!m) continue;
    const [, version, , body] = m;
    if (cmpVersion(version, from) > 0 && cmpVersion(version, to) <= 0 && body.trim()) out.push({ version, body: body.trim() });
  }
  return out.sort((x, y) => cmpVersion(y.version, x.version));
};

// Pure: fit the sections into one embed description (Discord max 4096).
const MAX_DESC = 3800;   // + the links line buildEmbed adds
const formatNotes = (sections, from) => {
  let text = '';
  let shown = 0;
  for (const s of sections) {
    // "### Fixed" → underlined "Fixed" (embeds have no small headings)
    const block = `**v${s.version}**\n${s.body.replace(/^### (.+)$/gm, '__$1__')}\n\n`;
    if (text.length + block.length > MAX_DESC) break;
    text += block;
    shown++;
  }
  if (!shown && sections.length) {   // the newest section alone is too long: cut it
    text = `**v${sections[0].version}**\n${sections[0].body.replace(/^### (.+)$/gm, '__$1__').slice(0, MAX_DESC - 80).trimEnd()}…\n\n`;
    shown = 1;
  }
  if (shown < sections.length) text += `…and ${sections.length - shown} older version${sections.length - shown === 1 ? '' : 's'} since v${from}.`;
  return text.trim();
};

const readState = (file = STATE) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const writeState = (version, file = STATE) => {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ version, at: Date.now() })); } catch { /* */ }
};

const dmEnabled = () => process.env.UPDATE_NOTES !== '0';
const readChangelog = () => { try { return fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'); } catch { return ''; } };

// The update embed (also used by /announceupdate).
const CHANGELOG_URL = `https://github.com/${REPO}/blob/main/CHANGELOG.md`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const buildEmbed = (version, body) => {
  let desc = body || 'A new version of MaowCore is live.';
  if (desc.length > 3800) desc = `${desc.slice(0, 3800).trimEnd()}…`;
  return {
    color: 0x8b5cf6,
    author: { name: 'MaowCore Update' },
    title: `🔔 MaowCore — v${version}`,
    url: RELEASES_URL,
    description: `${desc}\n\n📖 [Full changelog](${CHANGELOG_URL}) · 🚀 [Releases](${RELEASES_URL})`,
    footer: { text: `MaowCore v${require('../package.json').version} · ${REPO}` },
    timestamp: new Date().toISOString(),
  };
};

// Pure: is a server's automatic posting on? Default: on when it has an updates
// channel (the one /setup makes), until someone switches it off.
const postsOn = (cfg) => cfg?.updateNotesEnabled ?? !!cfg?.updatesChannelId;
const pingsOn = (cfg) => cfg?.updateNotesPing ?? true;

// The channel a server's update posts go to, or null (off / gone / no permission).
const postChannel = (guild, cfg) => {
  if (!postsOn(cfg) || !cfg.updatesChannelId) return null;
  const ch = guild.channels.cache.get(cfg.updatesChannelId);
  if (!ch || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type)) return null;
  const perms = ch.permissionsFor(guild.members.me);
  return perms?.has(PermissionFlagsBits.SendMessages) && perms.has(PermissionFlagsBits.EmbedLinks) ? ch : null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Post to every server whose updates channel is set and hasn't seen `current`.
const postToServers = async (client, prev, current, md, cfgStore = require('./config'), gap = 350) => {
  const { getGuild, updateGuild } = cfgStore;
  let posted = 0;
  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuild(guild.id);
    const seen = cfg.lastUpdateAnnounced && cmpVersion(cfg.lastUpdateAnnounced, prev) > 0 ? cfg.lastUpdateAnnounced : prev;
    if (cmpVersion(current, seen) <= 0) continue;
    const ch = postChannel(guild, cfg);
    if (!ch) continue;
    const roleId = pingsOn(cfg) && cfg.updatePingRoleId && guild.roles.cache.has(cfg.updatePingRoleId) ? cfg.updatePingRoleId : null;
    try {
      await ch.send({
        content: roleId ? `<@&${roleId}>` : undefined,
        embeds: [buildEmbed(current, formatNotes(sectionsBetween(md, seen, current), seen))],
        allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
      });
      updateGuild(guild.id, { lastUpdateAnnounced: current });
      posted++;
    } catch (e) { console.warn(`[update-notes] ${guild.name}:`, e.message); }
    await sleep(gap); // gentle with many servers
  }
  return posted;
};

// Called once Discord is ready. `opts` is for tests (state file, version, changelog, config, owner).
const run = async (client, opts = {}) => {
  const file = opts.statePath || STATE;
  const current = opts.version || require('../package.json').version;
  const prev = readState(file)?.version;
  if (!prev || cmpVersion(current, prev) <= 0) { if (prev !== current) writeState(current, file); return { sent: false, posted: 0 }; }
  const md = opts.changelog ?? readChangelog();
  const sections = sectionsBetween(md, prev, current);
  const posted = await postToServers(client, prev, current, md, opts.config, opts.gap ?? 350);
  const owner = 'owner' in opts ? opts.owner : require('./owners').primary();
  if (!dmEnabled() || !owner) { writeState(current, file); return { sent: false, posted, versions: sections.length }; }
  try {
    const user = await client.users.fetch(owner);
    // Owner-only extras (start check, unused commands) go first so a long
    // changelog can't cut them off.
    const extra = opts.extra ? `${opts.extra}\n\n` : '';
    await user.send({
      embeds: [{
        ...buildEmbed(current, extra + (formatNotes(sections, prev) || 'No changelog notes for this version.')),
        title: `🔔 MaowCore updated: v${prev} → v${current}`,
        url: `https://github.com/${REPO}/releases/tag/v${current}`,
        footer: { text: `Posted in ${posted} server${posted === 1 ? '' : 's'} · turn this DM off with UPDATE_NOTES=0` },
      }],
    });
    writeState(current, file);
    return { sent: true, posted, versions: sections.length };
  } catch (e) {
    // DMs closed or Discord hiccup: keep the old version so the DM is tried
    // next start (servers already posted to remember it and aren't posted again).
    console.warn('[update-notes] DM failed:', e.message);
    return { sent: false, posted, error: e.message };
  }
};

module.exports = { run, cmpVersion, sectionsBetween, formatNotes, buildEmbed, postsOn, pingsOn, postChannel, STATE };
