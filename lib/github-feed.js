'use strict';
// lib/github-feed.js
// Polls the MaowCore GitHub repository and broadcasts new commits, releases,
// issues, and pull requests to configured Discord channels.
//
// Env vars:
//   GITHUB_OWNER   — repo owner  (default: lisalepardeany-coder)
//   GITHUB_REPO    — repo name   (default: maowcore)
//   GITHUB_TOKEN   — personal access token (optional, raises rate limit 60→5000 req/h)
//
// Guild config keys set by /setup:
//   githubCommitsChannelId   — channel for commit embeds
//   githubReleasesChannelId  — channel for release embeds
//   githubIssuesChannelId    — channel for new issues
//   githubPRsChannelId       — channel for pull requests
//   githubActionsChannelId   — channel for CI workflow results
//
// Persisted in guild config (auto-updated after each poll):
//   lastGithubCommitSha      — newest SHA seen
//   lastGithubReleaseId      — newest release ID seen
//   lastGithubIssueId        — newest issue number seen
//   lastGithubPrId           — newest PR number seen

const { EmbedBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('./config');

const OWNER   = process.env.GITHUB_OWNER || 'lisalepardeany-coder';
const REPO    = process.env.GITHUB_REPO  || 'maowcore';
const TOKEN   = process.env.GITHUB_TOKEN || '';
const REPO_URL = `https://github.com/${OWNER}/${REPO}`;

const GH_HEADERS = {
  'User-Agent': 'MaowCore/1.0',
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

// ─── GitHub API helper ────────────────────────────────────────────────────────

async function ghGet(endpoint) {
  const res = await fetch(`https://api.github.com${endpoint}`, { headers: GH_HEADERS });
  if (res.status === 304) return null; // not modified
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${endpoint}`);
  return res.json();
}

// ─── Commit feed ─────────────────────────────────────────────────────────────

async function pollCommits(client, guildId, cfg) {
  if (!cfg.githubCommitsChannelId) return;

  const commits = await ghGet(`/repos/${OWNER}/${REPO}/commits?per_page=10`);
  if (!commits?.length) return;

  const latest = commits[0].sha;
  if (latest === cfg.lastGithubCommitSha) return; // nothing new

  // Find new commits (everything before the last seen SHA)
  const lastIdx  = commits.findIndex((c) => c.sha === cfg.lastGithubCommitSha);
  const newOnes  = lastIdx === -1
    ? [commits[0]]          // first run — only post the very latest to avoid spam
    : commits.slice(0, lastIdx).reverse(); // oldest-first so chat reads top-to-bottom

  const channel = await client.channels.fetch(cfg.githubCommitsChannelId).catch(() => null);
  if (!channel) return;

  for (const commit of newOnes) {
    const short   = commit.sha.slice(0, 7);
    const message = commit.commit.message;
    const title   = message.split('\n')[0].slice(0, 256);
    const body    = message.split('\n').slice(2).join('\n').trim().slice(0, 512);

    const embed = new EmbedBuilder()
      .setColor(0x24292E)
      .setAuthor({
        name:    commit.commit.author.name,
        iconURL: commit.author?.avatar_url ?? undefined,
        url:     commit.author?.html_url   ?? undefined,
      })
      .setTitle(`\`${short}\` ${title}`)
      .setURL(commit.html_url)
      .setTimestamp(new Date(commit.commit.author.date))
      .setFooter({ text: `${OWNER}/${REPO} · main` });

    if (body) embed.setDescription(`\`\`\`\n${body.slice(0, 300)}\n\`\`\``);

    await channel.send({ embeds: [embed] }).catch(() => {});
    await sleep(800); // be kind to rate limits
  }

  updateGuild(guildId, { lastGithubCommitSha: latest });
}

// ─── Release feed ─────────────────────────────────────────────────────────────

async function pollReleases(client, guildId, cfg) {
  if (!cfg.githubReleasesChannelId) return;

  const releases = await ghGet(`/repos/${OWNER}/${REPO}/releases?per_page=5`);
  if (!releases?.length) return;

  const latest = releases[0].id;
  if (latest === cfg.lastGithubReleaseId) return;

  const newOnes = cfg.lastGithubReleaseId
    ? releases.filter((r) => r.id > cfg.lastGithubReleaseId).reverse()
    : [releases[0]];

  const channel = await client.channels.fetch(cfg.githubReleasesChannelId).catch(() => null);
  if (!channel) return;

  for (const release of newOnes) {
    // Trim body to fit Discord embed limit
    let notes = (release.body || 'No release notes provided.').slice(0, 3800);
    if (notes.length === 3800) notes += '\n\n*…truncated — [read full notes on GitHub](' + release.html_url + ')*';

    const embed = new EmbedBuilder()
      .setColor(release.prerelease ? 0xFFA500 : 0x2DA44E)
      .setTitle(`${release.prerelease ? '🧪' : '🚀'} ${release.name || release.tag_name}`)
      .setURL(release.html_url)
      .setDescription(notes)
      .addFields(
        { name: 'Tag',       value: `[\`${release.tag_name}\`](${REPO_URL}/releases/tag/${release.tag_name})`, inline: true },
        { name: 'Type',      value: release.prerelease ? '🧪 Pre-release' : '✅ Stable release',               inline: true },
        { name: 'By',        value: `[@${release.author?.login}](${release.author?.html_url})`,                inline: true },
      )
      .setThumbnail(`https://avatars.githubusercontent.com/${OWNER}`)
      .setTimestamp(new Date(release.published_at))
      .setFooter({ text: `${OWNER}/${REPO}` });

    await channel.send({ content: `@here **New release: ${release.name || release.tag_name}**`, embeds: [embed] }).catch(() => {});
    await sleep(800);
  }

  updateGuild(guildId, { lastGithubReleaseId: latest });
}

