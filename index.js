require('./lib/hosting'); // Pterodactyl port/env fixes; must run before .env loads
require('dotenv').config();
require('./lib/hosting').ensureControlToken(); // never an open dashboard on a panel
// Load runtime-editable integration creds (Last.fm) into process.env before
// any integration code reads them.
require('./lib/integrations-config').load();
const fs   = require('node:fs');
const path = require('node:path');
const os   = require('node:os');
const ops  = require('./lib/ops');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Events,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AuditLogEvent,
  PermissionsBitField,
} = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YouTubePlugin } = require('@distube/youtube');
const { YtDlpPlugin, json: ytdlpJson } = require('@distube/yt-dlp');
// Prefer a system ffmpeg if FFMPEG_PATH is set (e.g. /usr/bin/ffmpeg in the
// Docker image) — more reliable in Linux containers than the ffmpeg-static
// download. Falls back to the bundled static binary on Windows/dev.
// (yt-dlp is likewise overridable via YTDLP_DIR / YTDLP_FILENAME env vars,
//  honored by @distube/yt-dlp itself — set in the Dockerfile.)
const ffmpegPath = process.env.FFMPEG_PATH || require('ffmpeg-static');
const { generateDependencyReport } = require('@discordjs/voice');
const { getGuild, updateGuild } = require('./lib/config');
const { COLORS, themedEmbed } = require('./lib/theme');
const { fmtClock, progressBar, loopLabel } = require('./lib/format');
const presence = require('./lib/presence');
const { ControlServer } = require('./lib/control-server');
const { SponsorBlockManager } = require('./lib/sponsorblock');
const session = require('./lib/session');
const spotifyFeatures = require('./lib/spotify-features');
const abLoop = require('./lib/ab-loop');
const sleepTimer = require('./lib/sleep-timer');
const history = require('./lib/history');
const undo = require('./lib/undo');
const automod = require('./lib/automod');
const modlog = require('./lib/modlog');
const reminders = require('./lib/reminders');

console.log('--- Voice dependency report ---');
console.log(generateDependencyReport());
console.log('--- FFmpeg path:', ffmpegPath, '---');
// Show which yt-dlp the @distube/yt-dlp plugin will use (env-overridden in
// Docker to the system /usr/local/bin/yt-dlp). Helps diagnose playback issues.
console.log('--- yt-dlp:', process.env.YTDLP_DIR
  ? `${process.env.YTDLP_DIR}/${process.env.YTDLP_FILENAME || 'yt-dlp'} (env override)`
  : 'bundled (@distube/yt-dlp)', '---');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration, // ban events for anti-nuke
    GatewayIntentBits.DirectMessages,  // modmail (DM → staff thread)
  ],
  // REQUIRED for reaction roles: the verify / role-select messages are
  // usually not in the message cache (especially after a restart), so the
  // gateway delivers their reaction events as PARTIALS. Without these the
  // MessageReactionAdd/Remove events never fire for those messages.
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});
// Many features each run one start-up task on ClientReady; more than Node's default 10 listeners is expected.
client.setMaxListeners(30);
// Ping to Discord for every display (dashboard, /botinfo, stats channels): see lib/latency.js.
const latency = require('./lib/latency').start(client);

const ytDlpPlugin = new YtDlpPlugin({ update: false });
// YouTube cookies (uploaded in the panel) get past "confirm you're not a bot".
const ytCookies = require('./lib/yt-cookies');
// ...or dropped as a file in the cookies/ folder (picked up now and every 30 s)
require('./lib/cookie-drop').start(ytCookies, { consoleCommands: require('./lib/hosting').onPterodactyl });
const youtubePlugin = new YouTubePlugin(ytCookies.forYtdl() ? { cookies: ytCookies.forYtdl() } : {});
client.youtubePlugin = youtubePlugin;

const baseFlags = {
  dumpSingleJson: true,
  noWarnings: true,
  preferFreeFormats: true,
  skipDownload: true,
  simulate: true,
};

ytDlpPlugin.getStreamURL = async (song) => {
  if (!song.url) throw new Error('Cannot get stream url from invalid song.');
  // YouTube refuses ffmpeg's direct requests (403), so stream it through
  // yt-dlp on our own control server instead (lib/yt-stream.js).
  const ytStream = require('./lib/yt-stream');
  if (ytStream.isYouTube(song.url)) {
    return ytStream.urlFor(client.control?.port || Number(process.env.CONTROL_PORT) || 8765, song.url);
  }
  // a private copy per run (yt-dlp writes cookies back; see yt-cookies.runCopy)
  const cookieFile = ytCookies.runCopy();
  const info = await ytdlpJson(song.url, {
    ...baseFlags,
    ...(cookieFile ? { cookies: cookieFile } : {}),
    jsRuntimes: ytCookies.jsRuntime(),   // YouTube's stream unlock needs a JS runtime
    format:
      'bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio[ext=m4a][abr>=128]/bestaudio/ba/ba*',
    audioQuality: 0,
  });
  return info.url;
};

youtubePlugin.getStreamURL = (song) => ytDlpPlugin.getStreamURL(song);

// Signed-in (cookie) responses sometimes come back without a title; fill it in.
const ytTitles = require('./lib/yt-titles');
const origResolve = youtubePlugin.resolve.bind(youtubePlugin);
youtubePlugin.resolve = async (url, options) => {
  const result = await origResolve(url, options);
  await ytTitles.fix(result);
  return result;
};

client.distube = new DisTube(client, {
  emitNewSongOnly: true,
  emitAddSongWhenCreatingQueue: false,
  emitAddListWhenCreatingQueue: false,
  customFilters: {
    karaoke: 'pan=stereo|c0=c0-c1|c1=c1-c0',
    normalize: 'loudnorm=I=-16:TP=-1.5:LRA=11',
    crossfade_in: 'afade=t=in:st=0:d=5',
  },
  ffmpeg: {
    path: ffmpegPath,
    args: {
      input: { reconnect: 1, reconnect_streamed: 1, reconnect_delay_max: 5 },
      output: { ar: 48000, ac: 2, 'b:a': '256k' },
    },
  },
  plugins: [
    youtubePlugin,
    // Playlists the Spotify API refuses (404) are read from the public embed.
    require('./lib/spotify-embed').patchPlugin(new SpotifyPlugin({
      api: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      },
    })),
    new SoundCloudPlugin(),
    ytDlpPlugin,
  ],
});

// Allow multiple listeners on DisTube events without spamming MaxListeners warnings.
// We attach from index.js + control-server.js (and potentially more).
client.distube.setMaxListeners(30);

// Mood-aware autoplay — when DisTube picks the next related song, prefer ones
// whose Spotify audio-features are closest to the current track's mood.
const origGetRelatedSongs = youtubePlugin.getRelatedSongs?.bind(youtubePlugin);
if (typeof origGetRelatedSongs === 'function') {
  youtubePlugin.getRelatedSongs = async (song) => {
    const related = await origGetRelatedSongs(song);
    if (!song.features || !Array.isArray(related) || related.length < 2) return related;
    const target = song.features;
    const scored = await Promise.all(related.map(async (r) => {
      try { await spotifyFeatures.attachFeatures(r); } catch { /* ignored */ }
      if (!r.features) return { r, dist: 1 };
      const d = Math.abs((r.features.energy || 0.5) - (target.energy || 0.5))
              + Math.abs((r.features.valence || 0.5) - (target.valence || 0.5)) * 1.2
              + Math.abs((r.features.danceability || 0.5) - (target.danceability || 0.5)) * 0.5;
      return { r, dist: d };
    }));
    scored.sort((a, b) => a.dist - b.dist);
    return scored.map((x) => x.r);
  };
}

const control = new ControlServer({
  port: Number(process.env.CONTROL_PORT) || 8765,
  host: process.env.CONTROL_HOST || '127.0.0.1',
  distube: client.distube,
  client,
});
client.control = control;

// ===== Boot timeline =====
// Backfill the steps that already ran before the control server existed.
// (Anything that has happened by this point in module load.)
const diag = control.diagnostics;
// Read DisTube's version directly from its package.json file. Cannot use
// `require('distube/package.json')` — DisTube v5's `exports` map deliberately
// hides internal paths, which makes that throw ERR_PACKAGE_PATH_NOT_EXPORTED
// on modern Node.
const readPkgVersion = (pkg) => {
  try {
    const p = path.join(__dirname, 'node_modules', pkg, 'package.json');
    return JSON.parse(require('node:fs').readFileSync(p, 'utf8')).version;
  } catch { return null; }
};
const distubeVer = readPkgVersion('distube');
diag.bootOk('env', process.env.DISCORD_TOKEN ? 'token present' : 'no DISCORD_TOKEN set');
diag.bootOk('ffmpeg', ffmpegPath);
diag.bootOk('ytdlp', process.env.YTDLP_DIR
  ? `${process.env.YTDLP_DIR}/${process.env.YTDLP_FILENAME || 'yt-dlp'} (env override)`
  : 'bundled (@distube/yt-dlp)');
