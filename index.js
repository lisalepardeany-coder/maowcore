require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YouTubePlugin } = require('@distube/youtube');
const { YtDlpPlugin, json: ytdlpJson } = require('@distube/yt-dlp');
const ffmpegPath = require('ffmpeg-static');
const { generateDependencyReport } = require('@discordjs/voice');
const { getGuild } = require('./lib/config');
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
const lrclib = require('./lib/lrclib');
const tts = require('./lib/tts');
const undo = require('./lib/undo');
const automod = require('./lib/automod');
const modlog = require('./lib/modlog');
const reminders = require('./lib/reminders');

console.log('--- Voice dependency report ---');
console.log(generateDependencyReport());
console.log('--- FFmpeg path:', ffmpegPath, '---');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const ytDlpPlugin = new YtDlpPlugin({ update: false });
const youtubePlugin = new YouTubePlugin();
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
  const info = await ytdlpJson(song.url, {
    ...baseFlags,
    format:
      'bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio[ext=m4a][abr>=128]/bestaudio/ba/ba*',
    audioQuality: 0,
  });
  return info.url;
};

youtubePlugin.getStreamURL = (song) => ytDlpPlugin.getStreamURL(song);

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
    new SpotifyPlugin({
      api: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      },
    }),
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

const sponsorblock = new SponsorBlockManager();

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[WARN] Command ${file} missing "data" or "execute".`);
  }
}

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
        components: [buildControls(queue)],
      });
    } catch {
      stopLiveUpdate(guildId);
    }
  }, PROGRESS_TICK_MS);
  liveIntervals.set(guildId, intervalId);
};

// DisTube events
client.distube
  .on('playSong', async (queue, song) => {
    clearIdleTimer(queue.id);
    abLoop.stop(queue.id);  // clear any prior A-B loop when a new song starts
    presence.setPlaying(client, song);
    sponsorblock.onPlay(queue, song, (text, level) => control.log(text, level));
    session.set(queue.id, queue);
    spotifyFeatures.attachFeatures(song).catch(() => {});  // best-effort
    if (getGuild(queue.id).crossfade && !queue.filters.names.includes('crossfade_in')) {
      try { queue.filters.add('crossfade_in'); } catch { /* ignored */ }
    }

    // TTS song announcement — speaks "Now playing: <title>" in the text channel
    // when /announce is on. (Voice-channel TTS interleaving is too fragile with
    // DisTube's queue model; we announce in text instead.)
    if (getGuild(queue.id).announce && !song._announced) {
      song._announced = true;
      queue.textChannel?.send(`📢  Now playing: **${song.name}**`).catch(() => {});
    }
    lrclib.fetchSynced({
      trackName: song.name,
      artistName: song.uploader?.name || song.artist,
      duration: song.duration,
    }).then((r) => { if (r?.synced?.length) song.syncedLyrics = r.synced; }).catch(() => {});
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
    // Apply defaultLoopMode only on the first song of the session so user-driven
    // mid-session loop changes aren't clobbered.
    if (typeof cfg.defaultLoopMode === 'number' && (!queue.previousSongs?.length)) {
      try { queue.setRepeatMode(cfg.defaultLoopMode); } catch { /* ignored */ }
    }

    stopLiveUpdate(queue.id);
    const msg = await queue.textChannel?.send({
      embeds: [renderPlayingEmbed(queue, song)],
      components: [buildControls(queue)],
    }).catch((e) => { console.warn('Failed to send playSong embed:', e.message); return null; });
    if (msg) startLiveUpdate(queue.id, msg);
  })
  .on('addSong', (queue, song) => {
    clearIdleTimer(queue.id);
    session.set(queue.id, queue);
    queue.textChannel?.send({
      embeds: [
        themedEmbed(
          COLORS.NEBULA,
          '✧  LOCKED INTO TRAJECTORY',
          `**${song.name}** \`${song.formattedDuration}\`\n› requested by ${song.user}`,
        ),
      ],
    });
  })
  .on('addList', (queue, playlist) => {
    clearIdleTimer(queue.id);
    session.set(queue.id, queue);
    queue.textChannel?.send({
      embeds: [
        themedEmbed(
          COLORS.NEBULA,
          '⟡  CARGO LOADED',
          `**${playlist.name}** — \`${playlist.songs.length}\` signals queued`,
        ),
      ],
    });
  })
  .on('error', (error, queue) => {
    console.error('DisTube error:', error);
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
    });
    scheduleIdleLeave(queue.id, queue.textChannel, EMPTY_MS, 'Channel was deserted.');
  })
  .on('finish', (queue) => {
    stopLiveUpdate(queue.id);
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
    });
    scheduleIdleLeave(queue.id, queue.textChannel, getIdleMs(queue.id), 'Idle timeout reached.');
  })
  .on('disconnect', (queue) => {
    stopLiveUpdate(queue.id);
    clearIdleTimer(queue.id);
    sponsorblock.clearForGuild(queue.id);
    abLoop.stop(queue.id);
    sleepTimer.cancel(queue.id);
    presence.setIdle(client);
    queue.textChannel?.send({
      embeds: [themedEmbed(COLORS.COSMIC, '⌬  RETURNING TO THE VOID', 'Disconnected from voice.')],
    });
  });

