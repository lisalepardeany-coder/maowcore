const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { WebSocketServer } = require('ws');
const { ChannelType } = require('discord.js');
const { getGuild, updateGuild } = require('./config');
const history = require('./history');
const favorites = require('./favorites');
const searchHistory = require('./search-history');
const undo = require('./undo');
const library = require('./library');
const { inviteUrl, resolveClientId } = require('./invite');
const { Diagnostics } = require('./diagnostics');

const STATE_TICK_MS = 2000;
const MAX_LOG_HISTORY = 300;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Allowlist of config keys the dashboard's `set_config` action is permitted to
// write. Anything else (playlists, favorites, ratings, automod, …) is rejected
// — those have dedicated, validated commands.
const ALLOWED_SET_CONFIG_KEYS = new Set([
  'stay247', 'sponsorblock', 'announce', 'crossfade',
  'hideRequester', 'idleMinutes', 'defaultLoopMode',
  'welcomeSoundUrl', 'leaveSoundUrl',
  'tone', 'locale',
]);

// Coerce + clamp a possibly-untrusted numeric input. Returns null on
// non-finite values so callers can bail rather than feeding NaN to DisTube.
const safeNum = (v, { min = -Infinity, max = Infinity } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  // Audio (library uploads)
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
};

class ControlServer {
  constructor({ port = 8765, host = '127.0.0.1', distube, client }) {
    this.distube = distube;
    this.client = client;
    this.port = port;
    this.host = host;
    this.logHistory = [];
    this.diagnostics = new Diagnostics();
    this._lastCpus = os.cpus();
    this._lastCpuSample = Date.now();
    this._startedAt = Date.now();

    this.httpServer = http.createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.httpServer.listen(port, host, () => {
      console.log(`[control] dashboard http://${host}:${port}/  ·  ws ws://${host}:${port}/`);
    });
    this.httpServer.on('error', (e) => console.warn('[control] http error:', e.message));

    this.wss.on('connection', (ws) => {
      this._sendInitial(ws);
      ws.on('message', (raw) => this.handleCommand(ws, raw));
    });
    this.wss.on('error', (e) => console.warn('[control] ws error:', e.message));

    this.hookDisTube();
    this._tickCount = 0;
    this.ticker = setInterval(async () => {
      if (this.wss.clients.size > 0) {
        // Include heavy server-channel data only every ~15s; queues/stats every tick
        const includeHeavy = (this._tickCount++ % 7) === 0;
        this.broadcast(await this.snapshot({ includeServers: includeHeavy }));
      }
    }, STATE_TICK_MS);

    // Accurate ping: client.ws.ping (gateway heartbeat) is frequently -1 on
    // discord.js v14 — at startup and whenever a heartbeat ack is pending —
    // which the UI used to render as a misleading "0 ms". We measure a real
    // REST round-trip to Discord's /gateway endpoint every 10s as a reliable
    // fallback. Cached so we don't hit the API on every 2s state tick.
    this._restPing = null;
    this._measureRestPing();
    this.pingTimer = setInterval(() => this._measureRestPing(), 10000);
    this.pingTimer.unref?.();
  }

  async _measureRestPing() {
    try {
      const start = Date.now();
      // /gateway is a lightweight, low-overhead endpoint (returns the gateway
      // URL). The round-trip time is a representative "is Discord reachable
      // and how fast" number.
      await this.client.rest.get('/gateway');
      this._restPing = Date.now() - start;
    } catch {
      /* keep the previous measurement on a transient failure */
    }
  }