diag.bootOk('distube', distubeVer ? `DisTube v${distubeVer}` : 'DisTube loaded');
diag.bootOk('plugins', 'youtube, spotify, soundcloud, yt-dlp');
try {
  const libCount = require('./lib/library').list().length;
  diag.bootOk('library', `${libCount} song${libCount === 1 ? '' : 's'}`);
} catch (e) {
  diag.bootFail('library', e);
}
diag.bootOk('control', `http://${process.env.CONTROL_HOST || '127.0.0.1'}:${Number(process.env.CONTROL_PORT) || 8765}/`);
// Slash-command deployment runs from `npm run deploy` as a separate script
// (Discord requires registration before login). Skip here so the timeline
// doesn't show a phantom 'pending'.
diag.bootSkip('deploy', 'run via `npm run deploy` separately');
control.log('Boot: env, ffmpeg, yt-dlp, DisTube, plugins, library, control server — ready', 'success', 'startup',
  { subsystem: 'http' });

const sponsorblock = new SponsorBlockManager();

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
diag.bootStart('commands');
let cmdCount = 0, cmdSkipped = 0;
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    cmdCount++;
  } else {
    console.warn(`[WARN] Command ${file} missing "data" or "execute".`);
    cmdSkipped++;
  }
}
diag.bootOk('commands', `${cmdCount} command${cmdCount === 1 ? '' : 's'} loaded` +
  (cmdSkipped ? ` (${cmdSkipped} skipped)` : ''));

const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
  else client.on(event.name, (...args) => event.execute(...args, client));
}

// Now-playing control buttons (state-aware: pause flips to play when paused)
const buildControls = (queue) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music:toggle')
      .setLabel(queue?.paused ? '▶' : '⏸')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music:skip').setLabel('⏭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music:stop').setLabel('⏹').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('music:shuffle').setLabel('✦').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music:loop').setLabel('↻').setStyle(ButtonStyle.Secondary),
  );
// Second row: previous, volume, favourite, song radio.
const buildControlRows = (queue) => [
  buildControls(queue),
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music:prev').setLabel('⏮').setStyle(ButtonStyle.Secondary).setDisabled(!queue?.previousSongs?.length),
    new ButtonBuilder().setCustomId('music:voldown').setLabel('🔉').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music:volup').setLabel('🔊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music:fav').setLabel('♥').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music:similar').setLabel('📻 More like this').setStyle(ButtonStyle.Primary),
  ),
];

// Idle auto-disconnect (skipped when /247 is engaged; minutes configurable per guild)
const DEFAULT_IDLE_MIN = 5;
const EMPTY_MS = 30 * 1000;
const idleTimers = new Map();

const getIdleMs = (guildId) => {
  const m = getGuild(guildId).idleMinutes;
  return (typeof m === 'number' && m > 0 ? m : DEFAULT_IDLE_MIN) * 60 * 1000;
};

const clearIdleTimer = (guildId) => {
  const t = idleTimers.get(guildId);
  if (t) { clearTimeout(t); idleTimers.delete(guildId); }
};

const scheduleIdleLeave = (guildId, textChannel, ms, reason) => {
  if (getGuild(guildId).stay247) return;
  clearIdleTimer(guildId);
  const t = setTimeout(() => {
    idleTimers.delete(guildId);
    const voice = client.distube.voices.get(guildId);
    if (!voice) return;
    voice.leave();
    textChannel?.send({
      embeds: [themedEmbed(COLORS.COSMIC, '⌬  RETURNING TO THE VOID', reason)],
    }).catch(() => {});
  }, ms);
  idleTimers.set(guildId, t);
};

// Live progress bar — skips ticks when nothing meaningful changed (paused / same-second)
const PROGRESS_TICK_MS = 5000;
const liveIntervals = new Map();

const renderPlayingEmbed = (queue, song) => {
  const cur = queue.currentTime || 0;
  const total = song.duration || 0;
  return themedEmbed(
    COLORS.COSMIC,
    '◆  NOW TRANSMITTING',
    `✦ **[${song.name}](${song.url})**\n› signal by  ${song.user}\n\n\`${fmtClock(cur)}\` ${progressBar(cur, total)} \`${song.formattedDuration}\``,
  ).setThumbnail(song.thumbnail || null);
};

const stopLiveUpdate = (guildId) => {
  const id = liveIntervals.get(guildId);
  if (id) { clearInterval(id); liveIntervals.delete(guildId); }
};

const startLiveUpdate = (guildId, message) => {
  stopLiveUpdate(guildId);
  let lastSec = -1;
  let lastPaused = null;
  const intervalId = setInterval(async () => {
    const queue = client.distube.getQueue(guildId);
    if (!queue?.songs?.length) return stopLiveUpdate(guildId);
    const sec = Math.floor(queue.currentTime || 0);
    if (sec === lastSec && queue.paused === lastPaused) return;
    lastSec = sec;
    lastPaused = queue.paused;
    try {
      await message.edit({
        embeds: [renderPlayingEmbed(queue, queue.songs[0])],
        components: buildControlRows(queue),
      });
    } catch {
      stopLiveUpdate(guildId);
    }
  }, PROGRESS_TICK_MS);
  liveIntervals.set(guildId, intervalId);
};