// Interaction handler (slash commands + now-playing buttons)
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try { await command.autocomplete(interaction); } catch (e) { console.warn('autocomplete failed:', e.message); }
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    // (Aliases live on the dashboard console only — Discord requires slash commands
    // to be pre-registered, so runtime-defined names like /bops can't be invoked.)
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    const who = interaction.user?.username || interaction.user?.tag || 'unknown';
    control.log(`/${interaction.commandName} — ${who}`);
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error in /${interaction.commandName}:`, err);
      control.log(`/${interaction.commandName} failed: ${err.message || err}`, 'error');
      const reply = { content: `▲ Error: ${err.message || 'Something broke.'}`, flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('music:')) {
    const queue = client.distube.getQueue(interaction.guildId);
    if (!queue) {
      return interaction.reply({ content: '◌ No active transmission.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.member.voice.channelId !== queue.voice.channelId) {
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
        return interaction.update({ components: [buildControls(queue)] });
      }
      if (action === 'skip') {
        try { await queue.skip(); } catch { queue.stop(); }
        return interaction.reply({ content: '⏭  Warping to next signal.', flags: MessageFlags.Ephemeral });
      }
      if (action === 'stop') {
        undo.capture(queue.id, queue);
        queue.stop();
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
    } catch (err) {
      return interaction.reply({ content: `▲ ${err.message || err}`, flags: MessageFlags.Ephemeral });
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

client.on(Events.GuildMemberAdd, (member) => {
  // Anti-raid check first
  if (automod.checkRaid(member.guild, member)) {
    modlog.post(member.guild, { action: 'raid', target: member.user, mod: 'automod', reason: '5+ joins in <10s detected' });
  }
  const cfg = getGuild(member.guild.id);
  if (!cfg.welcomeChannelId) return;
  const ch = member.guild.channels.cache.get(cfg.welcomeChannelId);
  ch?.send({ embeds: [welcomeEmbed(member, true)] }).catch(() => {});
});

// Automod message listener — runs filter checks on every message
client.on(Events.MessageCreate, async (msg) => {
  if (!msg.guild) return;
  try { await automod.checkMessage(msg, modlog); } catch (e) { console.warn('[automod] error:', e.message); }
});
client.on(Events.GuildMemberRemove, (member) => {
  const cfg = getGuild(member.guild.id);
  if (!cfg.welcomeChannelId) return;
  const ch = member.guild.channels.cache.get(cfg.welcomeChannelId);
  ch?.send({ embeds: [welcomeEmbed(member, false)] }).catch(() => {});
});

// Auto voice rooms — joining the configured "Create Room" channel spawns a
// personal temp voice channel that auto-deletes when empty.
const tempVoiceChannels = new Set();
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
    if (ch && ch.members.size === 0) {
      tempVoiceChannels.delete(ch.id);
      ch.delete().catch(() => {});
    }
  }
});

// Welcome / leave sounds — fires when the bot itself joins/leaves a voice channel.
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (oldState.id !== client.user.id) return;  // only react to the bot's own state
  const guildId = newState.guild.id;
  const cfg = getGuild(guildId);
  // Joined a voice channel (oldState had none, newState has one)
  if (!oldState.channelId && newState.channelId && cfg.welcomeSoundUrl) {
    try {
      await client.distube.play(newState.channel, cfg.welcomeSoundUrl);
    } catch (e) { control.log(`Welcome sound failed: ${e.message}`, 'warn'); }
  }
  // Left a voice channel — we can't easily play AFTER disconnect, so play before
  // by listening for finish/empty events and triggering then. Skipped here.
});

// Reaction-roles handler — only acts on messages registered via /reactionrole
const handleReaction = async (reaction, user, grant) => {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
  const guildId = reaction.message.guildId;
  if (!guildId) return;
  const rr = getGuild(guildId).reactionRoles?.[reaction.message.id];
  if (!rr) return;
  if (reaction.emoji.name !== rr.emoji && reaction.emoji.toString() !== rr.emoji) return;
  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  try {
    if (grant) await member.roles.add(rr.roleId);
    else await member.roles.remove(rr.roleId);
  } catch (e) { console.warn('[reactionrole] failed:', e.message); }
};
client.on(Events.MessageReactionAdd, (r, u) => handleReaction(r, u, true));
client.on(Events.MessageReactionRemove, (r, u) => handleReaction(r, u, false));

// Bot self-introduction when joining a new server
client.on(Events.GuildCreate, async (guild) => {
  control.log(`+ Joined server: ${guild.name}`);
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

// Auto-update server stats channels every 10 minutes (Discord rate-limits name changes)
const STATS_TICK_MS = 10 * 60 * 1000;
const updateStatsChannels = async () => {
  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuild(guild.id);
    if (!cfg.statsChannels) continue;
    const counts = {
      members: guild.memberCount,
      bots: [...guild.members.cache.values()].filter((m) => m.user.bot).length,
      channels: guild.channels.cache.size,
    };
    const labelByKey = { members: '◆ Members:', bots: '✦ Bots:', channels: '⌬ Channels:' };
    for (const [key, channelId] of Object.entries(cfg.statsChannels)) {
      const ch = guild.channels.cache.get(channelId);
      if (!ch) continue;
      const newName = `${labelByKey[key] || key} ${counts[key] ?? 0}`;
      if (ch.name !== newName) {
        try { await ch.setName(newName); } catch { /* rate-limited or no perms */ }
      }
    }
  }
};
setInterval(updateStatsChannels, STATS_TICK_MS);
client.once(Events.ClientReady, () => setTimeout(updateStatsChannels, 5000));  // initial update 5s after ready

// Reminder ticker — checks every 15s for due reminders. Guards against
// re-entrancy so a slow tick can't process the same reminder twice.
let reminderTickRunning = false;
setInterval(async () => {
  if (reminderTickRunning) return;
  reminderTickRunning = true;
  try {
    const due = reminders.due();
    for (const r of due) {
      reminders.remove(r.id);  // remove FIRST so a re-entrant tick wouldn't see it
      try {
        if (r.channelId) {
          const ch = await client.channels.fetch(r.channelId).catch(() => null);
          ch?.send(`⏰ <@${r.userId}> — ${r.what}`).catch(() => {});
        } else {
          const user = await client.users.fetch(r.userId).catch(() => null);
          user?.send(`⏰ Reminder: ${r.what}`).catch(() => {});
        }
      } catch { /* ignored */ }
    }
  } finally {
    reminderTickRunning = false;
  }
}, 15000);

client.login(process.env.DISCORD_TOKEN);
