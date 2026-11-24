// HTTP routes for the v3.3 panel features: profiles, reminders, voice
// ambience, the listen room, health alerts and backup cleanup.
// Rank checks happen earlier in panel-extras (requiredRank); handlers here
// only work out WHO is asking (their Discord id) for per-user data.
const extras = require('./panel-extras');
const owners = require('./owners');

// Who is this? Signed-in Discord user, else (open panel) the owner.
const whoAmI = (req, control) => {
  const me = extras.identify(req, control);
  return {
    ...me,
    userId: me.userId || owners.primary() || 'local',
    tag: me.userId ? me.who : 'Owner',
    signedIn: !!me.userId,
  };
};

const sameSite = (req) => {
  const o = req.headers.origin;
  return !o || o === `http://${req.headers.host}` || o === `https://${req.headers.host}`;
};

// Pick the server: explicit guildId, else the one with music, else the first.
const pickGuild = (control, guildId) => {
  const c = control.client;
  if (guildId && c.guilds.cache.has(guildId)) return c.guilds.cache.get(guildId);
  const q = control.distube.queues.collection.keys().next().value;
  if (q && c.guilds.cache.has(q)) return c.guilds.cache.get(q);
  const v = control.distube.voices.collection.keys().next().value;
  if (v && c.guilds.cache.has(v)) return c.guilds.cache.get(v);
  return c.guilds.cache.first() || null;
};

// Voice channel to play into: where the bot is, else where an owner is.
const targetVoice = (control, guild) => control.distube.voices.get(guild.id)?.channel
  || owners.ids().map((id) => guild.voiceStates.cache.get(id)?.channel).find(Boolean) || null;

// Simple per-user rate limit for the listen room.
const lastAdd = new Map();
const LISTEN_GAP_MS = 15000;

const songView = (s) => (s ? {
  name: s.metadata?.localName || s.name, url: s.url, thumbnail: s.thumbnail || null, duration: s.duration || 0,
  by: s.metadata?.listenBy || s.member?.displayName || s.user?.username || null,
} : null);

// Ask yt-dlp for a well-known video's title (with cookies if any) and report
// whether YouTube let us through.
const testYouTube = (cookieFile) => new Promise((resolve) => {
  const { execFile } = require('node:child_process');
  const bin = require('./library').YTDLP_PATH;
  // Asks for real audio (-f bestaudio), not just the title, so a half-working
  // setup ("Only images are available") shows up as a failure.
  const args = ['--no-warnings', '--skip-download', '--print', 'title', '-f', 'bestaudio',
    ...require('./yt-cookies').ytdlpArgs(), 'https://www.youtube.com/watch?v=jNQXAC9IVRw'];
  execFile(bin, args, { timeout: 45000, windowsHide: true }, (err, stdout, stderr) => {
    const text = `${stdout}\n${stderr}`;
    if (/not a bot|sign in to confirm/i.test(text)) return resolve({ ok: false, botCheck: true, usedCookies: !!cookieFile, error: 'YouTube still asks to confirm you\'re not a bot.' });
    if (err || !String(stdout).trim()) return resolve({ ok: false, usedCookies: !!cookieFile, error: String(stderr || err?.message || 'No answer').split('\n').find((l) => /ERROR/.test(l))?.slice(0, 200) || 'yt-dlp failed.' });
    return resolve({ ok: true, usedCookies: !!cookieFile, title: String(stdout).trim().slice(0, 100) });
  });
});