// DisTube events
const welcomeIntro = require('./lib/welcome-intro');
const taste = require('./lib/taste');
// /stop or leaving isn't a "skip" of the song that was on: just forget it.
client.distube.on('deleteQueue', (queue) => taste.forget(queue.id));
// Download every server's welcome sound once, so it can play instantly.
client.once(Events.ClientReady, () => {
  for (const g of client.guilds.cache.values()) {
    const url = getGuild(g.id).welcomeSoundUrl;
    if (url) welcomeIntro.warm(url, (t) => control.log(t, 'warn', 'play'));
  }
});
client.distube
  // A new queue starts with this server's saved autoplay choice.
  .on('initQueue', (queue) => {
    const cfg = getGuild(queue.id);
    if (cfg.autoplay && !queue.autoplay) queue.toggleAutoplay();
    // Autoplay picks from the related songs using what this server skips / lets play (lib/taste.js).
    taste.attach(queue);
    // The server's welcome sound plays before the first song (lib/welcome-intro.js).
    welcomeIntro.prepare(client.distube, queue, cfg.welcomeSoundUrl, (t) => control.log(t, 'warn', 'play'));
  })
  .on('playSong', async (queue, song) => {
    // The welcome sound itself: no "now playing" message, not in history.
    if (welcomeIntro.isIntro(song)) { clearIdleTimer(queue.id); return; }
    // Welcome sound not downloaded yet: it goes in front now (slow path).
    if (await welcomeIntro.maybeIntro(queue, song).catch(() => false)) return;
    clearIdleTimer(queue.id);
    taste.notePlay(queue.id, song);  // judges the previous song: skipped early or played through
    abLoop.stop(queue.id);  // clear any prior A-B loop when a new song starts
    require('./lib/vote-skip').clear(queue.id);  // skip votes are per song
    // Hoist dedication from DisTube metadata onto the song itself. This is
    // race-free vs. the older "attach to queue.songs[last] after play()" trick
    // — metadata sticks to the exact track DisTube spawned, even if other
    // plays interleave.
    if (song.metadata?.dedication && !song.dedication) song.dedication = song.metadata.dedication;
    // Uploaded library songs stream over an HTTP URL whose yt-dlp-derived
    // title is ugly (the filename) and whose duration comes back 0 (yt-dlp
    // can't measure an HTTP stream). Override both from the probed metadata.
    if (song.metadata?.localName) song.name = song.metadata.localName;
    if (song.metadata?.durationSec && !song.duration) {
      song.duration = song.metadata.durationSec;
      song.formattedDuration = fmtClock(song.metadata.durationSec);
    }
    presence.setPlaying(client, song);
    sponsorblock.onPlay(queue, song, (text, level) => control.log(text, level));
    session.set(queue.id, queue);
    spotifyFeatures.attachFeatures(song).catch(() => {});  // best-effort
    // Get the NEXT song ready now, so it starts without the ~4 s yt-dlp wait.
    try { if (queue.songs[1]?.url) require('./lib/yt-stream').prefetch(queue.songs[1].url); } catch { /* best effort */ }

    // TTS song announcement — speaks "Now playing: <title>" in the text channel
    // when /announce is on. (Voice-channel TTS interleaving is too fragile with
    // DisTube's queue model; we announce in text instead.)
    if (getGuild(queue.id).announce && !song._announced) {
      song._announced = true;
      queue.textChannel?.send(`📢  Now playing: **${song.name}**`).catch(() => {});
    }
    history.record(queue.id, song, song.user?.displayName || song.user?.username);
    // Event mode — append to current event's setlist
    {
      const eventCfg = getGuild(queue.id).event;
      if (eventCfg) {
        eventCfg.songs = eventCfg.songs || [];
        eventCfg.songs.push({
          name: song.name,
          url: song.url,
          user: song.user?.displayName || song.user?.username || 'unknown',
          dedication: song.dedication || null,
          ts: Date.now(),
        });
        const { updateGuild } = require('./lib/config');
        updateGuild(queue.id, { event: eventCfg });
      }
    }

    const cfg = getGuild(queue.id);
    if (typeof cfg.volume === 'number' && queue.volume !== cfg.volume) {
      try { queue.setVolume(cfg.volume); } catch (e) { console.warn('Failed to restore volume:', e.message); }
    }
    // Crossfade: fade this song in, and out again just before it ends.
    // (Ambience loops and library sound effects aren't faded.)
    if (cfg.crossfade && !song.metadata?.ambience) {
      // Old setups had the fade-in filter switched on; it would double up.
      if (queue.filters.names.includes('crossfade_in')) { try { queue.filters.remove('crossfade_in'); } catch { /* */ } }
      const fader = require('./lib/fader');
      fader.onSongStart(queue, song, typeof cfg.volume === 'number' ? cfg.volume : fader.targetFor(queue));
    } else {
      require('./lib/fader').clear(queue.id);
    }
    // Apply defaultLoopMode only on the first song of the session so user-driven
    // mid-session loop changes aren't clobbered.
    if (typeof cfg.defaultLoopMode === 'number' && (!queue.previousSongs?.length)) {
      try { queue.setRepeatMode(cfg.defaultLoopMode); } catch { /* ignored */ }
    }

    stopLiveUpdate(queue.id);
    const msg = await queue.textChannel?.send({
      embeds: [renderPlayingEmbed(queue, song)],
      components: buildControlRows(queue),
    }).catch((e) => { console.warn('Failed to send playSong embed:', e.message); return null; });
    if (msg) startLiveUpdate(queue.id, msg);
  })
  .on('addSong', (queue, song) => {
    clearIdleTimer(queue.id);
    // Added right behind the playing song? Get it ready now.
    if (queue.songs[1] === song) { try { require('./lib/yt-stream').prefetch(song.url); } catch { /* */ } }
    // Hoist dedication metadata as soon as the song lands in the queue so
    // /queue and /nowplaying see it without waiting for playSong.
    if (song.metadata?.dedication && !song.dedication) song.dedication = song.metadata.dedication;
    if (song.metadata?.localName) song.name = song.metadata.localName;
    if (song.metadata?.durationSec && !song.duration) {
      song.duration = song.metadata.durationSec;
      song.formattedDuration = fmtClock(song.metadata.durationSec);
    }
    session.set(queue.id, queue);
    queue.textChannel?.send({
      embeds: [
        themedEmbed(
          COLORS.NEBULA,
          '✧  LOCKED INTO TRAJECTORY',
          `**${song.name}** \`${song.formattedDuration}\`\n› requested by ${song.user}`,
        ),
      ],
    }).catch(() => {});
  })
  .on('addList', (queue, playlist) => {
    clearIdleTimer(queue.id);
    session.set(queue.id, queue);
    // Song radio / mood mixes post their own summary.
    if (playlist?.metadata?.quiet) return;
    queue.textChannel?.send({
      embeds: [
        themedEmbed(
          COLORS.NEBULA,
          '⟡  CARGO LOADED',
          `**${playlist.name}** — \`${playlist.songs.length}\` signals queued`,
        ),
      ],
    }).catch(() => {});
  })
  .on('error', (error, queue) => {
    // FFMPEG_EXITED fires whenever ffmpeg is terminated mid-stream — which
    // happens on every skip / stop / leave / queue-end. It's benign noise,
    // not a real failure, so log it quietly and DON'T alarm users with an
    // error embed in the music channel.
    const code = error?.errorCode || '';
    const benign = code === 'FFMPEG_EXITED' || /ffmpeg exited/i.test(error?.message || '');
    if (benign) {
      try {
        control.log('ffmpeg stream terminated (skip/stop/end — harmless)', 'info', 'play',
          { subsystem: 'distube', meta: { code } });
      } catch { /* control not ready */ }
      return;
    }
    // Genuine playback error — log loudly + notify the channel.
    console.error('DisTube error:', error);
    try {
      control.log(`▲ DisTube error: ${error?.message || error}`, 'error', 'play',
        { subsystem: 'distube', meta: { code, stack: error?.stack } });
    } catch { /* control not ready */ }
    const msg = (error?.message || String(error)).slice(0, 1900);
    queue?.textChannel
      ?.send({ embeds: [themedEmbed(COLORS.FLARE, '▲  TRANSMISSION ERROR', '```' + msg + '```')] })
      .catch(() => {});
  })
  .on('empty', (queue) => {
    stopLiveUpdate(queue.id);
    const stayed = getGuild(queue.id).stay247;
    queue.textChannel?.send({
      embeds: [
        themedEmbed(
          COLORS.COSMIC,
          '◌  CHANNEL DESERTED',
          stayed
            ? '24/7 mode engaged — holding orbit anyway.'
            : `Disengaging in ${EMPTY_MS / 1000}s if no one rejoins.`,
        ),
      ],
    }).catch(() => {});
    scheduleIdleLeave(queue.id, queue.textChannel, EMPTY_MS, 'Channel was deserted.');
  })
  .on('finish', (queue) => {
    taste.noteStop(queue.id);   // the last song played through
    stopLiveUpdate(queue.id);
    require('./lib/fader').clear(queue.id);
    sponsorblock.clearForGuild(queue.id);
    abLoop.stop(queue.id);
    session.clear(queue.id);
    presence.setIdle(client);
    const stayed = getGuild(queue.id).stay247;
    queue.textChannel?.send({
      embeds: [
        themedEmbed(
          COLORS.COSMIC,
          '◇  ALL TRANSMISSIONS COMPLETE',
          stayed
            ? 'Queue exhausted. 24/7 mode engaged — holding orbit.'
            : `Queue exhausted. Auto-disengage in ${getIdleMs(queue.id) / 60000}m.`,
        ),
      ],
    }).catch(() => {});
    scheduleIdleLeave(queue.id, queue.textChannel, getIdleMs(queue.id), 'Idle timeout reached.');
  })
  .on('disconnect', (queue) => {
    stopLiveUpdate(queue.id);
    require('./lib/fader').clear(queue.id);
    clearIdleTimer(queue.id);
    sponsorblock.clearForGuild(queue.id);
    abLoop.stop(queue.id);
    sleepTimer.cancel(queue.id);
    presence.setIdle(client);
    queue.textChannel?.send({
      embeds: [themedEmbed(COLORS.COSMIC, '⌬  RETURNING TO THE VOID', 'Disconnected from voice.')],
    }).catch(() => {});
  });

// Per-bot command prefix — if set, deploy-commands.js renamed every slash
// command from /foo to /<prefix>-foo. Strip the prefix here when looking up
// the internal command name so the same handler files work in all bots.
const COMMAND_PREFIX = (process.env.COMMAND_PREFIX || '').trim().toLowerCase();
const stripPrefix = (name) => (
  COMMAND_PREFIX && name.startsWith(`${COMMAND_PREFIX}-`)
    ? name.slice(COMMAND_PREFIX.length + 1)
    : name
);