  // ===== HTTP =====
  async handleHttp(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const urlPath0 = url.pathname;

    // ===== POST routes (uploads / mutations) =====
    if (req.method === 'POST') {
      if (urlPath0 === '/api/library/upload') return this._handleLibraryUpload(req, res);
      if (urlPath0 === '/api/library/delete') return this._handleLibraryDelete(req, res);
      if (urlPath0 === '/api/library/install') return this._handleLibraryInstall(req, res);
      // No other POST routes — fall through to 404.
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    // ===== Library: list + serve uploaded audio =====
    if (urlPath0 === '/api/library') {
      const songs = library.list();
      const totalBytes = songs.reduce((a, s) => a + (s.size || 0), 0);
      const totalSec = songs.reduce((a, s) => a + (s.durationSec || 0), 0);
      // Expose available install formats so the UI doesn't have to hardcode them.
      const formats = Object.fromEntries(
        Object.entries(library.INSTALL_FORMATS).map(([k, v]) => [k, { label: v.label, lossless: v.lossless }]),
      );
      return this._json(res, {
        songs,
        dir: library.LIB_DIR,
        totalBytes,
        totalSec,
        formats,
        ytDlpAvailable: require('node:fs').existsSync(library.YTDLP_PATH),
      });
    }
    if (urlPath0.startsWith('/library/')) {
      return this._serveLibraryFile(urlPath0, req, res);
    }
    if (urlPath0.startsWith('/sounds/')) {
      return this._serveSoundFile(urlPath0, req, res);
    }

    // API routes
    if (urlPath0 === '/health') {
      const stats = await this._collectStats();
      return this._json(res, {
        ok: true,
        botTag: this.client.user?.tag || null,
        uptime: stats.process.uptime,
        memRss: stats.process.rss,
        ping: this.client.ws.ping,
        activeQueues: this.distube.queues.collection.size,
      });
    }
    if (urlPath0 === '/api/invite') {
      // Returns the OAuth2 invite URL for this bot. Dashboard's Settings
      // page renders it as a copy/share button.
      const url = inviteUrl(resolveClientId(this.client));
      return this._json(res, { url, botTag: this.client.user?.tag || null });
    }
    if (urlPath0 === '/api/search') {
      try {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) return this._json(res, { results: [] });
        const results = await this.client.youtubePlugin.search(q, { limit: 10, type: 'video' });
        searchHistory.record(q, results.length);  // track search history for dashboard
        return this._json(res, {
          results: results.map((r) => ({
            name: r.name,
            url: r.url,
            duration: r.duration,
            thumbnail: r.thumbnail,
            uploader: r.uploader?.name || null,
          })),
        });
      } catch (e) {
        return this._json(res, { error: e.message }, 500);
      }
    }
    if (urlPath0 === '/api/history') {
      const guildId = url.searchParams.get('guildId') || this.client.guilds.cache.first()?.id;
      const entries = guildId ? history.list(guildId, 200) : [];
      return this._json(res, { entries });
    }
    if (urlPath0 === '/api/stats') {
      const guildId = url.searchParams.get('guildId') || this.client.guilds.cache.first()?.id;
      const range = url.searchParams.get('range') || 'all';
      if (!guildId) return this._json(res, { total: 0, topSongs: [], topArtists: [], plays24h: [] });
      const s = this._statsForRange(guildId, range);
      return this._json(res, s);
    }
    if (urlPath0 === '/api/searches') {
      return this._json(res, { entries: searchHistory.list(50) });
    }
    if (urlPath0 === '/api/favorites') {
      const guildId = url.searchParams.get('guildId') || this.client.guilds.cache.first()?.id;
      const userId = url.searchParams.get('userId');
      if (!guildId || !userId) return this._json(res, { entries: [] });
      return this._json(res, { entries: favorites.listFor(guildId, userId) });
    }
    if (urlPath0 === '/api/discovery') {
      const guildId = url.searchParams.get('guildId') || this.client.guilds.cache.first()?.id;
      if (!guildId) return this._json(res, { percent: 0 });
      return this._json(res, history.discoveryScore(guildId, 30));
    }
    if (urlPath0 === '/api/hiddengems') {
      const guildId = url.searchParams.get('guildId') || this.client.guilds.cache.first()?.id;
      if (!guildId) return this._json(res, { gems: [] });
      // Songs rated 4-5 stars BUT not played in 30+ days
      const ratingsLib = require('./ratings');
      const all = ratingsLib.topRated(guildId, 100).filter((r) => r.avg >= 4);
      const recentPlays = new Set(history.list(guildId, 500)
        .filter((e) => Date.now() - e.ts < 30 * 86400000)
        .map((e) => e.url));
      const gems = all.filter((r) => !recentPlays.has(r.url)).slice(0, 20);
      return this._json(res, { gems });
    }
    if (urlPath0 === '/api/topusers') {
      const guildId = url.searchParams.get('guildId') || this.client.guilds.cache.first()?.id;
      if (!guildId) return this._json(res, { users: [] });
      const list = history.list(guildId, 500);
      const byUser = new Map();
      list.forEach((e) => byUser.set(e.user || 'unknown', (byUser.get(e.user || 'unknown') || 0) + 1));
      const users = [...byUser.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));
      return this._json(res, { users });
    }

