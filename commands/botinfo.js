// /botinfo — full spec sheet: identity, uptime, latency, reach, music,
// host hardware, runtime + tool versions, storage.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { SlashCommandBuilder, EmbedBuilder, MessageFlags, version: djsVersion } = require('discord.js');
const { COLORS } = require('../lib/theme');

const ROOT = path.join(__dirname, '..');

const readPkgVersion = (pkg) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version;
  } catch { return '—'; }
};

const runVersion = (file, args, parse) => new Promise((resolve) => {
  execFile(file, args, { timeout: 8000, windowsHide: true }, (err, stdout) => {
    if (err) return resolve('unavailable');
    try { resolve(parse(String(stdout)) || 'unknown'); } catch { resolve('unknown'); }
  });
});

const ffmpegPath = () => process.env.FFMPEG_PATH || (() => { try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; } })();
const ytdlpPath = () => path.join(
  process.env.YTDLP_DIR || path.join(ROOT, 'node_modules', '@distube', 'yt-dlp', 'bin'),
  process.env.YTDLP_FILENAME || `yt-dlp${process.platform === 'win32' ? '.exe' : ''}`,
);

// Tool versions don't change while the bot runs, so look them up once.
let toolVersions = null;
const getToolVersions = async () => {
  if (!toolVersions) {
    const [ffmpeg, ytdlp] = await Promise.all([
      runVersion(ffmpegPath(), ['-version'], (s) => s.match(/ffmpeg version (\S+)/)?.[1]),
      runVersion(ytdlpPath(), ['--version'], (s) => s.trim().split(/\s+/)[0]),
    ]);
    toolVersions = { ffmpeg, ytdlp };
  }
  return toolVersions;
};

const fmtBytes = (n) => {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};

const fmtDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  const parts = [[Math.floor(s / 86400), 'd'], [Math.floor(s / 3600) % 24, 'h'], [Math.floor(s / 60) % 60, 'm'], [s % 60, 's']];
  return parts.filter(([n], i) => n || i === 3).map(([n, u]) => `${n}${u}`).join(' ');
};

const fileSize = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };

// Average CPU use of this process over a short window, as % of the whole machine.
const sampleCpu = (ms = 250) => new Promise((resolve) => {
  const start = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  setTimeout(() => {
    const d = process.cpuUsage(start);
    const elapsedUs = Number(process.hrtime.bigint() - t0) / 1000;
    resolve(((d.user + d.system) / elapsedUs / os.cpus().length) * 100);
  }, ms);
});