// Interaction handler (slash commands + now-playing buttons)
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(stripPrefix(interaction.commandName));
    if (command?.autocomplete) {
      try { await command.autocomplete(interaction); } catch (e) { console.warn('autocomplete failed:', e.message); }
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    // (Aliases live on the dashboard console only — Discord requires slash commands
    // to be pre-registered, so runtime-defined names like /bops can't be invoked.)
    const command = client.commands.get(stripPrefix(interaction.commandName));
    if (!command) return;
    // Root owners (OWNER_USER_ID) pass the bot's own permission checks in every
    // server: commands read interaction.memberPermissions, so give them all.
    // Discord's own limits still apply (what the BOT may do in that server).
    if (interaction.inGuild() && require('./lib/owners').isOwner(interaction.user?.id)) {
      Object.defineProperty(interaction, 'memberPermissions', {
        value: new PermissionsBitField(PermissionsBitField.All).freeze(), configurable: true,
      });
    }
    const who =interaction.user?.username || interaction.user?.tag || 'unknown';
    const guildName = interaction.guild?.name || 'DM';
    const startedAt = Date.now();
    control.log(`/${interaction.commandName} — ${who} in ${guildName}`,
      'info', 'command',
      { subsystem: 'discord', meta: { user: who, guild: guildName, guildId: interaction.guildId } });
    try {
      await command.execute(interaction);
      const dur = Date.now() - startedAt;
      ops.recordCommand(stripPrefix(interaction.commandName), true, dur);
      control.log(`✓ /${interaction.commandName} ok (${dur}ms)`, 'success', 'command',
        { subsystem: 'discord', meta: { user: who, guild: guildName, durationMs: dur } });
    } catch (err) {
      console.error(`Error in /${interaction.commandName}:`, err);
      const dur = Date.now() - startedAt;
      ops.recordCommand(stripPrefix(interaction.commandName), false, dur);
      control.log(`✕ /${interaction.commandName} failed (${dur}ms): ${err.message || err}`,
        'error', 'command',
        { subsystem: 'discord', meta: { user: who, guild: guildName, durationMs: dur, error: err?.message, stack: err?.stack } });
      const reply = { content: `▲ Error: ${err.message || 'Something broke.'}`, flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
    return;
  }

  // Checklist tick buttons (work in DMs too).
  if (interaction.isButton() && interaction.customId.startsWith('chk:')) {
    const [, id, idx] = interaction.customId.split(':');
    const lists = require('./lib/checklists');
    try {
      const l = lists.toggle(interaction.user.id, id, Number(idx));
      const done = lists.ticked(l).length >= l.items.length;
      await interaction.update(lists.message(l));
      if (done) fun_reward(interaction, 3);
    } catch (e) {
      await interaction.reply({ content: `▲ ${e.message === 'Checklist not found.' ? 'This checklist is gone, or it isn\'t yours.' : e.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }

  // Soundboard buttons from /sb (no name).
  if (interaction.isButton() && interaction.customId.startsWith('sb:')) {
    const file = path.basename(interaction.customId.slice(3));
    const voice = interaction.member?.voice?.channel;
    if (!voice) return interaction.reply({ content: '◌ Join a voice channel first.', flags: MessageFlags.Ephemeral });
    if (!fs.existsSync(path.join(__dirname, 'data', 'sounds', file))) return interaction.reply({ content: '◌ That sound was removed.', flags: MessageFlags.Ephemeral });
    await interaction.deferUpdate().catch(() => {});
    client.distube.play(voice, control._soundUrl(file), { member: interaction.member, metadata: { localName: `🔊 ${path.basename(file, path.extname(file))}` } })
      .catch((e) => interaction.followUp({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => {}));
    return;
  }

  // Ban appeals (DM button → form → mod buttons) and tickets.
  if ((interaction.isButton() || interaction.isModalSubmit()) && /^(appeal|ticket):/.test(interaction.customId)) {
    const tools = require('./lib/mod-tools');
    try {
      if (interaction.customId.startsWith('appeal:')) await tools.handleAppeal(interaction, client);
      else await tools.handleTicket(interaction);
    } catch (e) {
      const reply = { content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
    return;
  }

  // Reminder buttons (Snooze / Stop repeating) and the /reminders cancel menu.
  if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('remind:')) {
    const [, kind, id, amount] = interaction.customId.split(':');
    const uid = interaction.user.id;
    try {
      if (kind === 'cancel') {
        const ok = reminders.cancel(interaction.values?.[0], uid);
        const view = require('./commands/reminders').build(uid);
        return interaction.update({ ...view, content: ok ? `✕  Cancelled. ${view.content}`.trim() : '◌ That reminder was already gone.' });
      }
      if (kind === 'stop') {
        const ok = reminders.stopRepeat(id, uid);
        return interaction.update({ components: [], content: ok ? '⏹  This reminder won\'t repeat any more.' : '◌ Already stopped.' });
      }
      if (kind === 'snooze') {
        let ms = Number(amount) * 60000;
        if (amount === 't9') {
          const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0);
          ms = t.getTime() - Date.now();
        }
        const r = reminders.snooze(id, uid, ms);
        if (!r) return interaction.reply({ content: '◌ Too late to snooze this one (or it isn\'t yours).', flags: MessageFlags.Ephemeral });
        const ts = Math.floor(r.fireAt / 1000);
        return interaction.reply({ content: `💤  Snoozed until <t:${ts}:t> (<t:${ts}:R>).`, flags: MessageFlags.Ephemeral });
      }
    } catch (e) {
      return interaction.reply({ content: `▲ ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('music:')) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) {
      return interaction.reply({ content: '◌ No active transmission.', flags: MessageFlags.Ephemeral });
    }
    // In user-install chats the member has no voice state; treat as not in voice.
    if (interaction.member?.voice?.channelId !== queue.voice.channelId) {
      return interaction.reply({
        content: '◌ Board the active voice channel first.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const action = interaction.customId.split(':')[1];
    try {
      if (action === 'toggle') {
        if (queue.paused) queue.resume(); else queue.pause();
        presence.refresh(client, queue);
        return interaction.update({ components: buildControlRows(queue) });
      }
      if (action === 'skip') {
        // Same rules as /skip: DJs skip, everyone else votes.
        const r = await require('./lib/vote-skip').request(interaction, queue, getGuild(interaction.guildId));
        const { ephemeral, ...reply } = r;
        return interaction.reply(ephemeral || !r.components ? { ...reply, flags: MessageFlags.Ephemeral } : reply);
      }
      if (action === 'stop') {
        undo.capture(queue.id, queue);
        await queue.stop();
        return interaction.reply({ content: '⏹  Engines offline. (Use /undo to restore the queue within 5 min)', flags: MessageFlags.Ephemeral });
      }
      if (action === 'shuffle') {
        await queue.shuffle();
        return interaction.reply({ content: '✦  Manifest scrambled.', flags: MessageFlags.Ephemeral });
      }
      if (action === 'loop') {
        const next = (queue.repeatMode + 1) % 3;
        queue.setRepeatMode(next);
        return interaction.reply({
          content: `↻  Trajectory loop: **${loopLabel(next, 'long')}**.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      if (action === 'prev') {
        await queue.previous();
        return interaction.reply({ content: '⏮  Back to the previous song.', flags: MessageFlags.Ephemeral });
      }
      if (action === 'voldown' || action === 'volup') {
        const v = Math.max(0, Math.min(150, (queue.volume || 50) + (action === 'volup' ? 10 : -10)));
        queue.setVolume(v);
        return interaction.reply({ content: `${action === 'volup' ? '🔊' : '🔉'}  Volume ${v}%`, flags: MessageFlags.Ephemeral });
      }
      if (action === 'fav') {
        const song = queue.songs[0];
        const favs = require('./lib/favorites');
        if (favs.has(queue.id, interaction.user.id, song.url)) {
          return interaction.reply({ content: `♥  Already in your favourites: **${song.name}**`, flags: MessageFlags.Ephemeral });
        }
        favs.add(queue.id, interaction.user.id, song);
        return interaction.reply({ content: `♥  Saved to your favourites: **${song.name}**`, flags: MessageFlags.Ephemeral });
      }
      if (action === 'similar') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const r = await require('./lib/song-radio').addSimilar(client, queue, { count: 5, member: interaction.member });
        return interaction.editReply(`📻  Added **${r.added}** songs like **${r.seed}**.`);
      }
    } catch (err) {
      const reply = { content: `▲ ${err.message || err}`, flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) return interaction.followUp(reply).catch(() => {});
      return interaction.reply(reply).catch(() => {});
    }
  }
});

// Welcome / farewell embeds for member join/leave
const welcomeEmbed = (member, isJoin) => {
  const cfg = getGuild(member.guild.id);
  const defaultMsg = isJoin
    ? `✦  Welcome to **{server}**, {user}! Glad to have you on board.`
    : `◌  {user} has departed **{server}**. Until next time.`;
  const tpl = (isJoin ? cfg.welcomeMessage : cfg.farewellMessage) || defaultMsg;
  const text = tpl.replace(/\{user\}/g, `<@${member.id}>`).replace(/\{server\}/g, member.guild.name);
  return themedEmbed(isJoin ? COLORS.NEBULA : COLORS.COSMIC, isJoin ? '◇  NEW SIGNAL DETECTED' : '◌  TRANSMISSION LOST', text)
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }));
};

client.on(Events.GuildMemberAdd, async (member) => {
  // Raid shield + alt-gate (raid alerts at most once a minute). If the joiner
  // was kicked/banned, skip auto-roles and the welcome.
  let acted = null;
  try { acted = await automod.checkJoin(member, modlog); } catch (e) { console.warn('[automod] join:', e.message); }
  if (acted?.action === 'kick' || acted?.action === 'ban') return;
  // Auto-roles (/autorole), not for someone just quarantined.
  if (acted?.action !== 'quarantine') require('./lib/mod-tools').onJoin(member).catch(() => {});
  const cfg = getGuild(member.guild.id);
  if (!cfg.welcomeChannelId) return;
  const ch = member.guild.channels.cache.get(cfg.welcomeChannelId);
  ch?.send({ embeds: [welcomeEmbed(member, true)] }).catch(() => {});
});

// Small coin reward for finishing a checklist (only counts in a server).
const fun_reward = (interaction, coins) => { if (interaction.guildId) require('./lib/fun').reward(interaction.guildId, interaction.user.id, coins, 'checklist'); };

// Daily checklist DMs + one gentle nudge (/checklist).
setInterval(() => require('./lib/checklists').tick(client).catch((e) => console.warn('[checklists]', e.message)), 60 * 1000);

// Birthday wishes at 9:00 (/birthday setup).
setInterval(() => require('./lib/mod-tools').runBirthdays(client).catch((e) => console.warn('[birthdays]', e.message)), 10 * 60 * 1000);
client.once(Events.ClientReady, () => setTimeout(() => require('./lib/mod-tools').runBirthdays(client).catch(() => {}), 30000));

// Automod message listener — runs filter checks on every message
client.on(Events.MessageCreate, async (msg) => {
  if (!msg.guild) return;
  try { await automod.checkMessage(msg, modlog); } catch (e) { console.warn('[automod] error:', e.message); }
});

// ── Anti-nuke: watch destructive actions, find the actor via the audit log ────
const nukeWatch = async (guild, auditType, label) => {
  if (!guild || !getGuild(guild.id).automod?.antiNuke) return;
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 10_000) return; // only fresh actions
    await automod.recordNuke(guild, entry.executor?.id, label, modlog);
  } catch (e) { console.warn('[anti-nuke]', e.message); }
};
client.on(Events.ChannelDelete, (channel) => { if (channel.guild) nukeWatch(channel.guild, AuditLogEvent.ChannelDelete, 'channel delete'); });
client.on(Events.GuildRoleDelete, (role) => nukeWatch(role.guild, AuditLogEvent.RoleDelete, 'role delete'));
client.on(Events.GuildBanAdd, (ban) => nukeWatch(ban.guild, AuditLogEvent.MemberBanAdd, 'ban'));

// ── Modmail: relay member DMs ↔ staff threads ─────────────────────────────────
const modActions = require('./lib/mod-actions');
const modmail = require('./lib/modmail');
client.once(Events.ClientReady, () => modActions.startTempActions(client)); // auto-expire temp bans/mutes
client.on(Events.MessageCreate, async (msg) => {
  try {
    if (!msg.guild) { await modmail.handleUserDM(client, msg); return; }     // a DM from a member
    if (msg.channel.isThread?.()) await modmail.handleStaffReply(msg);        // staff reply in a modmail thread
  } catch (e) { console.warn('[modmail]', e.message); }
});

// ── Leveling: text XP per message + voice XP on a ticker ──────────────────────
const leveling = require('./lib/leveling');
client.once(Events.ClientReady, () => leveling.startVoiceXp(client));
client.on(Events.MessageCreate, (msg) => { leveling.onMessage(msg).catch(() => {}); });

// ── Community: event RSVP buttons + daily birthday check ──────────────────────
const community = require('./lib/community');
// Separate listener — only touches rsvp: buttons, so it can't clash with the
// slash-command / music-button handler above.
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton() || !interaction.customId.startsWith('rsvp:')) return;
  try {
    const [, id, status] = interaction.customId.split(':');
    const e = community.rsvp(interaction.guildId, id, interaction.user.id, status);
    if (!e) return interaction.reply({ content: 'This event no longer exists.', flags: MessageFlags.Ephemeral }).catch(() => {});
    await interaction.update({ embeds: [community.eventEmbed(e)], components: [community.eventButtons(id)] });
  } catch (err) { console.warn('[rsvp]', err.message); }
});
async function birthdayCheck() {
  const today = new Date();
  const key = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuild(guild.id);
    const todays = community.todaysBirthdays(guild.id, today);
    // Birthday role: keep it on exactly today's celebrants.
    if (cfg.birthdayRoleId) {
      const role = guild.roles.cache.get(cfg.birthdayRoleId);
      if (role) {
        for (const m of role.members.values()) if (!todays.includes(m.id)) m.roles.remove(role, 'Birthday over').catch(() => {});
        for (const u of todays) { const m = await guild.members.fetch(u).catch(() => null); if (m && !m.roles.cache.has(role.id)) m.roles.add(role, 'Happy birthday!').catch(() => {}); }
      }
    }
    // Announce once per day.
    if (cfg.birthdayLastRun !== key && todays.length && cfg.birthdayChannelId) {
      const ch = guild.channels.cache.get(cfg.birthdayChannelId);
      if (ch) { ch.send({ content: `🎉🎂 Happy Birthday ${todays.map((u) => `<@${u}>`).join(', ')}! Have an amazing day! 🥳`, allowedMentions: { users: todays } }).catch(() => {}); updateGuild(guild.id, { birthdayLastRun: key }); }
    }
  }
}
client.once(Events.ClientReady, () => { setTimeout(() => birthdayCheck().catch(() => {}), 15_000); const iv = setInterval(() => birthdayCheck().catch(() => {}), 60 * 60_000); iv.unref?.(); });

// Song request channel (/requests): type a song name or link there to queue it.
const songRequests = require('./lib/song-requests');
client.on(Events.MessageCreate, (msg) => { songRequests.handle(msg).catch((e) => console.warn('[requests]', e.message)); });

// Collab games — counting + one-word-story channel listeners.
const collab = require('./lib/collab');
client.on(Events.MessageCreate, (msg) => {
  if (!msg.guild || msg.author.bot) return;
  const cfg = getGuild(msg.guild.id);
  try {
    if (cfg.countingChannelId === msg.channelId) {
      const r = collab.countStep(cfg.counting, msg.author.id, msg.content);
      if (!r.handled) return;
      updateGuild(msg.guild.id, { counting: r.state });
      if (r.ok) msg.react(r.newBest ? '🏆' : '✅').catch(() => {});
      else { msg.react('❌').catch(() => {}); msg.channel.send(`💥 **${msg.author.username}** broke the chain at **${r.ruinedAt}** (expected ${r.expected})! Back to **1**.`).catch(() => {}); }
    } else if (cfg.storyChannelId === msg.channelId) {
      const r = collab.storyStep(cfg.story, msg.author.id, msg.content);
      if (!r.handled) return;
      if (r.ok) { updateGuild(msg.guild.id, { story: r.state }); msg.react('✅').catch(() => {}); }
      else if (r.reason === 'double') msg.react('🙅').catch(() => {});
      else if (r.reason === 'toolong') msg.react('📏').catch(() => {});
    }
  } catch (e) { console.warn('[collab]', e.message); }
});
client.on(Events.GuildMemberRemove, (member) => {
  const cfg = getGuild(member.guild.id);
  // goodbyes go to their own channel when there is one (/setup makes 👋-goodbyes), else the welcome channel
  const chId = (cfg.goodbyeChannelId && member.guild.channels.cache.has(cfg.goodbyeChannelId)) ? cfg.goodbyeChannelId : cfg.welcomeChannelId;
  if (!chId) return;
  const ch = member.guild.channels.cache.get(chId);
  ch?.send({ embeds: [welcomeEmbed(member, false)] }).catch(() => {});
});

// Auto voice rooms — joining the configured "Create Room" channel spawns a
// personal temp voice channel that auto-deletes when empty.
const tempVoiceChannels = new Set();

// Status page tracking (uptime bars, maintenance, outage alerts).
const statusMonitor = require('./lib/status-monitor');
statusMonitor.start({ client, control, ffmpegPath });
client.distube.on('error', () => statusMonitor.noteMusicError());

// DMs the owner after a crash, repeated music failures or a long disconnect.
const healthAlerts = require('./lib/health-alerts');
healthAlerts.start(client);
client.distube.on('error', (error) => healthAlerts.noteMusicError(error?.message || error));

// YouTube cookies about to run out: warn the owner (once a day) before downloads
// and playback start failing with "Sign in to confirm you're not a bot".
const checkCookieExpiry = () => {
  const e = ytCookies.expiry();
  if (!e || e.daysLeft > 3) return;
  const day = new Date().toISOString().slice(0, 10);
  healthAlerts.alert(`cookies:${day}`, e.daysLeft < 0 ? 'YouTube cookies have expired' : 'YouTube cookies expire soon',
    `${e.daysLeft < 0 ? 'The sign-in in your YouTube cookies ran out' : `The sign-in in your YouTube cookies runs out <t:${Math.floor(e.at / 1000)}:R>`}.\n`
    + 'Export a fresh cookies.txt from youtube.com and drop it in the cookies/ folder (or upload it in the Control room).',
    { color: 0xf59e0b, icon: '🍪' });
};
client.once(Events.ClientReady, () => setTimeout(checkCookieExpiry, 60_000));
setInterval(checkCookieExpiry, 6 * 3600_000).unref();

// Start-up safety checks (open dashboard, broken sign-in lock, no owner): console + DM.
client.once(Events.ClientReady, () => setTimeout(() => require('./lib/safety-checks').run(client, (t, l) => control.log(t, l, 'system', { subsystem: 'system' })), 15_000));

// Offsite backups: a backup DM'd to the owner weekly (OFFSITE_BACKUP=daily|weekly|off).
require('./lib/offsite-backup').start(client);

// /download: post in the channel it was started from when the download is finished.
require('./lib/download-queue').onFinish((s, job) => {
  if (!job.notify?.channelId) return;
  const ch = client.channels.cache.get(job.notify.channelId);
  if (!ch?.send) return;
  const c = s.counts;
  ch.send({
    content: `${job.notify.userId ? `<@${job.notify.userId}> ` : ''}${c.failed && !c.done && !c.skipped ? '✕' : '✓'} Download finished: **${s.name}**: `
      + `${c.done} new, ${c.skipped} already in the library${c.failed ? `, ${c.failed} failed (retry them in ⬇ Downloads)` : ''}.`,
    allowedMentions: { users: job.notify.userId ? [job.notify.userId] : [] },
  }).catch(() => {});
});

// Discord ready — pin the boot timeline step + log it through diagnostics.
client.once(Events.ClientReady, () => {
  diag.bootOk('ready', `${client.user.tag} · ${client.guilds.cache.size} guild${client.guilds.cache.size === 1 ? '' : 's'}`);
  try { ops.recordEvent('boot', `${client.user.tag} · ${client.guilds.cache.size} guilds`); } catch { /* */ }
  // Apply any custom presence configured from the dashboard.
  try { require('./lib/presence').applyNow(client); } catch { /* */ }
  control.log(`◇ Discord ready: ${client.user.tag} in ${client.guilds.cache.size} guild${client.guilds.cache.size === 1 ? '' : 's'}`,
    'success', 'discord', { subsystem: 'discord', meta: { tag: client.user.tag, guilds: client.guilds.cache.size } });
});

// Gateway-level event hooks routed into diagnostics.
client.on('shardError',        (err, id)  => control.log(`▲ Shard ${id} error: ${err?.message || err}`, 'error', 'discord', { subsystem: 'discord', meta: { stack: err?.stack } }));
client.on('shardDisconnect',   (ev, id)   => control.log(`⌬ Shard ${id} disconnected (code ${ev?.code})`, 'warn', 'discord', { subsystem: 'discord', meta: { code: ev?.code, reason: ev?.reason } }));
client.on('shardReconnecting', (id)       => control.log(`↻ Shard ${id} reconnecting…`, 'info', 'discord', { subsystem: 'discord' }));
client.on('shardResume',       (id, evs)  => control.log(`↑ Shard ${id} resumed (${evs} events replayed)`, 'info', 'discord', { subsystem: 'discord' }));
client.on('error',             (err)      => control.log(`▲ Discord client error: ${err?.message || err}`, 'error', 'discord', { subsystem: 'discord', meta: { stack: err?.stack } }));
client.on('warn',              (info)     => control.log(`▲ Discord warn: ${info}`, 'warn', 'discord', { subsystem: 'discord' }));
// discord.js v14 reports rate limits on the REST manager, not the client.
client.rest.on('rateLimited',  (info)     => { ops.recordRateLimit(info); control.log(`⏱ Rate limited: ${info?.method} ${info?.path} (retry ${info?.timeout}ms)`, 'warn', 'discord', { subsystem: 'discord', meta: info }); });

// Message logs — capture deletes/edits for the dashboard Message Logs page.
// Only fires for cached messages (recent activity); uncached ones log metadata.
const messageLogs = require('./lib/message-logs');
client.on(Events.MessageDelete, (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  messageLogs.record({ type: 'delete', guildId: msg.guild.id, channelId: msg.channelId,
    channelName: msg.channel?.name || null, authorId: msg.author?.id || null, authorTag: msg.author?.tag || null,
    content: (msg.content || '').slice(0, 1000) });
});
client.on(Events.MessageUpdate, (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  messageLogs.record({ type: 'edit', guildId: newMsg.guild.id, channelId: newMsg.channelId,
    channelName: newMsg.channel?.name || null, authorId: newMsg.author?.id || null, authorTag: newMsg.author?.tag || null,
    content: (oldMsg.content || '').slice(0, 1000), newContent: (newMsg.content || '').slice(0, 1000) });
});

// On ready: scan for orphaned temp voice channels left over from previous runs
// (empty voice channels in the auto-voice category whose name starts with 🎙).
client.once(Events.ClientReady, () => {
  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuild(guild.id);
    if (!cfg.autoVoiceRoomId) continue;
    const triggerCh = guild.channels.cache.get(cfg.autoVoiceRoomId);
    if (!triggerCh) continue;
    const parentId = triggerCh.parentId;
    for (const ch of guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildVoice) continue;
      if (ch.id === cfg.autoVoiceRoomId) continue;          // never delete the trigger
      if (ch.parentId !== parentId) continue;               // must be in same category
      if (!ch.name.startsWith('🎙 ')) continue;             // only our temp rooms
      if (ch.members.some((m) => !m.user.bot)) {                            // still in use — track it
        tempVoiceChannels.add(ch.id);
        continue;
      }
      ch.delete('Orphaned temp voice room on restart').catch(() => {});
    }
  }
});
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // Spawn on join of the trigger channel
  const cfg = getGuild(newState.guild.id);
  if (cfg.autoVoiceRoomId && newState.channelId === cfg.autoVoiceRoomId && newState.id !== client.user.id) {
    try {
      const parent = newState.channel.parent;
      const ch = await newState.guild.channels.create({
        name: `🎙 ${newState.member.displayName}'s Room`,
        type: ChannelType.GuildVoice,
        parent: parent?.id,
        permissionOverwrites: [
          {
            id: newState.member.id,
            allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers],
          },
        ],
      });
      tempVoiceChannels.add(ch.id);
      await newState.member.voice.setChannel(ch);
    } catch (e) { console.warn('[autovoice] failed:', e.message); }
  }
  // Clean up empty temp channels
  if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
    const ch = oldState.guild.channels.cache.get(oldState.channelId);
    // Bots don't count as occupants: the music bot staying behind must not keep
    // the room alive. Disconnect it first so its queue ends cleanly.
    if (ch && !ch.members.some((m) => !m.user.bot)) {
      tempVoiceChannels.delete(ch.id);
      if (ch.members.has(client.user.id)) {
        try { client.distube.voices.leave(ch.guild.id); } catch { /* already gone */ }
      }
      ch.delete('Temp voice room empty').catch((e) => console.warn('[autovoice] delete failed:', e.message));
    }
  }
});

// ===== v3.2.4 — Welcome sound, leave sound, voice-follow =====
//
// Welcome sound (option A): plays when the bot is idle in voice AND either
//   (a) the bot itself joined, OR
//   (b) a user joined the channel where the bot already is.
// Skipped if the bot is currently playing — no music interruption.
//
// Leave sound: plays before the bot disconnects when the channel goes empty
// (only if the queue isn't running — same idle check).
//
// Voice-follow (per-user opt-in via /follow): when a user moves voice
// channels AND they're the requester of the currently playing song AND
// they've opted in, the bot moves to their new channel.
const voiceFollow = require('./lib/voice-follow');

// Helper: is the bot currently playing music (or has anything queued)?
const isBotIdle = (guildId) => {
  const q = client.distube?.queues?.get(guildId);
  return !q || !q.songs || q.songs.length === 0;
};

// Helper: get the bot's current voice channel in this guild.
const botVoiceChannel = (guild) => guild.members.me?.voice?.channel || null;

// Helper: play a short audio URL via DisTube only when idle. We rely on the
// idle check rather than trying to interrupt the player.
const playSoundIfIdle = async (channel, url, label) => {
  if (!channel || !url) return;
  if (!isBotIdle(channel.guild.id)) return;  // music is playing — don't trample it
  try {
    await client.distube.play(channel, url);
  } catch (e) {
    control.log(`${label} sound failed: ${e.message}`, 'warn');
  }
};

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild;
  const guildId = guild.id;
  const cfg = getGuild(guildId);
  const isBotState = oldState.id === client.user.id;

  // Remember when the bot joined voice: the welcome sound is only for fresh joins,
  // not for every new queue while it's already sitting in the channel.
  if (isBotState) {
    if (!oldState.channelId && newState.channelId) welcomeIntro.noteJoin(guildId);
    else if (oldState.channelId && !newState.channelId) welcomeIntro.noteLeave(guildId);
  }

  // ===== Welcome sound — bot just joined a channel =====
  if (isBotState && !oldState.channelId && newState.channelId && cfg.welcomeSoundUrl) {
    // Joined to play music (/play etc.): the queue appears a moment after
    // this fires, and the welcome sound then plays before the first song
    // (welcome-intro). So wait a little; only an idle join (/join, 24/7)
    // still has no queue then, and gets the welcome sound on its own.
    const channel = newState.channel;
    setTimeout(() => {
      if (botVoiceChannel(guild)?.id !== channel?.id || !isBotIdle(guildId)) return;  // left again, or music started
      playSoundIfIdle(channel, welcomeIntro.forIdleJoin(guildId, cfg.welcomeSoundUrl), 'Welcome').catch(() => {});
    }, 4000).unref?.();
    return;  // bot-state changes don't trigger user-join or follow logic
  }

  // ===== Leave sound — bot just left a channel =====
  if (isBotState && oldState.channelId && !newState.channelId && cfg.leaveSoundUrl) {
    // The bot has already disconnected by the time this fires, so we can't
    // play through it anymore. The leave sound is fired pre-disconnect via
    // the DisTube `empty` hook below instead. This branch is just here so
    // future-us doesn't add a duplicate handler.
    return;
  }

  if (isBotState) return;  // any other bot state change — not interesting

  // ===== Welcome sound — a user joined the bot's channel =====
  // Fires when the user moves INTO the channel the bot is sitting in.
  if (newState.channelId && oldState.channelId !== newState.channelId) {
    const botChannel = botVoiceChannel(guild);
    // Their own /joinsound wins over the server's welcome sound.
    const own = (cfg.joinSounds || {})[newState.id];
    const ownUrl = own && fs.existsSync(path.join(__dirname, 'data', 'sounds', own)) ? control._soundUrl(own) : null;
    if (botChannel && botChannel.id === newState.channelId && (ownUrl || cfg.welcomeSoundUrl)) {
      await playSoundIfIdle(botChannel, ownUrl || cfg.welcomeSoundUrl, ownUrl ? 'Join sound' : 'User-join welcome');
    }
  }

  // ===== Voice-follow — the user (a) opted in, (b) is the current requester =====
  if (!newState.channelId) return;  // user disconnected entirely — don't follow
  if (oldState.channelId === newState.channelId) return;  // they didn't move
  if (!voiceFollow.isEnabled(guildId, newState.id)) return;  // not opted in

  const queue = client.distube?.queues?.get(guildId);
  const currentSong = queue?.songs?.[0];
  const requesterId = currentSong?.member?.id || currentSong?.user?.id;
  if (!queue || !currentSong || requesterId !== newState.id) return;

  // The current song's requester moved. Migrate the bot.
  const botChannel = botVoiceChannel(guild);
  if (!botChannel || botChannel.id === newState.channelId) return;  // already there
  // Don't follow into the AFK channel — most servers intend AFK as quiet zones.
  if (guild.afkChannelId && newState.channelId === guild.afkChannelId) {
    control.log(`Voice-follow: ${newState.member?.displayName || newState.id} moved to AFK — staying put.`, 'info');
    return;
  }
  // Check permissions in the destination.
  const me = guild.members.me;
  const destPerms = newState.channel.permissionsFor(me);
  if (!destPerms?.has(['Connect', 'Speak'])) {
    control.log(`Voice-follow: can't follow into ${newState.channel.name} — missing Connect/Speak perms.`, 'warn');
    return;
  }
  try {
    queue.voice.channel = newState.channel;
    control.log(`Voice-follow: hopped to ${newState.channel.name} with ${newState.member?.displayName || newState.id}.`, 'info');
  } catch (e) {
    control.log(`Voice-follow failed: ${e.message}`, 'warn');
  }
});

// Leave sound — fired BEFORE the bot disconnects (which is when the channel
// goes empty and DisTube would normally cut the connection). We let DisTube's
// `empty` event give us a heads up so we can play the leave sound first.
client.distube?.on?.('empty', async (queue) => {
  const guildId = queue?.voiceChannel?.guild?.id;
  if (!guildId) return;
  const cfg = getGuild(guildId);
  if (!cfg.leaveSoundUrl) return;
  const channel = queue.voiceChannel;
  if (!channel) return;
  try {
    // Stop the current queue (it's empty anyway), then play the leave sound.
    // DisTube will auto-disconnect when it finishes if no 24/7 mode is set.
    await client.distube.play(channel, cfg.leaveSoundUrl);
  } catch (e) {
    control.log(`Leave sound failed: ${e.message}`, 'warn');
  }
});

// Reaction-roles handler
// Supports two storage formats (both coexist in reactionRoles):
//   Single  — reactionRoles[msgId] = { emoji, roleId }          ← /reactionrole command
//   Multi   — reactionRoles[msgId] = [{ emoji, roleId }, …]     ← /setup role panel & verify
const handleReaction = async (reaction, user, grant) => {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
  if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }
  const guildId = reaction.message.guildId;
  if (!guildId) return;
  const rr = getGuild(guildId).reactionRoles?.[reaction.message.id];
  if (!rr) return;

  // Normalise to array so both formats share one code path
  const mappings = Array.isArray(rr) ? rr : [rr];
  const emojiStr = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`  // custom emoji
    : reaction.emoji.name;                               // unicode emoji
  const match = mappings.find((m) => m.emoji === emojiStr || m.emoji === reaction.emoji.name);
  if (!match) return;

  const guild  = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  try {
    if (grant) await member.roles.add(match.roleId,  `Reaction role: ${emojiStr}`);
    else       await member.roles.remove(match.roleId, `Reaction role removed: ${emojiStr}`);
  } catch (e) { console.warn('[reactionrole] failed:', e.message); }
};
client.on(Events.MessageReactionAdd,    (r, u) => handleReaction(r, u, true));
client.on(Events.MessageReactionRemove, (r, u) => handleReaction(r, u, false));
// ⭐ starboard (lib/starboard.js): enough stars → reposted in the starboard channel
const starboard = require('./lib/starboard');
client.on(Events.MessageReactionAdd,    (r) => { if (r.emoji?.name === '⭐') starboard.handle(r); });
client.on(Events.MessageReactionRemove, (r) => { if (r.emoji?.name === '⭐') starboard.handle(r); });

// Bot self-introduction when joining a new server
const { deployToGuild, forgetGuild } = require('./lib/command-deploy');
client.on(Events.GuildCreate, async (guild) => {
  control.log(`+ Joined server: ${guild.name}`);
  // Auto-deploy slash commands to the new guild — they show up instantly
  // (vs. up-to-1-hour wait if we relied on global commands).
  if (process.env.AUTO_DEPLOY_COMMANDS !== 'false') {
    const r = await deployToGuild(client, guild.id);
    if (r.ok && r.deployed) control.log(`✦ Deployed ${r.count} slash commands to ${guild.name}`);
    else if (!r.ok) control.log(`✕ Command deploy failed for ${guild.name}: ${r.error}`, 'error');
  }
  const target = guild.systemChannel || guild.channels.cache.find((c) =>
    c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages),
  );
  if (!target) return;
  const embed = themedEmbed(
    COLORS.COSMIC,
    '◆  MaowCore arrived',
    [
      'Cosmic uplink ready. I bring music, moderation, and a futuristic web dashboard.',
      '',
      '**Quick start:**',
      '• `/setup` — auto-create channels, roles, modlog (recommended)',
      '• `/play <query>` — queue a song from YouTube/Spotify/SoundCloud',
      '• `/help` — full command list (60+ commands)',
    ].join('\n'),
  );
  target.send({ embeds: [embed] }).catch(() => {});
});

// Drop the cached command hash for guilds we leave so the file stays tidy.
client.on(Events.GuildDelete, (guild) => {
  control.log(`- Left server: ${guild.name || guild.id}`);
  forgetGuild(guild.id);
});

// ── Stats channel updater ────────────────────────────────────────────────────
// Discord rate limit: 2 name changes per channel per 10 minutes.
// We run every 5 minutes — safe (1 edit per 5 min = 2 per 10 min max).
const STATS_TICK_MS    = 5 * 60 * 1000;   // server stats:   every 5 min
const SYS_MONITOR_MS   = 5 * 60 * 1000;   // system monitor: every 5 min

const safeRename = async (ch, newName) => {
  if (!ch || ch.name === newName) return;
  try { await ch.setName(newName); } catch { /* rate-limited or missing perms — skip silently */ }
};

// ── Server stat channels (members, bots, channels, roles, boosts) ────────────
const updateStatsChannels = async () => {
  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuild(guild.id);
    if (!cfg.statsChannels) continue;
    const counts = {
      members:  guild.memberCount,
      bots:     [...guild.members.cache.values()].filter((m) => m.user.bot).length,
      channels: guild.channels.cache.size,
      roles:    guild.roles.cache.size,
      boosts:   guild.premiumSubscriptionCount ?? 0,
    };
    const labels = {
      members:  '👥 Members:',
      bots:     '🤖 Bots:',
      channels: '📁 Channels:',
      roles:    '🎭 Roles:',
      boosts:   '🚀 Boosts:',
    };
    for (const [key, channelId] of Object.entries(cfg.statsChannels)) {
      const ch = guild.channels.cache.get(channelId);
      await safeRename(ch, `${labels[key] ?? key} ${counts[key] ?? 0}`);
    }
  }
};
// Weekly stats card (/stats weekly): Mondays from 10:00, once per week.
const musicStats = require('./lib/music-stats');
const postWeeklyStats = async () => {
  const now = new Date();
  if (now.getDay() !== 1 || now.getHours() < 10) return;
  const week = musicStats.weekKey(now);
  for (const guild of client.guilds.cache.values()) {
    const ws = getGuild(guild.id).weeklyStats;
    if (!ws?.channelId || ws.lastWeek === week) continue;
    updateGuild(guild.id, { weeklyStats: { ...ws, lastWeek: week } });
    const ch = guild.channels.cache.get(ws.channelId);
    if (!ch?.send) continue;
    const card = musicStats.card(guild.name, musicStats.forGuild(guild.id, 'week'));
    card.title = `📊 Weekly recap · ${guild.name}`;
    ch.send({ embeds: [card] }).catch((e) => control.log(`Weekly stats post failed in ${guild.name}: ${e.message}`, 'warn'));
  }
};
setInterval(() => postWeeklyStats().catch(() => {}), 15 * 60 * 1000);

// ── CPU usage helper (samples over 500 ms for accuracy) ───────────────────────
function getCpuPercent() {
  return new Promise((resolve) => {
    const snap1 = os.cpus().map((c) => ({ ...c.times }));
    setTimeout(() => {
      let idle = 0, total = 0;
      os.cpus().forEach((cpu, i) => {
        for (const t of Object.keys(cpu.times)) {
          const delta = cpu.times[t] - snap1[i][t];
          total += delta;
          if (t === 'idle') idle += delta;
        }
      });
      resolve(total === 0 ? 0 : Math.round(100 * (1 - idle / total)));
    }, 500);
  });
}

// ── Format helpers ─────────────────────────────────────────────────────────────
const fmtUptime = (sec) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const fmtMB  = (b) => `${(b / 1024 / 1024).toFixed(0)} MB`;
const fmtGB  = (b) => `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;

// ── System monitor channels (CPU, RAM, uptime, ping, heap, load) ──────────────
const updateSystemMonitor = async () => {
  // CPU percent is async — fetch once, reuse across all guilds
  const cpuPct = await getCpuPercent();

  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuild(guild.id);
    if (!cfg.sysMonitorChannels) continue;

    const mem        = process.memoryUsage();
    const totalRam   = os.totalmem();
    const usedRam    = totalRam - os.freemem();
    const [load1]    = os.loadavg();           // 1-min load avg (0 on Windows — handled below)
    const loadStr    = process.platform === 'win32' ? 'N/A' : load1.toFixed(2);
    const uptimeStr  = fmtUptime(Math.floor(process.uptime()));
    const pingStr    = latency.label();

    const values = {
      cpu:    `🖥️ CPU: ${cpuPct}%`,
      ram:    `💾 RAM: ${fmtMB(usedRam)} / ${fmtGB(totalRam)}`,
      heap:   `🔥 Heap: ${fmtMB(mem.heapUsed)} / ${fmtMB(mem.heapTotal)}`,
      uptime: `⬆️ Up: ${uptimeStr}`,
      ping:   `🏓 Ping: ${pingStr}`,
      load:   `🔄 Load: ${loadStr}`,
    };

    for (const [key, channelId] of Object.entries(cfg.sysMonitorChannels)) {
      const ch = guild.channels.cache.get(channelId);
      await safeRename(ch, values[key] ?? key);
    }
  }
};