// ─── Issues feed ──────────────────────────────────────────────────────────────

async function pollIssues(client, guildId, cfg) {
  if (!cfg.githubIssuesChannelId) return;

  const issues = await ghGet(`/repos/${OWNER}/${REPO}/issues?state=open&sort=created&direction=desc&per_page=10`);
  if (!issues?.length) return;

  // Filter out pull requests (GitHub returns PRs in issues list too)
  const realIssues = issues.filter((i) => !i.pull_request);
  if (!realIssues.length) return;

  const latest = realIssues[0].number;
  if (latest === cfg.lastGithubIssueId) return;

  const newOnes = cfg.lastGithubIssueId
    ? realIssues.filter((i) => i.number > cfg.lastGithubIssueId).reverse()
    : [realIssues[0]];

  const channel = await client.channels.fetch(cfg.githubIssuesChannelId).catch(() => null);
  if (!channel) return;

  for (const issue of newOnes) {
    const labelStr = issue.labels.map((l) => `\`${l.name}\``).join(' ') || 'none';
    const body     = (issue.body || 'No description provided.').slice(0, 512);

    const embed = new EmbedBuilder()
      .setColor(0xE4606D)
      .setTitle(`#${issue.number} — ${issue.title.slice(0, 250)}`)
      .setURL(issue.html_url)
      .setDescription(body)
      .addFields(
        { name: 'Opened by', value: `[@${issue.user.login}](${issue.user.html_url})`, inline: true },
        { name: 'Labels',    value: labelStr,                                         inline: true },
      )
      .setTimestamp(new Date(issue.created_at))
      .setFooter({ text: `${OWNER}/${REPO} · Issues` });

    await channel.send({ embeds: [embed] }).catch(() => {});
    await sleep(800);
  }

  updateGuild(guildId, { lastGithubIssueId: latest });
}

// ─── Pull requests feed ───────────────────────────────────────────────────────

async function pollPRs(client, guildId, cfg) {
  if (!cfg.githubPRsChannelId) return;

  const prs = await ghGet(`/repos/${OWNER}/${REPO}/pulls?state=open&sort=created&direction=desc&per_page=10`);
  if (!prs?.length) return;

  const latest = prs[0].number;
  if (latest === cfg.lastGithubPrId) return;

  const newOnes = cfg.lastGithubPrId
    ? prs.filter((p) => p.number > cfg.lastGithubPrId).reverse()
    : [prs[0]];

  const channel = await client.channels.fetch(cfg.githubPRsChannelId).catch(() => null);
  if (!channel) return;

  for (const pr of newOnes) {
    const body = (pr.body || 'No description provided.').slice(0, 512);

    const embed = new EmbedBuilder()
      .setColor(0x8957E5)
      .setTitle(`PR #${pr.number} — ${pr.title.slice(0, 250)}`)
      .setURL(pr.html_url)
      .setDescription(body)
      .addFields(
        { name: 'Author',      value: `[@${pr.user.login}](${pr.user.html_url})`,        inline: true },
        { name: 'Branch',      value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``,         inline: true },
        { name: 'Commits',     value: String(pr.commits ?? '?'),                          inline: true },
        { name: 'Changed files', value: String(pr.changed_files ?? '?'),                 inline: true },
        { name: '+/−',         value: `+${pr.additions ?? '?'} / -${pr.deletions ?? '?'}`, inline: true },
      )
      .setTimestamp(new Date(pr.created_at))
      .setFooter({ text: `${OWNER}/${REPO} · Pull Requests` });

    await channel.send({ embeds: [embed] }).catch(() => {});
    await sleep(800);
  }

  updateGuild(guildId, { lastGithubPrId: latest });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Start the GitHub feed for all guilds.
 * Call once after `ClientReady`.
 * Returns a stop() function that clears all timers.
 */
function startGitHubFeed(client) {
  let commitInterval  = null;
  let releaseInterval = null;
  let issueInterval   = null;
  let prInterval      = null;

  async function runAll(type) {
    for (const [guildId] of client.guilds.cache) {
      const cfg = getGuild(guildId);
      try {
        if (type === 'commits')  await pollCommits(client, guildId, cfg);
        if (type === 'releases') await pollReleases(client, guildId, cfg);
        if (type === 'issues')   await pollIssues(client, guildId, cfg);
        if (type === 'prs')      await pollPRs(client, guildId, cfg);
      } catch (e) {
        console.error(`[github-feed] ${type} poll error (guild ${guildId}):`, e.message);
      }
    }
  }

  // Stagger initial polls so they don't all hit GitHub at once
  setTimeout(() => { runAll('commits');  commitInterval  = setInterval(() => runAll('commits'),   5 * 60_000); commitInterval.unref();  },  30_000);
  setTimeout(() => { runAll('releases'); releaseInterval = setInterval(() => runAll('releases'),  10 * 60_000); releaseInterval.unref(); },  90_000);
  setTimeout(() => { runAll('issues');   issueInterval   = setInterval(() => runAll('issues'),    15 * 60_000); issueInterval.unref();   }, 150_000);
  setTimeout(() => { runAll('prs');      prInterval      = setInterval(() => runAll('prs'),       15 * 60_000); prInterval.unref();      }, 210_000);

  console.log(`[github-feed] Started — watching ${OWNER}/${REPO}`);

  return function stop() {
    clearInterval(commitInterval);
    clearInterval(releaseInterval);
    clearInterval(issueInterval);
    clearInterval(prInterval);
  };
}

module.exports = { startGitHubFeed };