const buildSpecs = async (client, { isOwner = false, isPrivate = false } = {}) => {
  const [tools, cpuPct] = await Promise.all([getToolVersions(), sampleCpu()]);
  const mem = process.memoryUsage();
  const guilds = client.guilds.cache;
  const members = guilds.reduce((sum, g) => sum + (g.memberCount || 0), 0);
  const channels = guilds.reduce((sum, g) => sum + (g.channels?.cache?.size || 0), 0);
  const commands = [...client.commands.values()];
  const portable = commands.filter((c) => c.everywhere === true).length;
  const queues = [...(client.distube?.queues?.collection?.values?.() || [])];
  const queuedSongs = queues.reduce((sum, q) => sum + (q.songs?.length || 0), 0);
  const playing = queues.filter((q) => q.playing && !q.paused).length;
  const cpu = os.cpus()[0];
  const startedAt = Date.now() - process.uptime() * 1000;
  const dataDir = path.join(ROOT, 'data');
  let sounds = 0;
  try { sounds = fs.readdirSync(path.join(dataDir, 'sounds')).length; } catch { /* none */ }
  let botVersion = '—';
  try { botVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { /* keep dash */ }

  const embed = new EmbedBuilder()
    .setColor(COLORS.COSMIC)
    .setAuthor({ name: '◆  SYSTEM SPECIFICATIONS' })
    .setTitle(`${client.user.username} v${botVersion}`)
    .setThumbnail(client.user.displayAvatarURL({ size: 256 }) || null)
    .addFields(
      {
        name: '✦ Identity',
        value: [
          `**Tag** ${client.user.tag}`,
          `**ID** \`${client.user.id}\``,
          `**Created** <t:${Math.floor(client.user.createdTimestamp / 1000)}:D>`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '⏱ Uptime',
        value: [
          `**Up** ${fmtDuration(process.uptime() * 1000)}`,
          `**Since** <t:${Math.floor(startedAt / 1000)}:f>`,
          ...(() => {
            // real network round trip to Discord + Discord's heartbeat (see lib/latency.js)
            const p = require('../lib/latency').get();
            return [
              `**Ping** ${p.network != null ? `${p.network} ms` : '—'}`,
              `**Heartbeat** ${p.heartbeat != null ? `${p.heartbeat} ms` : '— (first one within ~40 s)'}`,
            ];
          })(),
        ].join('\n'),
        inline: true,
      },
      {
        name: '⌬ Reach',
        value: [
          `**Servers** ${guilds.size}`,
          `**Members** ${members.toLocaleString('en-US')}`,
          `**Channels** ${channels}`,
          `**Commands** ${commands.length} (${portable} portable)`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '♫ Music',
        value: [
          `**Active queues** ${queues.length} (${playing} playing)`,
          `**Songs queued** ${queuedSongs}`,
          `**Soundboard clips** ${sounds}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '▣ Process',
        value: [
          `**CPU** ${cpuPct.toFixed(1)}%`,
          `**RAM** ${fmtBytes(mem.rss)}`,
          `**Heap** ${fmtBytes(mem.heapUsed)} / ${fmtBytes(mem.heapTotal)}`,
          `**PID** ${process.pid}${process.env.MAOW_SUPERVISED ? ' · supervised' : ''}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '▤ Host',
        value: [
          `**OS** ${(os.version?.() || os.type())} ${os.release()} (${os.arch()})`,
          `**CPU** ${cpu?.model?.trim() || 'unknown'} × ${os.cpus().length}`,
          `**Memory** ${fmtBytes(os.totalmem() - os.freemem())} / ${fmtBytes(os.totalmem())} used`,
          `**Host up** ${fmtDuration(os.uptime() * 1000)}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '⚙ Runtime',
        value: [
          `**Node.js** ${process.version.replace(/^v/, '')} · **discord.js** ${djsVersion} · **DisTube** ${readPkgVersion('distube')}`,
          `**FFmpeg** ${tools.ffmpeg} · **yt-dlp** ${tools.ytdlp} · **better-sqlite3** ${readPkgVersion('better-sqlite3')}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '◈ Storage',
        value: [
          `**Database** ${fmtBytes(fileSize(path.join(dataDir, 'maow.db')) + fileSize(path.join(dataDir, 'maow.db-wal')))}`,
          `**Config** ${fmtBytes(fileSize(path.join(dataDir, 'config.json')))}`,
          `**Log** ${fmtBytes(fileSize(path.join(ROOT, 'bot.out.log')))}`,
        ].join(' · '),
        inline: false,
      },
    )
    .setFooter({ text: '✧  Stellar uplink stable' })
    .setTimestamp();

  // The panel only exists on the host machine, so only the owner gets the link.
  if (isOwner) {
    // On a panel server CONTROL_HOST is 0.0.0.0 (listen everywhere), not an
    // address anyone can open, so the public URL wins when it's set.
    const host = !process.env.CONTROL_HOST || process.env.CONTROL_HOST === '0.0.0.0' ? '127.0.0.1' : process.env.CONTROL_HOST;
    const panel = String(process.env.PANEL_PUBLIC_URL || '').trim().replace(/\/$/, '')
      || `http://${host}:${Number(process.env.CONTROL_PORT) || 8765}`;
    // <@id> mentions show as names inside an embed and never ping anyone.
    const all = require('../lib/owners').ids().map((id) => `<@${id}>`).join(', ');
    embed.addFields({ name: '◆ You', value: `Permanent bot owner (OWNER_USER_ID)\n**Owners:** ${all}`, inline: false });
    // The address only in a private reply: a public one shows it to the whole channel.
    embed.addFields({ name: '◇ Panel', value: isPrivate ? `${panel}/` : 'Run `/botinfo private:True` to see the address.', inline: false });
  }
  return embed;
};

module.exports = {
  everywhere: true,
  buildSpecs,
  fmtBytes,
  fmtDuration,
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Show the full specifications of MaowCore')
    .addBooleanOption((o) => o.setName('private').setDescription('Only you can see the reply').setRequired(false)),
  async execute(interaction) {
    const isPrivate = interaction.options.getBoolean('private') || false;
    await interaction.deferReply(isPrivate ? { flags: MessageFlags.Ephemeral } : {});
    const embed = await buildSpecs(interaction.client, {
      isOwner: require('../lib/owners').isOwner(interaction.user.id),
      isPrivate,
    });
    return interaction.editReply({ embeds: [embed] });
  },
};