setInterval(updateStatsChannels,  STATS_TICK_MS);
setInterval(updateSystemMonitor,  SYS_MONITOR_MS);
client.once(Events.ClientReady, () => {
  setTimeout(updateStatsChannels,  5_000);   // initial fill 5s after ready
  setTimeout(updateSystemMonitor, 10_000);   // stagger so they don't both fire at once
});

// GitHub feed — polls for new commits, releases, issues, and PRs and
// broadcasts them to the channels configured by /setup.
const { startGitHubFeed } = require('./lib/github-feed');
client.once(Events.ClientReady, () => startGitHubFeed(client));

// Live notifications — watches configured Twitch (go-live) and YouTube
// (new uploads) channels per guild and pings the 🔴 Live Notifs role.
const { startLiveNotify } = require('./lib/live-notify');
client.once(Events.ClientReady, () => startLiveNotify(client));

// A delivered reminder: the text plus Snooze buttons (and Stop for repeats).
const reminderMessage = (r) => {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`remind:snooze:${r.id}:10`).setLabel('Snooze 10 min').setEmoji('💤').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`remind:snooze:${r.id}:60`).setLabel('1 hour').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`remind:snooze:${r.id}:t9`).setLabel('Tomorrow 9:00').setStyle(ButtonStyle.Secondary),
  );
  if (r.repeat) {
    row.addComponents(new ButtonBuilder().setCustomId(`remind:stop:${r.id}`).setLabel('Stop repeating').setStyle(ButtonStyle.Danger));
  }
  return {
    embeds: [themedEmbed(COLORS.NEBULA, r.profile ? `⏰  ${r.profile.emoji ? `${r.profile.emoji} ` : ''}${r.profile.name.toUpperCase()}'S REMINDER` : '⏰  REMINDER',
      `${r.what}${r.repeat ? `\n\n🔁 Repeats ${require('./commands/remind').REPEAT_LABEL[r.repeat]}` : ''}`)],
    components: [row],
  };
};

