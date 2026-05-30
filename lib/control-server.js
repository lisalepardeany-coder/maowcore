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
    // Playlist-install background job registry. Keys: jobId. Trimmed to the
    // last 20 finished jobs so the dashboard can show recent history without
    // bloating memory.
    this.installJobs = new Map();
    this._jobIdCounter = 0;
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

    // Auto-subscribed playlist scheduler — polls subscribed playlist URLs on
    // each entry's configured interval and installs new tracks.
    try {
      const subs = require('./playlist-subscriptions');
      const library = require('./library');
      this._stopSubScheduler = subs.startScheduler(library, {
        onLog: (text, level) => this.log(text, level, 'install', { subsystem: 'library' }),
      });
    } catch (e) {
      console.warn('[control] could not start playlist-subscription scheduler:', e.message);
    }
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
      if (urlPath0 === '/api/library/install-playlist') return this._handleLibraryInstallPlaylist(req, res);
      if (urlPath0 === '/api/library/probe-playlist') return this._handleLibraryProbePlaylist(req, res);
      if (urlPath0 === '/api/library/config') return this._handleLibraryConfigSet(req, res);
      // /api/library/install-jobs/:id/cancel
      const cancelMatch = urlPath0.match(/^\/api\/library\/install-jobs\/([^/]+)\/cancel$/);
      if (cancelMatch) return this._handleLibraryJobCancel(req, res, cancelMatch[1]);

      // ===== Moderation =====
      if (urlPath0 === '/api/mod/ban') return this._handleModBan(req, res);
      if (urlPath0 === '/api/mod/unban') return this._handleModUnban(req, res);
      if (urlPath0 === '/api/mod/kick') return this._handleModKick(req, res);
      if (urlPath0 === '/api/mod/timeout') return this._handleModTimeout(req, res);
      if (urlPath0 === '/api/mod/warn-clear') return this._handleModWarnClear(req, res);
      if (urlPath0 === '/api/mod/automod') return this._handleModAutomodSet(req, res);
      if (urlPath0 === '/api/admin/channel-edit') return this._handleAdminChannelEdit(req, res);
      if (urlPath0 === '/api/admin/role-create') return this._handleAdminRoleCreate(req, res);
      if (urlPath0 === '/api/admin/role-edit') return this._handleAdminRoleEdit(req, res);
      if (urlPath0 === '/api/admin/role-delete') return this._handleAdminRoleDelete(req, res);
      if (urlPath0 === '/api/admin/speedtest') return this._handleAdminSpeedtest(req, res);
      if (urlPath0 === '/api/admin/welcome') return this._handleAdminWelcomeSet(req, res);
      if (urlPath0 === '/api/admin/reaction-roles/delete') return this._handleAdminReactionRoleDelete(req, res);
      if (urlPath0 === '/api/admin/reaction-roles/create') return this._handleAdminReactionRoleCreate(req, res);
      if (urlPath0 === '/api/admin/playlist-subs/add') return this._handleAdminPlaylistSubAdd(req, res);
      if (urlPath0 === '/api/admin/playlist-subs/update') return this._handleAdminPlaylistSubUpdate(req, res);
      if (urlPath0 === '/api/admin/playlist-subs/remove') return this._handleAdminPlaylistSubRemove(req, res);
      if (urlPath0 === '/api/admin/playlist-subs/sync') return this._handleAdminPlaylistSubSync(req, res);

      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    // ===== Library: list + serve uploaded audio =====
    if (urlPath0 === '/api/library/config') {
      return this._json(res, library.loadConfig());
    }
    if (urlPath0 === '/api/library/install-jobs') {
      return this._json(res, { jobs: this._snapshotInstallJobs() });
    }
    if (urlPath0 === '/api/mod/bans') return this._handleModBansList(req, res, url);
    if (urlPath0 === '/api/mod/warns') return this._handleModWarnsList(req, res, url);
    if (urlPath0 === '/api/mod/automod') return this._handleModAutomodGet(req, res, url);
    if (urlPath0 === '/api/mod/audit') return this._handleModAuditList(req, res, url);
    if (urlPath0 === '/api/admin/members') return this._handleAdminMembers(req, res, url);
    if (urlPath0 === '/api/admin/channels') return this._handleAdminChannels(req, res, url);
    if (urlPath0 === '/api/admin/roles') return this._handleAdminRoles(req, res, url);
    if (urlPath0 === '/api/admin/speedtest') return this._handleAdminSpeedtest(req, res, url);
    if (urlPath0 === '/api/mod/modlog-config') return this._handleModModlogConfig(req, res, url);

    // v1.9.0 — welcome / reaction roles / playlist subs / heatmap
    if (urlPath0 === '/api/admin/welcome') return this._handleAdminWelcomeGet(req, res, url);
    if (urlPath0 === '/api/admin/reaction-roles') return this._handleAdminReactionRolesGet(req, res, url);
    if (urlPath0 === '/api/admin/playlist-subs') return this._handleAdminPlaylistSubsGet(req, res, url);
    if (urlPath0 === '/api/admin/heatmap') return this._handleAdminHeatmap(req, res, url);
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

  // ===== Playlist install — background job manager =====

  _readJsonBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
        catch { resolve({}); }
      });
    });
  }

  // Probe a URL without starting a download — used by the dashboard to show
  // "47 songs detected — install all?" before committing.
  async _handleLibraryProbePlaylist(req, res) {
    const body = await this._readJsonBody(req);
    const url = String(body.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return this._json(res, { error: 'Invalid URL.' }, 400);
    }
    try {
      const meta = await library.probePlaylist(url);
      return this._json(res, {
        ok: true,
        playlistName: meta.playlistName,
        count: meta.entries.length,
        sample: meta.entries.slice(0, 5).map((e) => e.title),
      });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleLibraryInstallPlaylist(req, res) {
    const body = await this._readJsonBody(req);
    const url = String(body.url || '').trim();
    const format = String(body.format || 'original');
    const concurrency = Number(body.concurrency) || undefined;
    const limitRate = body.limitRate === undefined ? undefined : body.limitRate;
    if (!url || !/^https?:\/\//i.test(url)) {
      return this._json(res, { error: 'Invalid URL.' }, 400);
    }

    const jobId = `pl-${Date.now().toString(36)}-${(++this._jobIdCounter)}`;
    const abort = new AbortController();
    const job = {
      id: jobId,
      url,
      format,
      concurrency: concurrency || library.loadConfig().concurrency,
      limitRate: limitRate === undefined ? library.loadConfig().limitRate : limitRate,
      status: 'running',
      playlistName: null,
      total: 0,
      done: 0,
      failed: 0,
      skipped: 0,
      currentTitles: [],   // titles currently in flight (one per worker)
      startedAt: Date.now(),
      finishedAt: null,
      _abort: abort,
    };
    this.installJobs.set(jobId, job);
    this._broadcastJobUpdate(job);
    this.log(`⬇ Playlist install queued: ${url} (${format}, ${job.concurrency}x${job.limitRate || 'unlimited'})`,
      'info', 'install', { subsystem: 'library', meta: { jobId, url, format } });

    // Reply immediately with the jobId — the actual work runs in the
    // background and streams updates via WebSocket.
    this._json(res, { ok: true, jobId });

    const onItem = (ev) => {
      if (ev.phase === 'start') {
        if (!job.currentTitles.includes(ev.title)) job.currentTitles.push(ev.title);
      } else {
        const idx = job.currentTitles.indexOf(ev.title);
        if (idx >= 0) job.currentTitles.splice(idx, 1);
        if (ev.phase === 'done') job.done++;
        else if (ev.phase === 'skip') job.skipped++;
        else if (ev.phase === 'fail') job.failed++;
      }
      this._broadcastJobUpdate(job);
    };

    // Run the install in the background; the response was already sent.
    library.installPlaylistFromUrl(url, {
      format,
      concurrency: job.concurrency,
      limitRate: job.limitRate,
      signal: abort.signal,
      onItem,
      onProgress: (line) => {
        // Try to extract playlist meta from the first progress line.
        const m = line.match(/Playlist: "(.+)" — (\d+) entries/);
        if (m) {
          job.playlistName = m[1];
          job.total = Number(m[2]);
          this._broadcastJobUpdate(job);
        }
      },
    }).then((result) => {
      job.status = result.cancelled ? 'cancelled' : 'done';
      job.playlistName = result.playlistName || job.playlistName;
      job.finishedAt = Date.now();
      job.currentTitles = [];
      this._broadcastJobUpdate(job);
      this._reapInstallJobs();
      this.log(
        `${result.cancelled ? '⊘' : '✓'} Playlist ${result.cancelled ? 'cancelled' : 'install done'}: ` +
        `${job.playlistName || job.url} (${job.done} installed, ${job.skipped} skipped, ${job.failed} failed)`,
        result.cancelled ? 'warn' : 'success', 'install',
        { subsystem: 'library', meta: { jobId, ...result } });
    }).catch((e) => {
      job.status = 'failed';
      job.finishedAt = Date.now();
      job.error = e.message;
      job.currentTitles = [];
      this._broadcastJobUpdate(job);
      this._reapInstallJobs();
      this.log(`✕ Playlist install failed: ${e.message}`, 'error', 'install',
        { subsystem: 'ytdlp', meta: { jobId, url, error: e.message } });
    });
  }

  _handleLibraryJobCancel(req, res, jobId) {
    const job = this.installJobs.get(jobId);
    if (!job) return this._json(res, { error: 'Job not found.' }, 404);
    if (job.status !== 'running') return this._json(res, { ok: true, alreadyStopped: true });
    try { job._abort.abort(); } catch { /* ignore */ }
    job.status = 'cancelling';
    this._broadcastJobUpdate(job);
    this._json(res, { ok: true });
  }

  async _handleLibraryConfigSet(req, res) {
    const body = await this._readJsonBody(req);
    try {
      const next = library.saveConfig({
        concurrency: body.concurrency,
        limitRate: body.limitRate,
      });
      this.log(`⚙ Download config updated: ${next.concurrency} concurrent · ${next.limitRate || 'unlimited'} per stream`,
        'info', 'library', { subsystem: 'library', meta: next });
      return this._json(res, { ok: true, config: next });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  // Strip the internal AbortController + cap recent jobs at 20 for the
  // dashboard payload.
  _snapshotInstallJobs() {
    const out = [];
    for (const job of this.installJobs.values()) {
      // eslint-disable-next-line no-unused-vars
      const { _abort, ...safe } = job;
      out.push(safe);
    }
    // Newest first.
    out.sort((a, b) => b.startedAt - a.startedAt);
    return out.slice(0, 20);
  }

  _broadcastJobUpdate(job) {
    // eslint-disable-next-line no-unused-vars
    const { _abort, ...safe } = job;
    this.broadcast({ type: 'install_job', job: safe });
  }

  // Keep at most 20 jobs total in memory; drop the oldest finished ones first.
  _reapInstallJobs() {
    if (this.installJobs.size <= 20) return;
    const finished = [...this.installJobs.values()]
      .filter((j) => j.status !== 'running' && j.status !== 'cancelling')
      .sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
    while (this.installJobs.size > 20 && finished.length) {
      const oldest = finished.shift();
      this.installJobs.delete(oldest.id);
    }
  }

  // ===== Moderation API =====
  // All mod actions require a guildId in the query/body and operate on the
  // associated guild via discord.js. They post to modlog if configured and
  // log structured events to the diagnostics stream.

  _resolveGuild(guildId) {
    if (!guildId) return null;
    return this.client.guilds.cache.get(String(guildId)) || null;
  }

  async _handleModBansList(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    const guild = this._resolveGuild(guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    try {
      // Fetch all bans (paginated under the hood for big guilds).
      const bans = await guild.bans.fetch({ limit: 1000 });
      const list = [...bans.values()].map((b) => ({
        userId: b.user.id,
        tag: b.user.tag,
        username: b.user.username,
        avatar: b.user.displayAvatarURL({ size: 64 }),
        reason: b.reason || null,
      }));
      return this._json(res, { ok: true, count: list.length, bans: list });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleModBan(req, res) {
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const userId = String(body.userId || '').trim();
    const reason = String(body.reason || 'No reason provided').slice(0, 512);
    const deleteMessageSeconds = Math.max(0, Math.min(604800, Number(body.deleteMessageSeconds) || 0));
    if (!/^\d{15,25}$/.test(userId)) return this._json(res, { error: 'Invalid user ID.' }, 400);
    try {
      await guild.bans.create(userId, { reason, deleteMessageSeconds });
      this.log(`⊘ Banned <@${userId}> from ${guild.name}: ${reason}`, 'warn', 'command',
        { subsystem: 'discord', meta: { action: 'ban', guildId: guild.id, userId, reason } });
      try {
        const modlog = require('./modlog');
        modlog.post(guild, { action: 'ban', target: `<@${userId}>`, mod: 'Dashboard', reason });
      } catch { /* modlog optional */ }
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleModUnban(req, res) {
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const userId = String(body.userId || '').trim();
    if (!/^\d{15,25}$/.test(userId)) return this._json(res, { error: 'Invalid user ID.' }, 400);
    try {
      await guild.bans.remove(userId, body.reason || 'Unbanned via dashboard');
      this.log(`↺ Unbanned <@${userId}> from ${guild.name}`, 'info', 'command',
        { subsystem: 'discord', meta: { action: 'unban', guildId: guild.id, userId } });
      try {
        const modlog = require('./modlog');
        modlog.post(guild, { action: 'unban', target: `<@${userId}>`, mod: 'Dashboard' });
      } catch { /* */ }
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleModKick(req, res) {
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const userId = String(body.userId || '').trim();
    const reason = String(body.reason || 'No reason provided').slice(0, 512);
    if (!/^\d{15,25}$/.test(userId)) return this._json(res, { error: 'Invalid user ID.' }, 400);
    try {
      const member = await guild.members.fetch(userId);
      await member.kick(reason);
      this.log(`👢 Kicked ${member.user.tag} from ${guild.name}: ${reason}`, 'warn', 'command',
        { subsystem: 'discord', meta: { action: 'kick', guildId: guild.id, userId, reason } });
      try {
        const modlog = require('./modlog');
        modlog.post(guild, { action: 'kick', target: member.user, mod: 'Dashboard', reason });
      } catch { /* */ }
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleModTimeout(req, res) {
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const userId = String(body.userId || '').trim();
    const reason = String(body.reason || 'No reason provided').slice(0, 512);
    // Discord caps timeouts at 28 days (2419200000 ms).
    const ms = Math.max(0, Math.min(2419200000, Number(body.durationMs) || 0));
    if (!/^\d{15,25}$/.test(userId)) return this._json(res, { error: 'Invalid user ID.' }, 400);
    if (ms === 0) return this._json(res, { error: 'Duration must be > 0.' }, 400);
    try {
      const member = await guild.members.fetch(userId);
      await member.timeout(ms, reason);
      const human = `${Math.round(ms / 60000)} min`;
      this.log(`⏱ Timed out ${member.user.tag} for ${human}: ${reason}`, 'warn', 'command',
        { subsystem: 'discord', meta: { action: 'timeout', guildId: guild.id, userId, ms, reason } });
      try {
        const modlog = require('./modlog');
        modlog.post(guild, { action: 'timeout', target: member.user, mod: 'Dashboard', reason, extra: `**Duration:** ${human}` });
      } catch { /* */ }
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  _handleModWarnsList(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    try {
      const warnings = require('./warnings');
      const all = warnings.listAll(guildId);
      // Enrich with cached user info (without forcing fetches that could
      // burn API budget). The dashboard renders userId + display name fallback.
      const guild = this._resolveGuild(guildId);
      const out = Object.entries(all || {}).map(([userId, entries]) => {
        const member = guild?.members?.cache?.get(userId);
        return {
          userId,
          tag: member?.user?.tag || null,
          count: entries.length,
          entries: entries.slice(-10).reverse(),
        };
      }).sort((a, b) => b.count - a.count);
      return this._json(res, { ok: true, users: out });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleModWarnClear(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.guildId || !body.userId) return this._json(res, { error: 'guildId + userId required.' }, 400);
    try {
      const warnings = require('./warnings');
      warnings.clear(body.guildId, body.userId);
      this.log(`✕ Cleared warnings for <@${body.userId}> in guild ${body.guildId}`, 'info', 'command',
        { subsystem: 'discord', meta: { action: 'warn-clear', guildId: body.guildId, userId: body.userId } });
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  _handleModAutomodGet(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    try {
      const cfg = getGuild(guildId);
      return this._json(res, {
        automod: cfg.automod || {
          enabled: false,
          antiSpam: false,
          antiLinks: false,
          antiInvites: false,
          antiCaps: false,
          antiMentions: false,
          wordBlocklist: [],
        },
      });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleModAutomodSet(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.guildId) return this._json(res, { error: 'guildId required.' }, 400);
    try {
      const next = {
        enabled: !!body.enabled,
        antiSpam: !!body.antiSpam,
        antiLinks: !!body.antiLinks,
        antiInvites: !!body.antiInvites,
        antiCaps: !!body.antiCaps,
        antiMentions: !!body.antiMentions,
        wordBlocklist: Array.isArray(body.wordBlocklist) ? body.wordBlocklist.slice(0, 200) : [],
      };
      updateGuild(body.guildId, { automod: next });
      this.log(`⚙ Automod updated for guild ${body.guildId}`, 'info', 'command',
        { subsystem: 'discord', meta: { action: 'automod', guildId: body.guildId, next } });
      return this._json(res, { ok: true, automod: next });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  _handleModModlogConfig(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    try {
      const cfg = getGuild(guildId);
      const guild = this._resolveGuild(guildId);
      const channel = cfg.modlogChannelId ? guild?.channels?.cache?.get(cfg.modlogChannelId) : null;
      return this._json(res, {
        channelId: cfg.modlogChannelId || null,
        channelName: channel?.name || null,
      });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleModAuditList(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    const guild = this._resolveGuild(guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const type = url.searchParams.get('type');
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 50));
    try {
      const opts = { limit };
      if (type) opts.type = Number(type);
      const logs = await guild.fetchAuditLogs(opts);
      const entries = [...logs.entries.values()].map((e) => ({
        id: e.id,
        action: e.action,
        actionType: e.actionType,
        createdAt: e.createdTimestamp,
        executor: e.executor ? { id: e.executor.id, tag: e.executor.tag } : null,
        target: e.target ? { id: e.target.id, tag: e.target.tag || e.target.name } : null,
        reason: e.reason || null,
        changes: e.changes?.map?.((c) => ({ key: c.key, old: c.old, new: c.new })) || [],
      }));
      return this._json(res, { ok: true, count: entries.length, entries });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  // ===== Admin API: members / channels / roles / speedtest =====

  async _handleAdminMembers(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    const guild = this._resolveGuild(guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const search = String(url.searchParams.get('search') || '').toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const perPage = Math.max(10, Math.min(200, Number(url.searchParams.get('perPage')) || 50));
    const force = url.searchParams.get('force') === '1';
    try {
      // If the cache is short of guild.memberCount, force-fetch — the
      // GuildMembers intent only delivers join events going forward, not the
      // existing roster. discord.js batches GUILD_MEMBERS_CHUNK requests over
      // the gateway and populates guild.members.cache on the way. Bounded
      // with a 20s race so a huge guild can't hang the request indefinitely.
      // After a successful fetch the cache stays populated for the rest of
      // the process lifetime, so subsequent requests are instant.
      const needsFetch = force || guild.members.cache.size < guild.memberCount;
      let fetchTimedOut = false;
      if (needsFetch) {
        try {
          await Promise.race([
            guild.members.fetch(),
            new Promise((_, reject) => setTimeout(
              () => { fetchTimedOut = true; reject(new Error('timeout')); },
              20000,
            )),
          ]);
          this.log(`👥 Members fetched for ${guild.name}: ${guild.members.cache.size} loaded`,
            'info', 'discord', { subsystem: 'discord', meta: { guildId: guild.id, count: guild.members.cache.size } });
        } catch (e) {
          // Continue with whatever's cached; cacheNotice explains.
          if (fetchTimedOut) {
            this.log(`⏱ Member fetch timed out for ${guild.name} (${guild.members.cache.size}/${guild.memberCount} loaded)`,
              'warn', 'discord', { subsystem: 'discord', meta: { guildId: guild.id } });
          }
        }
      }
      const all = [...guild.members.cache.values()];
      const filtered = search
        ? all.filter((m) =>
            (m.user.tag || '').toLowerCase().includes(search) ||
            (m.displayName || '').toLowerCase().includes(search) ||
            m.id.includes(search))
        : all;
      // Sort: bots last, then by display name.
      filtered.sort((a, b) => {
        if (!!a.user.bot !== !!b.user.bot) return a.user.bot ? 1 : -1;
        return (a.displayName || '').localeCompare(b.displayName || '');
      });
      const total = filtered.length;
      const start = (page - 1) * perPage;
      const slice = filtered.slice(start, start + perPage).map((m) => ({
        id: m.id,
        tag: m.user.tag,
        displayName: m.displayName,
        avatar: m.user.displayAvatarURL({ size: 64 }),
        bot: m.user.bot,
        joinedAt: m.joinedTimestamp,
        roles: [...m.roles.cache.values()]
          .filter((r) => r.id !== guild.id)  // skip @everyone
          .map((r) => ({ id: r.id, name: r.name, color: r.color }))
          .slice(0, 8),
        voiceChannel: m.voice?.channel ? { id: m.voice.channel.id, name: m.voice.channel.name } : null,
      }));
      return this._json(res, {
        ok: true, total, page, perPage,
        cached: total, cacheNotice: total < guild.memberCount
          ? `Showing ${total} cached of ${guild.memberCount} total — only members the bot has seen are loaded.`
          : null,
        members: slice,
      });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  _handleAdminChannels(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    const guild = this._resolveGuild(guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    try {
      const channels = [...guild.channels.cache.values()];
      // Group by category (parent). Type 4 = Category.
      const cats = channels.filter((c) => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);
      const noCat = channels.filter((c) => !c.parentId && c.type !== ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);
      const shapeCh = (c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
        topic: c.topic || null,
        nsfw: !!c.nsfw,
        slowmode: c.rateLimitPerUser || 0,
        parentId: c.parentId || null,
        memberCount: c.members?.size || null,  // only for voice channels
      });
      const grouped = [
        { id: null, name: '(no category)', channels: noCat.map(shapeCh) },
        ...cats.map((cat) => ({
          id: cat.id,
          name: cat.name,
          channels: channels
            .filter((c) => c.parentId === cat.id && c.type !== ChannelType.GuildCategory)
            .sort((a, b) => a.position - b.position)
            .map(shapeCh),
        })),
      ].filter((g) => g.channels.length > 0);
      return this._json(res, { ok: true, groups: grouped });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleAdminChannelEdit(req, res) {
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const channel = guild.channels.cache.get(String(body.channelId || ''));
    if (!channel) return this._json(res, { error: 'Channel not found.' }, 404);
    try {
      const patch = {};
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 100);
      if (typeof body.topic === 'string') patch.topic = body.topic.slice(0, 1024);
      if (typeof body.nsfw === 'boolean') patch.nsfw = body.nsfw;
      if (body.slowmode != null) patch.rateLimitPerUser = Math.max(0, Math.min(21600, Number(body.slowmode) || 0));
      await channel.edit(patch, body.reason || 'Edited via dashboard');
      this.log(`✎ Channel #${channel.name} edited in ${guild.name}`, 'info', 'command',
        { subsystem: 'discord', meta: { action: 'channel-edit', guildId: guild.id, channelId: channel.id, patch } });
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  _handleAdminRoles(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    const guild = this._resolveGuild(guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    try {
      const roles = [...guild.roles.cache.values()]
        .filter((r) => r.id !== guild.id)  // skip @everyone
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          hexColor: r.hexColor,
          position: r.position,
          memberCount: r.members?.size || 0,
          permissions: r.permissions?.bitfield?.toString() || '0',
          managed: r.managed,
          mentionable: r.mentionable,
          hoist: r.hoist,
        }));
      return this._json(res, { ok: true, roles });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleAdminRoleCreate(req, res) {
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    try {
      const role = await guild.roles.create({
        name: String(body.name || 'new role').slice(0, 100),
        color: body.color || null,
        hoist: !!body.hoist,
        mentionable: !!body.mentionable,
        permissions: body.permissions ? BigInt(body.permissions) : undefined,
        reason: body.reason || 'Created via dashboard',
      });
      this.log(`+ Role "${role.name}" created in ${guild.name}`, 'info', 'command',
        { subsystem: 'discord', meta: { action: 'role-create', guildId: guild.id, roleId: role.id } });
      return this._json(res, { ok: true, role: { id: role.id, name: role.name } });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleAdminRoleEdit(req, res) {
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const role = guild.roles.cache.get(String(body.roleId || ''));
    if (!role) return this._json(res, { error: 'Role not found.' }, 404);
    try {
      const patch = {};
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 100);
      if (body.color != null) patch.color = body.color;
      if (typeof body.hoist === 'boolean') patch.hoist = body.hoist;
      if (typeof body.mentionable === 'boolean') patch.mentionable = body.mentionable;
      if (body.permissions != null) patch.permissions = BigInt(body.permissions);
      await role.edit(patch, body.reason || 'Edited via dashboard');
      this.log(`✎ Role "${role.name}" edited in ${guild.name}`, 'info', 'command',
        { subsystem: 'discord', meta: { action: 'role-edit', guildId: guild.id, roleId: role.id } });
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleAdminRoleDelete(req, res) {
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const role = guild.roles.cache.get(String(body.roleId || ''));
    if (!role) return this._json(res, { error: 'Role not found.' }, 404);
    if (role.managed) return this._json(res, { error: 'Cannot delete a managed role (bot/integration role).' }, 400);
    try {
      await role.delete(body.reason || 'Deleted via dashboard');
      this.log(`✕ Role "${role.name}" deleted in ${guild.name}`, 'warn', 'command',
        { subsystem: 'discord', meta: { action: 'role-delete', guildId: guild.id, roleId: role.id } });
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  // ===== Welcome / Farewell config =====

  _handleAdminWelcomeGet(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    try {
      const cfg = getGuild(guildId);
      const guild = this._resolveGuild(guildId);
      const channel = cfg.welcomeChannelId ? guild?.channels?.cache?.get(cfg.welcomeChannelId) : null;
      // Surface text-channel options so the UI can offer a picker without
      // re-fetching the channels endpoint.
      const channels = guild
        ? [...guild.channels.cache.values()]
            .filter((c) => c.type === ChannelType.GuildText)
            .sort((a, b) => a.position - b.position)
            .map((c) => ({ id: c.id, name: c.name, parentName: c.parent?.name || null }))
        : [];
      return this._json(res, {
        welcomeChannelId: cfg.welcomeChannelId || null,
        welcomeChannelName: channel?.name || null,
        welcomeMessage: cfg.welcomeMessage || '',
        farewellMessage: cfg.farewellMessage || '',
        welcomeSoundUrl: cfg.welcomeSoundUrl || '',
        leaveSoundUrl: cfg.leaveSoundUrl || '',
        channels,
      });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleAdminWelcomeSet(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.guildId) return this._json(res, { error: 'guildId required.' }, 400);
    try {
      const patch = {};
      if ('welcomeChannelId' in body) patch.welcomeChannelId = body.welcomeChannelId || null;
      if ('welcomeMessage' in body) patch.welcomeMessage = String(body.welcomeMessage || '').slice(0, 1500);
      if ('farewellMessage' in body) patch.farewellMessage = String(body.farewellMessage || '').slice(0, 1500);
      if ('welcomeSoundUrl' in body) patch.welcomeSoundUrl = String(body.welcomeSoundUrl || '').slice(0, 500);
      if ('leaveSoundUrl' in body) patch.leaveSoundUrl = String(body.leaveSoundUrl || '').slice(0, 500);
      updateGuild(body.guildId, patch);
      this.log(`⚙ Welcome config updated for guild ${body.guildId}`, 'info', 'command',
        { subsystem: 'discord', meta: { action: 'welcome-config', guildId: body.guildId, patch } });
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  // ===== Reaction roles =====

  _handleAdminReactionRolesGet(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    try {
      const cfg = getGuild(guildId);
      const guild = this._resolveGuild(guildId);
      const map = cfg.reactionRoles || {};
      // Enrich with role + channel info so the UI doesn't have to cross-
      // reference. Best-effort: if the role/message has been deleted in
      // Discord, we keep the entry but flag it stale.
      const entries = Object.entries(map).map(([messageId, m]) => {
        const role = guild?.roles?.cache?.get(m.roleId);
        return {
          messageId,
          emoji: m.emoji,
          roleId: m.roleId,
          roleName: role?.name || null,
          roleColor: role?.hexColor || null,
          stale: !role,
        };
      });
      // Also list mentionable roles for the create form.
      const roles = guild
        ? [...guild.roles.cache.values()]
            .filter((r) => r.id !== guild.id && !r.managed)
            .sort((a, b) => b.position - a.position)
            .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
        : [];
      const channels = guild
        ? [...guild.channels.cache.values()]
            .filter((c) => c.type === ChannelType.GuildText)
            .sort((a, b) => a.position - b.position)
            .map((c) => ({ id: c.id, name: c.name }))
        : [];
      return this._json(res, { ok: true, entries, roles, channels });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleAdminReactionRoleCreate(req, res) {
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const channelId = String(body.channelId || '').trim();
    const roleId = String(body.roleId || '').trim();
    const emoji = String(body.emoji || '').trim();
    const title = String(body.title || '').slice(0, 256) || 'Self-assign role';
    const channel = guild.channels.cache.get(channelId);
    const role = guild.roles.cache.get(roleId);
    if (!channel) return this._json(res, { error: 'Channel not found.' }, 404);
    if (!role) return this._json(res, { error: 'Role not found.' }, 404);
    if (role.id === guild.id) return this._json(res, { error: 'Cannot use @everyone.' }, 400);
    if (role.managed) return this._json(res, { error: 'Cannot use managed (bot) roles.' }, 400);
    const me = guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
      return this._json(res, { error: 'Role is at or above the bot — move my role above it first.' }, 400);
    }
    try {
      const { EmbedBuilder } = require('discord.js');
      const { COLORS } = require('./theme');
      const embed = new EmbedBuilder()
        .setColor(COLORS.COSMIC)
        .setTitle(`✦  ${title}`)
        .setDescription(`React with ${emoji} to receive **${role.name}**.\nUn-react to remove.`);
      const msg = await channel.send({ embeds: [embed] });
      try { await msg.react(emoji); } catch { /* invalid emoji; entry still works for custom flow */ }
      const store = (getGuild(guild.id).reactionRoles) || {};
      store[msg.id] = { emoji, roleId };
      updateGuild(guild.id, { reactionRoles: store });
      this.log(`+ Reaction role added to #${channel.name}: ${emoji} → ${role.name}`, 'info', 'command',
        { subsystem: 'discord', meta: { action: 'reactionrole-create', guildId: guild.id, messageId: msg.id } });
      return this._json(res, { ok: true, messageId: msg.id });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleAdminReactionRoleDelete(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.guildId || !body.messageId) {
      return this._json(res, { error: 'guildId + messageId required.' }, 400);
    }
    try {
      const cfg = getGuild(body.guildId);
      const store = { ...(cfg.reactionRoles || {}) };
      delete store[body.messageId];
      updateGuild(body.guildId, { reactionRoles: store });
      this.log(`✕ Reaction role removed (message ${body.messageId})`, 'info', 'command',
        { subsystem: 'discord', meta: { action: 'reactionrole-delete', guildId: body.guildId } });
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  // ===== Playlist subscriptions =====

  _handleAdminPlaylistSubsGet(req, res /* , url */) {
    try {
      const subs = require('./playlist-subscriptions');
      return this._json(res, { ok: true, subs: subs.list() });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleAdminPlaylistSubAdd(req, res) {
    const body = await this._readJsonBody(req);
    try {
      const subs = require('./playlist-subscriptions');
      const sub = subs.add({
        url: String(body.url || '').trim(),
        name: body.name,
        format: body.format,
        intervalHours: body.intervalHours,
      });
      this.log(`+ Playlist subscription: "${sub.name}" every ${sub.intervalHours}h`,
        'info', 'install', { subsystem: 'library', meta: { action: 'sub-add', subId: sub.id } });
      return this._json(res, { ok: true, sub });
    } catch (e) {
      return this._json(res, { error: e.message }, 400);
    }
  }

  async _handleAdminPlaylistSubUpdate(req, res) {
    const body = await this._readJsonBody(req);
    try {
      const subs = require('./playlist-subscriptions');
      const sub = subs.update(body.id, body);
      if (!sub) return this._json(res, { error: 'Subscription not found.' }, 404);
      return this._json(res, { ok: true, sub });
    } catch (e) {
      return this._json(res, { error: e.message }, 400);
    }
  }

  async _handleAdminPlaylistSubRemove(req, res) {
    const body = await this._readJsonBody(req);
    try {
      const subs = require('./playlist-subscriptions');
      const ok = subs.remove(body.id);
      if (!ok) return this._json(res, { error: 'Subscription not found.' }, 404);
      this.log(`✕ Playlist subscription removed`, 'info', 'library',
        { subsystem: 'library', meta: { action: 'sub-remove', subId: body.id } });
      return this._json(res, { ok: true });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  async _handleAdminPlaylistSubSync(req, res) {
    const body = await this._readJsonBody(req);
    try {
      const subs = require('./playlist-subscriptions');
      const library = require('./library');
      // Respond immediately — sync runs in the background and progress
      // flows through the existing log channel.
      this._json(res, { ok: true, started: true });
      this.log(`↺ Manual sync: ${body.id}`, 'info', 'install',
        { subsystem: 'library', meta: { action: 'sub-sync', subId: body.id } });
      try {
        const result = await subs.sync(body.id, library, {
          onProgress: (line) => this.log(`  ${line.slice(0, 200)}`, 'info', 'install',
            { subsystem: 'ytdlp' }),
        });
        this.log(`✓ Sub sync done: +${result.installed} new, ${result.skipped} already installed`,
          'success', 'install', { subsystem: 'library', meta: result });
        this.broadcast({ type: 'playlist_subs', subs: subs.list() });
      } catch (e) {
        this.log(`✕ Sub sync failed: ${e.message}`, 'error', 'install',
          { subsystem: 'ytdlp', meta: { error: e.message } });
        this.broadcast({ type: 'playlist_subs', subs: subs.list() });
      }
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  // ===== Listening heatmap =====

  _handleAdminHeatmap(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    const days = Math.max(7, Math.min(366, Number(url.searchParams.get('days')) || 365));
    try {
      const history = require('./history');
      const byDay = history.byDay(guildId, days);
      const total = Object.values(byDay).reduce((a, b) => a + b, 0);
      const peak = Math.max(0, ...Object.values(byDay));
      return this._json(res, { ok: true, days, total, peak, byDay });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  // ===== Speedtest =====
  // The speedtest itself now runs in the BROWSER (Cloudflare's free
  // speedtest endpoints — no host binaries needed). This endpoint just
  // caches the most recent result so it survives dashboard reloads.
  //
  //   GET  /api/admin/speedtest   → cached result (may be null)
  //   POST /api/admin/speedtest   → upload a new result from the browser
  async _handleAdminSpeedtest(req, res) {
    if (req.method === 'GET') {
      return this._json(res, { ok: true, result: this._speedtestResult || null });
    }
    // POST: browser is submitting a result.
    const body = await this._readJsonBody(req);
    this._speedtestResult = {
      ts: Date.now(),
      tool: body.tool || 'browser',
      downloadMbps: Number(body.downloadMbps) || null,
      uploadMbps: Number(body.uploadMbps) || null,
      pingMs: Number(body.pingMs) || null,
      server: body.server || null,
      isp: body.isp || null,
    };
    this.log(
      `✓ Speedtest: ↓${this._speedtestResult.downloadMbps?.toFixed(1) || '?'} ↑${this._speedtestResult.uploadMbps?.toFixed(1) || '?'} Mbps · ${this._speedtestResult.pingMs || '?'}ms`,
      'success', 'system',
      { subsystem: 'http', meta: this._speedtestResult });
    this.broadcast({ type: 'speedtest', result: this._speedtestResult });
    return this._json(res, { ok: true, result: this._speedtestResult });
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
    this.send(ws, { type: 'install_jobs', jobs: this._snapshotInstallJobs() });
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
        case 'queue_remove': {
          // Remove the song at queue index N (0 = currently playing, which is
          // a no-op; 1+ = upcoming songs). The currently-playing song can
          // be removed via /skip.
          const idx = Math.floor(Number(msg.index));
          if (!queue || !Number.isFinite(idx) || idx < 1 || idx >= queue.songs.length) {
            this.log('Queue remove: invalid index.', 'warn'); break;
          }
          const removed = queue.songs[idx];
          queue.songs.splice(idx, 1);
          this.log(`✕ Removed from queue: ${removed?.name || `position ${idx}`}`, 'info', 'play',
            { subsystem: 'distube', meta: { guildId, index: idx, name: removed?.name } });
          break;
        }
        case 'queue_move':       // legacy name from the existing dashboard
        case 'queue_reorder': {
          // Move song from position `from` to position `to`. Both must be > 0
          // (currently playing song can't be reordered — it's the head).
          const from = Math.floor(Number(msg.from));
          const to = Math.floor(Number(msg.to));
          if (!queue || from < 1 || to < 1 || from >= queue.songs.length || to >= queue.songs.length) {
            this.log('Queue reorder: invalid index.', 'warn'); break;
          }
          if (from === to) break;
          const [song] = queue.songs.splice(from, 1);
          queue.songs.splice(to, 0, song);
          this.log(`↕ Reordered queue: "${song.name}" → position ${to}`, 'info', 'play',
            { subsystem: 'distube', meta: { guildId, from, to, name: song.name } });
          break;
        }
        case 'queue_save_as_playlist': {
          // Save the current queue's URLs as a saved playlist under the
          // calling user. Requires guildId + userId in msg.
          if (!queue?.songs?.length) { this.log('Queue is empty — nothing to save.', 'warn'); break; }
          const name = String(msg.name || '').trim();
          const userId = String(msg.userId || '').trim();
          if (!name || !userId) { this.log('queue_save_as_playlist: name + userId required.', 'warn'); break; }
          const playlists = require('./playlists');
          const urls = queue.songs.map((s) => s.url).filter(Boolean);
          try {
            const n = playlists.save(guildId, userId, name, urls);
            this.log(`✓ Saved queue as playlist "${name}" (${n} song${n === 1 ? '' : 's'})`, 'success', 'library',
              { subsystem: 'library', meta: { guildId, userId, name, count: n } });
          } catch (e) {
            this.log(`✕ Save playlist failed: ${e.message}`, 'error', 'library', { subsystem: 'library' });
          }
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