const handle = async (req, res, p, control, url) => {
  const json = (body, status) => control._json(res, body, status);
  const body = () => control._readJsonBody(req);
  const post = req.method === 'POST';
  // Changing personal data / the lock only from the panel's own pages
  // (panel-extras already refused other websites; this also keeps out
  // browser extensions and other local panels).
  if (post && !sameSite(req) && /^\/api\/(profiles|reminders|health-alerts)\//.test(p)) {
    return json({ error: 'Blocked: request came from another site.' }, 403), true;
  }

  // ===== Profiles =====
  if (p === '/api/profiles' && !post) {
    const me = whoAmI(req, control);
    const list = require('./profiles').list(me.userId);
    json({ profiles: list, fronting: list.find((x) => x.fronting)?.id || null, available: require('./db').isAvailable });
    return true;
  }
  if (p.startsWith('/api/profiles/') && post) {
    const me = whoAmI(req, control);
    const b = await body();
    const profiles = require('./profiles');
    try {
      if (p === '/api/profiles/save') json({ ok: true, profile: profiles.save(me.userId, b) });
      else if (p === '/api/profiles/delete') json({ ok: profiles.remove(me.userId, b.id) });
      else if (p === '/api/profiles/front') json({ ok: true, fronting: profiles.setFront(me.userId, b.id || null) });
      else json({ error: 'Unknown profiles action' }, 404);
    } catch (e) { json({ error: e.message }, 400); }
    return true;
  }

  // ===== Reminders =====
  if (p === '/api/reminders' && !post) {
    const me = whoAmI(req, control);
    const reminders = require('./reminders');
    const all = url.searchParams.get('all') === '1' && extras.rankAtLeast(me.rank, 'admin');
    const list = all ? reminders.all() : reminders.forUser(me.userId);
    const names = new Map();
    for (const r of list) {
      if (!names.has(r.userId)) names.set(r.userId, control.client.users.cache.get(r.userId)?.username || r.userId);
    }
    json({ reminders: list.map((r) => ({ ...r, userName: names.get(r.userId) })), all, repeats: reminders.REPEATS });
    return true;
  }
  if (p === '/api/reminders/add' && post) {
    const me = whoAmI(req, control);
    const b = await body();
    const reminders = require('./reminders');
    const fireAt = reminders.parseWhen(b.when);
    if (!fireAt) return json({ error: 'I didn\'t get that time. Try 30min, 2h, 9:00, 21:30 or tomorrow 9:00.' }, 400), true;
    if (!String(b.what || '').trim()) return json({ error: 'What should I remind you about?' }, 400), true;
    // The panel sends the active profile (headmate) along, if one is chosen.
    let profile = null;
    if (b.profileId) { try { const p = require('./profiles').list(me.userId).find((x) => x.id === b.profileId); if (p) profile = { id: p.id, name: p.name, emoji: p.emoji }; } catch { /* */ } }
    try { json({ ok: true, reminder: reminders.add({ userId: me.userId, what: b.what, fireAt, repeat: b.repeat || null, profile }) }); }
    catch (e) { json({ error: e.message }, 400); }
    return true;
  }
  if (p === '/api/reminders/cancel' && post) {
    const me = whoAmI(req, control);
    const b = await body();
    const admin = extras.rankAtLeast(me.rank, 'admin');
    json({ ok: require('./reminders').cancel(b.id, admin ? null : me.userId) });
    return true;
  }

  // ===== Voice ambience =====
  if (p === '/api/ambience' && !post) {
    const a = require('./ambience');
    const g = pickGuild(control, url.searchParams.get('guildId'));
    const q = g ? control.distube.getQueue(g.id) : null;
    json({ presets: a.PRESETS, playing: q?.songs?.[0]?.metadata?.ambience || null });
    return true;
  }
  if (p === '/api/ambience/play' && post) {
    const a = require('./ambience');
    const b = await body();
    const g = pickGuild(control, b.guildId);
    if (!g) return json({ error: 'The bot isn\'t in any server.' }, 409), true;
    const ch = targetVoice(control, g);
    if (!ch) return json({ error: 'Join a voice channel first (or have the bot in one).' }, 409), true;
    const preset = b.preset && a.PRESETS[b.preset] ? b.preset : a.presetForTheme(b.theme, b.category);
    try {
      const info = await a.playIn(control.client, ch, preset, { volume: Number(b.volume) || 35 });
      control.log(`${info.emoji} Ambience "${info.label}" started in ${ch.name}`, 'info');
      json({ ok: true, preset, label: info.label, channel: ch.name });
    } catch (e) { json({ error: e.message }, 409); }
    return true;
  }
  if (p === '/api/ambience/stop' && post) {
    const b = await body();
    const g = pickGuild(control, b.guildId);
    const q = g ? control.distube.getQueue(g.id) : null;
    if (!q?.songs?.[0]?.metadata?.ambience) return json({ ok: false, error: 'No ambience is playing.' }), true;
    await q.stop().catch(() => {});
    json({ ok: true });
    return true;
  }

  // ===== Listen room (guests allowed) =====
  if (p === '/api/listen/state' && !post) {
    const me = whoAmI(req, control);
    const g = pickGuild(control, url.searchParams.get('guildId'));
    const q = g ? control.distube.getQueue(g.id) : null;
    const vc = g ? control.distube.voices.get(g.id)?.channel : null;
    json({
      server: g ? { id: g.id, name: g.name, icon: g.iconURL?.({ size: 64 }) || null } : null,
      voice: vc ? { name: vc.name, listeners: vc.members.filter((m) => !m.user.bot).map((m) => m.displayName).slice(0, 30) } : null,
      nowPlaying: songView(q?.songs?.[0]),
      currentTime: q?.currentTime || 0,
      paused: !!q?.paused,
      upNext: (q?.songs || []).slice(1, 16).map(songView),
      more: Math.max(0, (q?.songs?.length || 0) - 16),
      you: { tag: me.tag, rank: me.rank },
      canAdd: !!vc,
    });
    return true;
  }
  if (p === '/api/listen/add' && post) {
    const me = whoAmI(req, control);
    const b = await body();
    const query = String(b.query || '').trim().slice(0, 300);
    if (!query) return json({ error: 'Type a song name or paste a link.' }, 400), true;
    const g = pickGuild(control, b.guildId);
    const vc = g ? control.distube.voices.get(g.id)?.channel : null;
    if (!vc) return json({ error: 'Nothing is playing right now, so there is no room to add to.' }, 409), true;
    const wait = LISTEN_GAP_MS - (Date.now() - (lastAdd.get(me.userId) || 0));
    if (wait > 0 && !extras.rankAtLeast(me.rank, 'moderator')) return json({ error: `Slow down a little — try again in ${Math.ceil(wait / 1000)}s.` }, 429), true;
    try {
      let target = query;
      if (!/^https?:\/\//i.test(query)) {
        const res = await control.client.youtubePlugin.search(query, { limit: 1, type: 'video' });
        target = res?.[0]?.url;
        if (!target) return json({ error: 'No song found for that.' }, 404), true;
      } else if (!/^https?:\/\/([\w-]+\.)*(youtube\.com|youtu\.be|spotify\.com|soundcloud\.com)\//i.test(query)) {
        return json({ error: 'Links from YouTube, Spotify or SoundCloud only.' }, 400), true;
      }
      lastAdd.set(me.userId, Date.now());
      await control.distube.play(vc, target, { metadata: { listenBy: me.tag } });
      control.log(`🎧 Listen room: ${me.tag} added ${query.slice(0, 80)}`, 'info');
      json({ ok: true });
    } catch (e) { json({ error: e.message }, 500); }
    return true;
  }

  // ===== Health alerts =====
  if (p === '/api/health-alerts' && !post) {
    const h = require('./health-alerts');
    json({ enabled: h.enabled(), recent: h.recent(), owner: !!owners.primary(), envOff: process.env.HEALTH_ALERTS === '0' });
    return true;
  }
  if (p === '/api/health-alerts/set' && post) {
    const b = await body();
    require('./dashboard-auth').setEnv('HEALTH_ALERTS', b.on ? '1' : '0');
    json({ ok: true, enabled: require('./health-alerts').enabled() });
    return true;
  }
  if (p === '/api/health-alerts/test' && post) {
    const h = require('./health-alerts');
    const sent = await h.alert(`test-${Date.now()}`, 'Test alert', 'This is a test from the panel. Health alerts are working! 🎉');
    json({ ok: sent, error: sent ? null : (h.enabled() ? 'Could not DM you. Do you allow DMs from the bot?' : 'Health alerts are turned off.') });
    return true;
  }

  // ===== YouTube cookies (owner only; values never sent back) =====
  if (p === '/api/youtube-cookies' && !post) {
    json(require('./yt-cookies').info());
    return true;
  }
  if (p.startsWith('/api/youtube-cookies/') && post) {
    if (!sameSite(req)) return json({ error: 'Blocked: request came from another site.' }, 403), true;
    const yc = require('./yt-cookies');
    if (p === '/api/youtube-cookies/save') {
      const b = await body();
      try {
        const info = yc.save(b.text);
        control.log('🍪 YouTube cookies updated from the panel', 'info', 'system', { subsystem: 'system' });
        json({ ok: true, ...info, supervised: !!process.env.MAOW_SUPERVISED });
      } catch (e) { json({ error: e.message }, 400); }
      return true;
    }
    if (p === '/api/youtube-cookies/remove') {
      json({ ok: yc.remove() });
      control.log('🍪 YouTube cookies removed', 'info', 'system', { subsystem: 'system' });
      return true;
    }
    if (p === '/api/youtube-cookies/test') {
      json(await testYouTube(yc.filePath()));
      return true;
    }
  }

  // ===== Saved playlists (yours, per server) =====
  if (p === '/api/playlists' && !post) {
    const me = whoAmI(req, control);
    const g = pickGuild(control, url.searchParams.get('guildId'));
    if (!g) return json({ playlists: [] }), true;
    const lists = require('./playlists').listFor(g.id, me.userId);
    json({ guild: { id: g.id, name: g.name }, playlists: Object.entries(lists).map(([name, urls]) => ({ name, count: urls.length })).sort((a, b) => a.name.localeCompare(b.name)) });
    return true;
  }
  if (p.startsWith('/api/playlists/') && post) {
    const me = whoAmI(req, control);
    const b = await body();
    const g = pickGuild(control, b.guildId);
    if (!g) return json({ error: 'The bot isn\'t in any server.' }, 409), true;
    const pls = require('./playlists');
    try {
      if (p === '/api/playlists/delete') { pls.remove(g.id, me.userId, b.name); return json({ ok: true }), true; }
      if (p === '/api/playlists/save') {
        const q = control.distube.getQueue(g.id);
        const n = pls.save(g.id, me.userId, b.name, (q?.songs || []).map((s) => s.url).filter(Boolean));
        return json({ ok: true, count: n }), true;
      }
      if (p === '/api/playlists/play') {
        const urls = pls.load(g.id, me.userId, b.name);
        const ch = targetVoice(control, g);
        if (!ch) return json({ error: 'Join a voice channel first (or have the bot in one).' }, 409), true;
        const pl = await control.distube.createCustomPlaylist(urls, { parallel: true, name: b.name });
        await control.distube.play(ch, pl, { metadata: { listenBy: me.tag } });
        return json({ ok: true, count: pl.songs.length }), true;
      }
    } catch (e) { return json({ error: e.message }, 400), true; }
    return json({ error: 'Unknown playlist action' }, 404), true;
  }

  // ===== Radio =====
  if (p === '/api/radio/presets' && !post) {
    json({ presets: require('./radio').PRESETS });
    return true;
  }
  if (p === '/api/radio/search' && !post) {
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 80);
    if (!q) return json({ stations: [] }), true;
    try {
      const params = new URLSearchParams({ name: q, limit: '15', order: 'votes', reverse: 'true', hidebroken: 'true' });
      const r = await fetch(`https://de1.api.radio-browser.info/json/stations/search?${params}`, { headers: { 'User-Agent': 'MaowCore/1.0' }, signal: AbortSignal.timeout(8000) });
      const list = await r.json();
      json({ stations: (list || []).map((s) => ({ name: s.name, url: s.url_resolved || s.url, country: s.country, tags: (s.tags || '').split(',').slice(0, 3).join(', '), favicon: s.favicon || null, votes: s.votes })) });
    } catch (e) { json({ error: `Radio directory unreachable: ${e.message}` }, 502); }
    return true;
  }
  if (p === '/api/radio/play' && post) {
    const b = await body();
    const target = String(b.url || '');
    if (!/^https?:\/\//i.test(target)) return json({ error: 'Bad station link.' }, 400), true;
    const g = pickGuild(control, b.guildId);
    const ch = g ? targetVoice(control, g) : null;
    if (!ch) return json({ error: 'Join a voice channel first (or have the bot in one).' }, 409), true;
    try {
      await control.distube.play(ch, target, b.name ? { metadata: { localName: `📻 ${String(b.name).slice(0, 80)}` } } : {});
      json({ ok: true });
    } catch (e) { json({ error: e.message }, 500); }
    return true;
  }

  // ===== Mood mix + song radio =====
  if (p === '/api/mood/play' && post) {
    const b = await body();
    const moods = require('./moods');
    if (!moods.MOODS[b.mood]) return json({ error: 'Unknown mood.' }, 400), true;
    const g = pickGuild(control, b.guildId);
    const ch = g ? targetVoice(control, g) : null;
    if (!ch) return json({ error: 'Join a voice channel first (or have the bot in one).' }, 409), true;
    try {
      const plan = moods.forGuild(b.mood, g.id, { size: Number(b.size) || 8 });
      const tracks = await moods.resolve(control.client.youtubePlugin, plan);
      if (!tracks.length) return json({ error: 'No songs found for that mood right now.' }, 404), true;
      const pl = await control.distube.createCustomPlaylist(tracks.map((t) => t.url), { parallel: true, name: `${plan.mood.emoji} ${plan.mood.label} mix`, metadata: { quiet: true } });
      await control.distube.play(ch, pl, { metadata: { quiet: true } });
      json({ ok: true, count: pl.songs.length, label: plan.mood.label });
    } catch (e) { json({ error: e.message }, 500); }
    return true;
  }
  if (p === '/api/similar' && post) {
    const b = await body();
    const g = pickGuild(control, b.guildId);
    const q = g ? control.distube.getQueue(g.id) : null;
    if (!q) return json({ error: 'Nothing is playing.' }, 409), true;
    try { json({ ok: true, ...(await require('./song-radio').addSimilar(control.client, q, { count: Number(b.count) || 5 })) }); }
    catch (e) { json({ error: e.message }, 400); }
    return true;
  }

  // ===== Mod log + notes (panel → Moderation) =====
  if (p === '/api/mod/log' && !post) {
    const g = pickGuild(control, url.searchParams.get('guildId'));
    if (!g) return json({ entries: [] }), true;
    const modlog = require('./modlog');
    json({ guild: g.name, entries: modlog.list(g.id, { limit: url.searchParams.get('limit') || 100, action: url.searchParams.get('action') || null, targetId: url.searchParams.get('userId') || null }) });
    return true;
  }
  if (p === '/api/mod/notes' && !post) {
    const g = pickGuild(control, url.searchParams.get('guildId'));
    if (!g) return json({ notes: [] }), true;
    const all = require('./config').getGuild(g.id).modNotes || {};
    const out = Object.entries(all).map(([userId, list]) => ({ userId, name: control.client.users.cache.get(userId)?.username || userId, notes: list }));
    json({ notes: out });
    return true;
  }
  if (p === '/api/mod/warn-rules') {
    const tools = require('./mod-tools');
    const b = post ? await body() : {};
    const g = pickGuild(control, b.guildId || url.searchParams.get('guildId'));
    if (!g) return json({ error: 'No server.' }, 404), true;
    if (post) {
      try {
        const rules = b.text ? tools.parseRules(b.text) : tools.warnRules(g.id).rules;
        require('./config').updateGuild(g.id, { warnRules: { enabled: b.enabled !== false, rules } });
      } catch (e) { return json({ error: e.message }, 400), true; }
    }
    const r = tools.warnRules(g.id);
    json({ ...r, text: r.rules.map((x) => `${x.at}=${x.minutes % 1440 === 0 ? `${x.minutes / 1440}d` : x.minutes % 60 === 0 ? `${x.minutes / 60}h` : `${x.minutes}m`}`).join(', ') });
    return true;
  }

  // ===== Checklists (yours) =====
  if (p === '/api/checklists' && !post) {
    const me = whoAmI(req, control);
    const cl = require('./checklists');
    json({ today: cl.dayKey(), lists: cl.forUser(me.userId).map((l) => ({ ...l, today: cl.ticked(l), streak: cl.streak(l), done: undefined })) });
    return true;
  }
  if (p.startsWith('/api/checklists/') && post) {
    const me = whoAmI(req, control);
    const b = await body();
    const cl = require('./checklists');
    try {
      if (p === '/api/checklists/save') {
        let profile = null;
        if (b.profileId) { try { const pr = require('./profiles').list(me.userId).find((x) => x.id === b.profileId); if (pr) profile = { id: pr.id, name: pr.name, emoji: pr.emoji }; } catch { /* */ } }
        const l = b.id ? cl.update(me.userId, b.id, { name: b.name, items: b.items, at: b.at || null }) : cl.create({ userId: me.userId, name: b.name, items: b.items, at: b.at || null, profile });
        return json({ ok: true, list: { ...l, today: cl.ticked(l), streak: cl.streak(l), done: undefined } }), true;
      }
      if (p === '/api/checklists/delete') return json({ ok: cl.remove(me.userId, b.id) }), true;
      if (p === '/api/checklists/toggle') { const l = cl.toggle(me.userId, b.id, Number(b.idx)); return json({ ok: true, today: cl.ticked(l), streak: cl.streak(l) }), true; }
    } catch (e) { return json({ error: e.message }, 400), true; }
    return json({ error: 'Unknown checklist action' }, 404), true;
  }

  // ===== Routines =====
  if (p === '/api/routines' && !post) {
    const me = whoAmI(req, control);
    const rt = require('./routines');
    json({ routines: rt.list(me.userId), serverSteps: rt.SERVER_STEPS, panelSteps: rt.PANEL_STEPS });
    return true;
  }
  if (p.startsWith('/api/routines/') && post) {
    const me = whoAmI(req, control);
    const b = await body();
    const rt = require('./routines');
    try {
      if (p === '/api/routines/save') return json({ ok: true, routine: rt.saveRoutine(me.userId, b.routine || b) }), true;
      if (p === '/api/routines/delete') return json({ ok: rt.remove(me.userId, b.id) }), true;
      if (p === '/api/routines/run') {
        const r = rt.find(me.userId, b.id);
        if (!r) return json({ error: 'Routine not found.' }, 404), true;
        const g = pickGuild(control, b.guildId);
        const res = await rt.runServer(control.client, { guild: g, voice: g ? targetVoice(control, g) : null, userId: me.userId, routine: r });
        return json({ ok: true, ...res }), true;
      }
    } catch (e) { return json({ error: e.message }, 400), true; }
    return json({ error: 'Unknown routine action' }, 404), true;
  }

  // ===== Owner prefs: quiet hours =====
  if (p === '/api/owner-prefs' && !post) {
    const op = require('./owner-prefs');
    json({ ...op.get(), quietNow: op.isQuiet() });
    return true;
  }
  if (p === '/api/owner-prefs' && post) {
    if (!sameSite(req)) return json({ error: 'Blocked: request came from another site.' }, 403), true;
    try { const op = require('./owner-prefs'); json({ ok: true, ...op.update(await body()), quietNow: op.isQuiet() }); }
    catch (e) { json({ error: e.message }, 400); }
    return true;
  }

  // ===== Status posts channel =====
  if (p === '/api/status-channel' && !post) {
    const sm = require('./status-monitor');
    const channels = [];
    for (const g of control.client.guilds.cache.values()) {
      for (const c of g.channels.cache.values()) {
        if ((c.type === 0 || c.type === 5) && c.permissionsFor(g.members.me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
          channels.push({ id: c.id, name: `#${c.name}`, guild: g.name });
        }
      }
    }
    json({ ...sm.getSettings(), channels });
    return true;
  }
  if (p === '/api/status-channel' && post) {
    const b = await body();
    const sm = require('./status-monitor');
    const s = sm.setSettings({ channelId: b.channelId || null, ...('dmAlerts' in b ? { dmAlerts: b.dmAlerts } : {}) });
    if (b.test && s.channelId) await sm.testPost().catch(() => {});
    json({ ok: true, ...s });
    return true;
  }

  // ===== Backup cleanup now =====
  if (p === '/api/backup/tidy' && post) {
    json({ ok: true, ...require('./backup').tidy() });
    return true;
  }
  return false;
};

module.exports = { handle, whoAmI, pickGuild };