// Reminder ticker — checks every 15s for due reminders. Guards against
// re-entrancy so a slow tick can't process the same reminder twice.
let reminderTickRunning = false;
setInterval(async () => {
  if (reminderTickRunning) return;
  reminderTickRunning = true;
  try {
    const due = reminders.due();
    for (const r of due) {
      // Mark FIRST (repeat → next time, one-shot → kept for Snooze) so a
      // re-entrant tick can't deliver it twice.
      reminders.markFired(r);
      try {
        const payload = reminderMessage(r);
        // If the channel is gone or the bot can't post there any more, fall
        // back to a DM so the reminder isn't silently lost.
        let sent = false;
        if (r.channelId) {
          const ch = await client.channels.fetch(r.channelId).catch(() => null);
          if (ch?.send) sent = await ch.send({ content: `⏰ <@${r.userId}>`, ...payload }).then(() => true, () => false);
        }
        if (!sent) {
          const user = await client.users.fetch(r.userId).catch(() => null);
          await user?.send(payload).catch(() => {});
        }
      } catch { /* ignored */ }
    }
  } finally {
    reminderTickRunning = false;
  }
}, 15000);

// ===== Global crash safety net =====
// Last-resort handlers so an unhandled rejection or a stray uncaught error
// (e.g. a third-party lib's background promise) logs instead of silently
// killing the bot. Explicit error handling everywhere else is still the rule;
// this is just a backstop so a music bot doesn't die mid-session.
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  console.error('[unhandledRejection]', msg);
  try { ops.recordEvent('crash', `unhandledRejection: ${msg}`); } catch { /* */ }
  // Also surface in the dashboard so silent background failures aren't invisible.
  try {
    control.log(`▲ Unhandled promise rejection: ${msg}`, 'error', 'system',
      { subsystem: 'system', meta: { stack: reason?.stack } });
  } catch { /* control not yet ready */ }
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.stack || err?.message || err);
  try { ops.recordEvent('crash', `uncaughtException: ${err?.message || err}`); } catch { /* */ }
  // Intentionally not exiting — keep the bot + dashboard alive. If this fires
  // repeatedly something is genuinely wrong; check the logs.
  try {
    control.log(`▲ Uncaught exception: ${err?.message || err}`, 'error', 'system',
      { subsystem: 'system', meta: { stack: err?.stack } });
  } catch { /* control not yet ready */ }
  try {
    require('./lib/health-alerts').alert('uncaught', 'Unexpected error',
      `Something threw an error nobody caught. The bot kept running.\n\`\`\`${String(err?.stack || err?.message || err).slice(0, 900)}\`\`\``);
  } catch { /* alerts unavailable */ }
});