    // Static files
    let urlPath = urlPath0;
    if (urlPath === '/') urlPath = '/dashboard.html';
    const safe = path.normalize(urlPath).replace(/^([\\/])+/, '');
    const full = path.join(PUBLIC_DIR, safe);
    if (!full.startsWith(PUBLIC_DIR)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(full, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      const mime = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' }).end(data);
    });
  }

  _json(res, body, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(body));
  }

  // Build the self-referencing HTTP URL the bot uses to stream an uploaded
  // library file. Always 127.0.0.1 (the bot reaching its own server) even if
  // CONTROL_HOST is 0.0.0.0 for LAN access. yt-dlp resolves this fine; local
  // file PATHS do NOT work (yt-dlp reads "C:/" as an unsupported url scheme).
  _libraryUrl(file) {
    return `http://127.0.0.1:${this.port}/library/${encodeURIComponent(file)}`;
  }

  // Same self-referencing trick for soundboard files in data/sounds/. The /sb
  // command had the same local-path-doesn't-work bug; it now streams via this.
  _soundUrl(file) {
    return `http://127.0.0.1:${this.port}/sounds/${encodeURIComponent(file)}`;
  }

  // ===== Local library: upload / serve / delete =====
  // Upload accepts the raw file bytes as the request body (no multipart
  // parsing dependency). The client sends the original filename in the
  // X-Filename header. We buffer with a hard size cap to avoid OOM.
  _handleLibraryUpload(req, res) {
    const rawName = decodeURIComponent(req.headers['x-filename'] || 'upload');
    let target;
    try {
      target = library.createUploadTarget(rawName);
    } catch (e) {
      return this._json(res, { error: e.message }, 400);
    }

    // Stream straight to disk (with backpressure) instead of buffering the
    // whole — up to 500 MB — file in memory. Enforce the size cap as bytes
    // arrive and clean up the partial file on any failure.
    const ws = fs.createWriteStream(target.fullPath);
    let total = 0;
    let aborted = false;
    const fail = (status, msg) => {
      if (aborted) return;
      aborted = true;
      ws.destroy();
      try { fs.unlinkSync(target.fullPath); } catch { /* may not exist */ }
      this._json(res, { error: msg }, status);
    };

    req.on('data', (chunk) => {
      if (aborted) return;
      total += chunk.length;
      if (total > library.MAX_BYTES) {
        fail(413, `File too large (max ${library.MAX_BYTES / 1024 / 1024} MB).`);
        req.destroy();
        return;
      }
      if (!ws.write(chunk)) { req.pause(); ws.once('drain', () => req.resume()); }
    });
    req.on('end', () => { if (!aborted) ws.end(); });
    req.on('error', () => fail(500, 'Upload stream error'));
    ws.on('error', () => fail(500, 'Write failed'));
    ws.on('finish', () => {
      if (aborted) return;
      if (total === 0) {
        try { fs.unlinkSync(target.fullPath); } catch { /* ignore */ }
        return this._json(res, { error: 'Empty file.' }, 400);
      }
      const entry = library.commitUpload(target, total);
      this.log(`⬆ Uploaded to library: ${entry.name}`, 'info', 'upload',
        { subsystem: 'library', meta: { name: entry.name, ext: entry.ext, size: entry.size } });
      this._json(res, { ok: true, song: entry });
      // Probe duration in the background — fills in the manifest shortly after.
      library.probeAndStore(entry.id, target.fullPath);
    });
  }

  _handleLibraryInstall(req, res) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* */ }
      const url = String(body.url || '').trim();
      const format = String(body.format || 'original');
      if (!url || !/^https?:\/\//i.test(url)) {
        return this._json(res, { error: 'Invalid URL (must be http or https).' }, 400);
      }
      this.log(`⬇ Install requested: ${url} (${format})`, 'info', 'install',
        { subsystem: 'library', meta: { url, format } });
      // Stream live progress to ALL connected dashboards via the existing log
      // channel, so the operator sees it whatever page they're on.
      const onProgress = (line) => this.log(`  ${line.slice(0, 200)}`, 'info', 'install',
        { subsystem: 'ytdlp' });
      try {
        const { entry, alreadyInstalled } = await library.installFromUrl(url, { format, onProgress });
        this.log(alreadyInstalled
          ? `↩ Already installed: ${entry.name}`
          : `✓ Installed: ${entry.name} (${entry.ext}, ${(entry.size / 1024 / 1024).toFixed(1)} MB)`,
          'info', 'install',
          { subsystem: 'library', meta: { name: entry.name, ext: entry.ext, size: entry.size, alreadyInstalled } });
        return this._json(res, { ok: true, entry, alreadyInstalled });
      } catch (e) {
        this.log(`✕ Install failed: ${e.message}`, 'error', 'install',
          { subsystem: 'ytdlp', meta: { url, format, error: e.message } });
        return this._json(res, { error: e.message }, 500);
      }
    });
  }

  _handleLibraryDelete(req, res) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* ignore */ }
      const ok = library.remove(String(body.id || ''));
      this._json(res, { ok });
    });
  }

  // Stream a file from disk with HTTP Range support. Shared by the library
  // and soundboard routes. Hardened:
  //   - clamps an over-large/open range `end` to the last byte (instead of
  //     416-rejecting or sending a wrong Content-Length that hangs the client)
  //   - attaches an 'error' handler so a mid-stream read error can't crash the
  //     process (no global uncaughtException handler would catch it otherwise)
  //   - destroys the read stream if the client disconnects (yt-dlp aborting a
  //     range request, a skip, etc.) so we don't keep reading a dead socket
  _streamFile(full, req, res) {
    let stat;
    try { stat = fs.statSync(full); } catch { res.writeHead(404).end('Not found'); return; }
    const mime = MIME[path.extname(full).toLowerCase()] || 'audio/mpeg';
    const range = req.headers.range;

    let stream;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      end = Math.min(end, stat.size - 1);  // clamp over-large ends
      if (!Number.isFinite(start) || start < 0 || start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': mime,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      stream = fs.createReadStream(full, { start, end });
    } else {
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
      stream = fs.createReadStream(full);
    }
    stream.on('error', (e) => {
      console.warn('[control] file stream error:', e.message);
      res.destroy();
    });
    res.on('close', () => stream.destroy());  // client went away — stop reading
    stream.pipe(res);
  }

  // Serve an uploaded library file. Path-traversal-safe: only files whose
  // basename exists in the manifest are served.
  _serveLibraryFile(urlPath, req, res) {
    const file = path.basename(decodeURIComponent(urlPath.slice('/library/'.length)));
    const entry = library.list().find((s) => s.file === file);
    if (!entry) { res.writeHead(404).end('Not found'); return; }
    this._streamFile(path.join(library.LIB_DIR, entry.file), req, res);
  }

  // Serve a soundboard file from data/sounds/. Path-traversal-safe via
  // basename + the startsWith(SOUND_DIR) check.
  _serveSoundFile(urlPath, req, res) {
    const SOUND_DIR = path.join(__dirname, '..', 'data', 'sounds');
    const file = path.basename(decodeURIComponent(urlPath.slice('/sounds/'.length)));
    const full = path.join(SOUND_DIR, file);
    if (!full.startsWith(SOUND_DIR)) { res.writeHead(403).end('Forbidden'); return; }
    this._streamFile(full, req, res);
  }

  // ===== WebSocket I/O =====
  broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const ws of this.wss.clients) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  send(ws, payload) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  }

  async _sendInitial(ws) {
    this.send(ws, { type: 'hello', botTag: this.client.user?.tag || null, ts: Date.now() });
    this.send(ws, { type: 'log_history', entries: this.logHistory });
    this.send(ws, { type: 'diagnostics', payload: this.diagnostics.snapshot() });
    this.send(ws, await this.snapshot());
  }

  // log(text, level, category, opts)
  //  - level: 'info' | 'warn' | 'error' | 'success'
  //  - category: one of the CATEGORIES in diagnostics.js (defaults derived
  //    heuristically from text/prefix so old callers Just Work)
  //  - opts.subsystem: which subsystem this maps to for health derivation
  //  - opts.meta: free-form structured metadata the UI can show on hover
  log(text, level = 'info', category = null, opts = {}) {
    if (!category) category = this._guessCategory(text, level);
    const entry = {
      type: 'log', text, level, ts: Date.now(),
      category,
      subsystem: opts.subsystem || null,
      meta: opts.meta || null,
    };
    this.logHistory.push(entry);
    if (this.logHistory.length > MAX_LOG_HISTORY) this.logHistory.shift();
    this.diagnostics.record(entry);
    this.broadcast(entry);
  }

  // Best-effort category fallback for legacy `log(text, level)` callers.
  // Keeps the dashboard's filter chips meaningful without forcing a sweep of
  // every call site at once.
  _guessCategory(text, level) {
    const s = String(text || '');
    if (/^GUI · /.test(s) || /WS /.test(s) || /websocket/i.test(s)) return 'ws';
    if (/^\/[\w-]+ /.test(s) || /command/i.test(s)) return 'command';
    if (/playing|queued|playlist|queue finished|skip/i.test(s)) return 'play';
    if (/voice|deserted|disconnected from voice/i.test(s)) return 'voice';
    if (/uploaded|upload/i.test(s) && /librar|song/i.test(s)) return 'upload';
    if (/install/i.test(s)) return 'install';
    if (/librar|favorite/i.test(s)) return 'library';
    if (/search|yt-dlp|yt_dlp/i.test(s)) return 'search';
    if (/login|ready|guild|shard|discord/i.test(s)) return 'discord';
    if (level === 'error') return 'system';
    return 'system';
  }

  // ===== Snapshots =====
  async snapshot({ includeServers = true } = {}) {
    const payload = {
      type: 'state',
      ts: Date.now(),
      queues: this._collectQueues(),
      ping: this._collectPing(),
      stats: await this._collectStats(),
      configs: this._collectConfigs(),
      diagnostics: this.diagnostics.snapshot(),
    };
    // Server channel-list is heavy (members, voice channels, categories).
    // Only include it on initial connect, command responses, and every ~15s.
    if (includeServers) payload.servers = this._collectServers();
    return payload;
  }

  _collectQueues() {
    const out = [];
    for (const [id, queue] of this.distube.queues.collection) {
      const song = queue.songs[0];
      const guild = this.client.guilds.cache.get(id);
      const hideRequester = !!getGuild(id).hideRequester;
      out.push({
        guildId: id,
        guildName: guild?.name || 'Unknown',
        voiceChannelName: queue.voice?.channel?.name || null,
        currentSong: song
          ? {
              name: song.name,
              url: song.url,
              duration: song.duration,
              formattedDuration: song.formattedDuration,
              currentTime: queue.currentTime || 0,
              thumbnail: song.thumbnail || null,
              user: hideRequester
                ? 'anonymous'
                : (song.user?.displayName || song.user?.username || song.user?.tag || 'unknown'),
              features: song.features || null,
              dedication: song.dedication || null,
            }
          : null,
        upcoming: queue.songs.slice(1, 30).map((s) => ({
          name: s.name,
          formattedDuration: s.formattedDuration,
        })),
        volume: queue.volume,
        repeatMode: queue.repeatMode,
        paused: queue.paused,
        filters: queue.filters?.names || [],
        autoplay: !!queue.autoplay,
      });
    }
    return out;
  }

  _collectPing() {
    const heartbeat = this.client.ws.ping;  // gateway heartbeat; -1 when unknown
    // `websocket` is what the UI displays — use the real heartbeat when it's a
    // valid positive number, otherwise fall back to the measured REST ping so
    // the dashboard never shows a misleading "0 ms".
    const websocket = (typeof heartbeat === 'number' && heartbeat > 0)
      ? heartbeat
      : (this._restPing ?? null);
    return {
      websocket,                 // best accurate value for display
      heartbeat,                 // raw gateway heartbeat (may be -1) — diagnostics
      rest: this._restPing,      // measured REST round-trip — diagnostics
      uptime: process.uptime(),
      readyAt: this.client.readyTimestamp,
    };
  }

  async _collectStats() {
    // CPU% (system-wide, delta from last sample)
    const cpusNow = os.cpus();
    let idleD = 0, totalD = 0;
    for (let i = 0; i < cpusNow.length; i++) {
      const a = this._lastCpus[i]?.times || cpusNow[i].times;
      const b = cpusNow[i].times;
      const idle = b.idle - a.idle;
      const total = Object.values(b).reduce((x, y) => x + y, 0) -
                    Object.values(a).reduce((x, y) => x + y, 0);
      idleD += idle;
      totalD += total;
    }
    const cpuPct = totalD > 0 ? Math.max(0, 100 - (100 * idleD) / totalD) : 0;
    this._lastCpus = cpusNow;

    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsed = memTotal - memFree;
    const procMem = process.memoryUsage();

    let disk = null;
    try {
      const s = await fsp.statfs(process.cwd());
      disk = {
        total: Number(s.bsize) * Number(s.blocks),
        free: Number(s.bsize) * Number(s.bfree),
        available: Number(s.bsize) * Number(s.bavail),
      };
    } catch { /* statfs unsupported on this platform */ }

    // Event-loop lag (microseconds) — measures how delayed timers are
    const elStart = process.hrtime.bigint();
    await new Promise((r) => setImmediate(r));
    const eventLoopLagMs = Number(process.hrtime.bigint() - elStart) / 1_000_000;

    return {
      process: {
        uptime: process.uptime(),
        rss: procMem.rss,
        heapUsed: procMem.heapUsed,
        heapTotal: procMem.heapTotal,
        external: procMem.external,
        arrayBuffers: procMem.arrayBuffers,
        nodeVersion: process.version,
        pid: process.pid,
        ppid: process.ppid,
        cwd: process.cwd(),
        eventLoopLagMs,
      },
      discord: {
        guilds: this.client.guilds.cache.size,
        users: this.client.users.cache.size,
        channels: this.client.channels.cache.size,
        voiceConnections: this.distube.voices.collection.size,
        activeQueues: this.distube.queues.collection.size,
        wsStatus: this.client.ws.status,
        gatewayShards: this.client.ws.shards?.size || 0,
      },
      system: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptime: os.uptime(),
        cpus: cpusNow.length,
        cpuModel: cpusNow[0]?.model || 'unknown',
        cpuSpeedMHz: cpusNow[0]?.speed || 0,
        cpuPct,
        memTotal,
        memUsed,
        memFree,
        loadavg: os.loadavg(),
      },
      disk,
    };
  }

  _statsForRange(guildId, range) {
    // Reuse history.list to get all entries, then filter by timestamp range
    const all = history.list(guildId, 5000);
    const now = Date.now();
    const cutoffs = {
      today: now - 24 * 60 * 60 * 1000,
      week: now - 7 * 24 * 60 * 60 * 1000,
      month: now - 30 * 24 * 60 * 60 * 1000,
      all: 0,
    };
    const cutoff = cutoffs[range] ?? 0;
    const filtered = all.filter((e) => e.ts >= cutoff);
    const byName = new Map();
    const byArtist = new Map();
    const byHour = new Array(24).fill(0);
    let totalSec = 0;
    for (const e of filtered) {
      byName.set(e.name, (byName.get(e.name) || 0) + 1);
      if (e.artist) byArtist.set(e.artist, (byArtist.get(e.artist) || 0) + 1);
      byHour[new Date(e.ts).getHours()]++;
      totalSec += e.duration || 0;
    }
    const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, count: v }));
    return {
      total: filtered.length,
      totalListeningSec: totalSec,
      topSongs: top(byName, 10),
      topArtists: top(byArtist, 10),
      plays24h: byHour,
      range,
    };
  }

  _collectServers() {
    return this.client.guilds.cache.map((g) => {
      const channels = [...g.channels.cache.values()].map((c) => {
        const base = { id: c.id, name: c.name, type: c.type, parentId: c.parentId || null };
        if (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) {
          base.members = [...(c.members?.values() || [])].map((m) => ({
            id: m.id,
            name: m.displayName || m.user?.username,
            bot: !!m.user?.bot,
          }));
          base.userLimit = c.userLimit || 0;
          base.bitrate = c.bitrate || 0;
        }
        return base;
      });
      return {
        id: g.id,
        name: g.name,
        iconURL: g.iconURL?.({ size: 128 }) || null,
        memberCount: g.memberCount,
        ownerId: g.ownerId,
        channels,
      };
    });
  }

  _collectConfigs() {
    const out = {};
    for (const g of this.client.guilds.cache.values()) {
      const cfg = getGuild(g.id);
      const queue = this.distube.getQueue(g.id);
      out[g.id] = {
        stay247: !!cfg.stay247,
        sponsorblock: !!cfg.sponsorblock,
        volume: cfg.volume ?? (queue?.volume ?? 100),
        autoplay: !!queue?.autoplay,
        activeQueue: !!queue,
        idleMinutes: cfg.idleMinutes ?? 5,
        defaultLoopMode: cfg.defaultLoopMode ?? 0,
        hideRequester: !!cfg.hideRequester,
        announce: !!cfg.announce,
        crossfade: !!cfg.crossfade,
        welcomeSoundUrl: cfg.welcomeSoundUrl || '',
        leaveSoundUrl: cfg.leaveSoundUrl || '',
        quickPlaylists: Array.isArray(cfg.quickPlaylists) ? cfg.quickPlaylists : [null, null, null, null],
      };
    }
    return out;
  }

  // ===== DisTube events =====
  hookDisTube() {
    const meta = (q, s) => ({ guild: q?.id, song: s?.name, url: s?.url, source: s?.source });
    this.distube
      .on('playSong', (q, s) => this.log(`▶ Playing: ${s.name}`, 'info', 'play',
        { subsystem: 'distube', meta: meta(q, s) }))
      .on('addSong', (q, s) => this.log(`+ Queued: ${s.name}`, 'info', 'play',
        { subsystem: 'distube', meta: meta(q, s) }))
      .on('addList', (q, p) => this.log(`+ Playlist: ${p.name} (${p.songs.length} songs)`, 'info', 'play',
        { subsystem: 'distube', meta: { playlist: p.name, songs: p.songs.length } }))
      .on('finish', (q) => this.log('◇ Queue finished', 'info', 'play',
        { subsystem: 'distube', meta: { guild: q?.id } }))
      .on('disconnect', (q) => this.log('⌬ Disconnected from voice', 'info', 'voice',
        { subsystem: 'voice', meta: { guild: q?.id } }))
      .on('empty', (q) => this.log('◌ Voice channel deserted', 'warn', 'voice',
        { subsystem: 'voice', meta: { guild: q?.id } }))
      // DisTube emits 'error' with (channel, error) — log it with the stack
      // so the operator can see what actually broke (yt-dlp, ffmpeg, voice).
      .on('error', (channel, err) => this.log(
        `▲ DisTube error: ${err?.message || err}`, 'error', 'play',
        { subsystem: 'distube', meta: { channel: channel?.id, stack: err?.stack } }))
      .on('initQueue', (q) => this.log(`◐ Voice session started in ${q?.voice?.channel?.name || 'voice'}`, 'info', 'voice',
        { subsystem: 'voice', meta: { guild: q?.id, channel: q?.voice?.channel?.name } }));
  }

  // ===== Commands from dashboard =====
  resolveGuildId(msg) {
    if (msg.guildId) return msg.guildId;
    const first = this.distube.queues.collection.keys().next();
    if (!first.done) return first.value;
    return this.client.guilds.cache.first()?.id || null;
  }

  async handleCommand(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type !== 'cmd') return;

    const guildId = this.resolveGuildId(msg);
    const queue = guildId ? this.distube.getQueue(guildId) : null;

    try {
      switch (msg.action) {
        case 'play': {
          const voice = guildId ? this.distube.voices.get(guildId) : null;
          if (!voice?.channel) {
            this.log('GUI play failed — bot is not in a voice channel. Use /play in Discord to start a session.', 'error');
            return;
          }
          await this.distube.play(voice.channel, String(msg.query || ''));
          break;
        }
        case 'pause': if (queue && !queue.paused) queue.pause(); break;
        case 'resume': if (queue?.paused) queue.resume(); break;
        case 'skip':
          if (queue) {
            try { await queue.skip(); } catch { queue.stop(); }
          }
          break;
        case 'stop': if (queue) queue.stop(); break;
        case 'shuffle': if (queue) await queue.shuffle(); break;
        case 'loop': {
          const mode = safeNum(msg.value, { min: 0, max: 2 });
          if (queue && mode != null) queue.setRepeatMode(Math.floor(mode));
          break;
        }
        case 'volume': {
          const vol = safeNum(msg.value, { min: 0, max: 150 });
          if (vol == null) break;
          if (queue) queue.setVolume(vol);
          if (guildId) updateGuild(guildId, { volume: vol });
          break;
        }
        case 'seek': {
          const pos = safeNum(msg.value, { min: 0 });
          if (queue && pos != null) await queue.seek(pos);
          break;
        }
        case 'leave':
          if (queue) queue.stop();
          if (guildId) this.distube.voices.get(guildId)?.leave();
          break;
        case 'filter_add': if (queue) queue.filters.add(String(msg.value)); break;
        case 'filter_remove': if (queue) queue.filters.remove(String(msg.value)); break;
        case 'filter_clear': if (queue) queue.filters.clear(); break;
        case 'queue_move': {
          if (!queue) break;
          // safeNum returns null on NaN so we don't end up with splice(0, 1)
          // accidentally yanking the currently-playing song.
          const fromN = safeNum(msg.from, { min: 1, max: queue.songs.length - 1 });
          const toN = safeNum(msg.to, { min: 1, max: queue.songs.length - 1 });
          if (fromN == null || toN == null) break;
          const from = Math.floor(fromN);
          const to = Math.floor(toN);
          if (from === to) break;
          const [moved] = queue.songs.splice(from, 1);
          queue.songs.splice(to, 0, moved);
          break;
        }
        case 'toggle_247':
          if (guildId) updateGuild(guildId, { stay247: !getGuild(guildId).stay247 });
          break;
        case 'toggle_sponsorblock':
          if (guildId) updateGuild(guildId, { sponsorblock: !getGuild(guildId).sponsorblock });
          break;
        case 'toggle_autoplay':
          if (queue) {
            const next = !queue.autoplay;
            if (typeof queue.toggleAutoplay === 'function') queue.toggleAutoplay(next);
            else queue.autoplay = next;
          }
          break;
        case 'set_config':
          // Only allow writes to keys on the dashboard allowlist — see top of
          // file. Rejects attempts to write playlists, favorites, ratings,
          // automod config, etc. via the generic `set_config` action.
          if (guildId && msg.key && ALLOWED_SET_CONFIG_KEYS.has(String(msg.key))) {
            updateGuild(guildId, { [msg.key]: msg.value });
          } else if (msg.key) {
            this.log(`Rejected set_config for disallowed key "${msg.key}"`, 'warn');
          }
          break;
        case 'console':
          await this.runConsoleLine(String(msg.line || ''), guildId);
          break;
        case 'favorite_add': {
          if (!queue?.songs?.[0]) break;
          const userId = msg.userId || 'dashboard';
          favorites.add(guildId, userId, queue.songs[0]);
          this.log(`★ Favorited "${queue.songs[0].name}"`);
          break;
        }
        case 'favorite_remove': {
          const userId = msg.userId || 'dashboard';
          if (msg.url) favorites.remove(guildId, userId, String(msg.url));
          break;
        }
        case 'quick_play': {
          const slots = getGuild(guildId).quickPlaylists || [];
          const slot = slots[Number(msg.slot)];
          if (!slot?.url) { this.log('Quick playlist slot is empty.', 'warn'); break; }
          const voice = this.distube.voices.get(guildId);
          if (!voice?.channel) {
            this.log('Quick play failed — bot is not in a voice channel. Use /play first.', 'error');
            break;
          }
          await this.distube.play(voice.channel, slot.url);
          this.log(`⚡ Quick-played: ${slot.label}`);
          break;
        }
        case 'undo': {
          const snap = undo.get(guildId);
          if (!snap?.songs?.length) { this.log('Nothing to undo.', 'warn'); break; }
          const voice = this.distube.voices.get(guildId);
          if (!voice?.channel) { this.log('Cannot undo — bot left voice.', 'error'); break; }
          let added = 0;
          for (const song of snap.songs) {
            try { await this.distube.play(voice.channel, song.url); added++; } catch { /* skip */ }
          }
          undo.clear(guildId);
          this.log(`↶ Undo restored ${added} songs.`);
          break;
        }
        case 'library_play':
        case 'library_queue': {
          // Play (or queue) an uploaded library song. We stream it over the
          // control server's own HTTP endpoint — yt-dlp resolves http(s) URLs
          // but NOT local file paths. The bot must already be in voice.
          const entry = library.get(String(msg.id || ''));
          if (!entry || !library.getPath(entry.id)) {
            this.log('Library song not found (file missing?).', 'error'); break;
          }
          const voice = this.distube.voices.get(guildId);
          if (!voice?.channel) {
            this.log('Library play failed — bot is not in a voice channel. Use /play in Discord first.', 'error');
            break;
          }
          const fileUrl = this._libraryUrl(entry.file);
          const playNow = msg.action === 'library_play';
          const hadActive = !!this.distube.getQueue(guildId)?.songs?.length;
          // position 1 = insert as next song (play-now); 0 = append to end.
          await this.distube.play(voice.channel, fileUrl, {
            position: playNow ? 1 : 0,
            metadata: { localName: entry.name, durationSec: entry.durationSec },
          });
          // Play-now: if something was already playing, skip to the inserted one.
          if (playNow && hadActive) {
            try { await this.distube.getQueue(guildId)?.skip(); } catch { /* ignored */ }
          }
          this.log(`♫ Library ${playNow ? 'play' : 'queue'}: ${entry.name}`);
          break;
        }
        default: this.log(`Unknown GUI command: ${msg.action}`, 'warn'); return;
      }
      const detail = msg.value !== undefined ? ` ${msg.value}` : msg.query ? ` "${msg.query}"` : '';
      if (msg.action !== 'console') this.log(`GUI · ${msg.action}${detail}`);
      this.broadcast(await this.snapshot());
    } catch (err) {
      this.log(`GUI command failed: ${err.message || err}`, 'error');
    }
  }

  async runConsoleLine(line, guildId) {
    line = line.trim();
    if (!line) return;
    this.log(`> ${line}`, 'info');
    let [head, ...rest] = line.replace(/^\//, '').split(/\s+/);
    // Alias resolution — admin-configured shortcuts (e.g. "bops" → "play lofi")
    if (guildId) {
      const aliases = getGuild(guildId)?.aliases || {};
      const expansion = aliases[head.toLowerCase()];
      if (expansion) {
        const [newHead, ...newRest] = expansion.trim().split(/\s+/);
        head = newHead;
        rest = [...newRest, ...rest];  // append any trailing user args to the alias expansion
      }
    }
    const cmd = head.toLowerCase();
    const arg = rest.join(' ');

    const send = (action, extra = {}) => this.handleCommand(null, JSON.stringify({ type: 'cmd', action, guildId, ...extra }));

    switch (cmd) {
      case 'play': return send('play', { query: arg });
      case 'pause': return send('pause');
      case 'resume': return send('resume');
      case 'skip': return send('skip');
      case 'stop': return send('stop');
      case 'shuffle': return send('shuffle');
      case 'leave': return send('leave');
      case 'volume': return send('volume', { value: Number(arg) });
      case 'seek': return send('seek', { value: Number(arg) });
      case 'loop': {
        const mode = arg === 'off' ? 0 : arg === 'signal' || arg === 'song' ? 1 : arg === 'queue' ? 2 : Number(arg) || 0;
        return send('loop', { value: mode });
      }
      case 'autoplay': return send('toggle_autoplay');
      case '247': return send('toggle_247');
      case 'sponsorblock': return send('toggle_sponsorblock');
      case 'filter': {
        const [sub, name] = arg.split(/\s+/);
        if (sub === 'add') return send('filter_add', { value: name });
        if (sub === 'remove') return send('filter_remove', { value: name });
        if (sub === 'clear') return send('filter_clear');
        return this.log('filter usage: filter add|remove <name>, filter clear', 'warn');
      }
      case 'clear':
        this.logHistory = [];
        this.broadcast({ type: 'log_clear' });
        return;
      case 'help':
        return this.log(
          'Commands: play <q>, pause, resume, skip, stop, shuffle, leave, volume <0-150>, seek <s>, loop off|signal|queue, autoplay, 247, sponsorblock, filter add|remove|clear <name>, clear, help',
          'info',
        );
      default:
        return this.log(`Unknown console command: ${cmd}`, 'warn');
    }
  }
}

module.exports = { ControlServer };