// Log in. A bad/expired token throws asynchronously — catch it so we don't
// hard-crash the whole process (which would also kill the dashboard + library
// server). Keep those running so the operator can still reach the UI, see the
// error, and fix DISCORD_TOKEN without flying blind.
diag.bootStart('login');
control.log('↑ Attempting Discord login…', 'info', 'startup', { subsystem: 'discord' });
client.login(process.env.DISCORD_TOKEN).then(() => {
  diag.bootOk('login', 'authenticated');
}).catch((err) => {
  diag.bootFail('login', err);
  const tokenIssue = err?.code === 'TokenInvalid' || /token/i.test(err?.message || '');
  control.log(`✕ Discord login failed: ${tokenIssue ? 'invalid/expired token' : err?.message || err}`,
    'error', 'startup', { subsystem: 'discord', meta: { code: err?.code, tokenIssue } });
  console.error('');
  console.error('  ╭─ DISCORD LOGIN FAILED ────────────────────────────────────────');
  console.error('  │');
  if (tokenIssue) {
    console.error('  │  Your DISCORD_TOKEN is invalid, expired, or was reset.');
    console.error('  │  → Open the Discord Developer Portal → your app → Bot →');
    console.error('  │    Reset Token, then paste the new value into .env as');
    console.error('  │    DISCORD_TOKEN=… and restart the bot.');
  } else {
    console.error(`  │  ${err?.message || err}`);
  }
  console.error('  │');
  console.error('  │  The dashboard + library server stay up at the URL above so');
  console.error('  │  you can still browse/upload — Discord features are offline');
  console.error('  │  until login succeeds.');
  console.error('  ╰───────────────────────────────────────────────────────────────');
  console.error('');
});

// ===== Graceful shutdown =====
// When the process gets SIGINT (Ctrl+C) or SIGTERM (Stop-Process / `kill`),
// destroy the Discord client cleanly so Discord receives a proper WebSocket
// close frame and marks the bot offline immediately — instead of waiting
// ~30–45s for the heartbeat to time out (which leaves the bot showing as
// "online" in Discord clients long after npm start has exited).
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  try { ops.recordEvent('shutdown', signal); } catch { /* */ }
  console.log(`\n◌  ${signal} received — closing uplink…`);
  // Cap the total shutdown time at 5s. If destroy hangs (rare but possible
  // on a stuck WebSocket), force-exit anyway so the user isn't stuck.
  const force = setTimeout(() => {
    console.warn('▲ shutdown timed out — force-exiting');
    process.exit(1);
  }, 5000);
  try {
    // Drop the voice connection first so audio sessions don't linger.
    for (const voice of client.distube.voices.collection.values()) {
      try { voice.leave(); } catch { /* ignored */ }
    }
    // Tear down WS + REST. discord.js fires the proper Gateway close frame.
    await client.destroy();
  } catch (e) {
    console.warn('▲ shutdown error:', e.message);
  } finally {
    clearTimeout(force);
    console.log('◇  uplink severed cleanly.');
    process.exit(0);
  }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// MaowCore Portable (desktop app) asks over IPC: Windows can't deliver SIGTERM.
process.on('message', (m) => { if (m === 'maow:shutdown') shutdown('app'); });
