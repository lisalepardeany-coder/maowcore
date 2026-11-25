const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
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
  // True for a request the bot made to itself: from this machine and not
  // relayed by a proxy (a proxy on this machine would make every visitor look
  // local, so any forwarding header disqualifies it).
  static isSelfRequest(req) {
    const h = req.headers || {};
    if (h['x-forwarded-for'] || h.forwarded || h['x-real-ip'] || h['cf-connecting-ip']) return false;
    const ip = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    return ip === '::1' || /^127\./.test(ip);
  }

  constructor({ port = 8765, host = '127.0.0.1', distube, client }) {
    this.distube = distube;
    this.client = client;
    this.port = port;
    this.host = host;

    // ===== Authentication =====
    // The CONTROL_TOKEN env var gates the API + WS. Without it set, the
    // server runs in legacy open mode (backward-compatible with v1.x setups
    // where the dashboard talked to the local bot with no auth at all,
    // protected only by 127.0.0.1 binding). When set, every API request
    // and WS handshake must carry the matching Bearer token.
    //
    // Static dashboard files (HTML / CSS / JS / favicon) are always served
    // un-authed so the operator can load the dashboard and enter the token.
    // The dashboard sends the token after that via Authorization header.
    this.authToken = process.env.CONTROL_TOKEN || null;
    this.instanceName = process.env.INSTANCE_NAME || (client?.user?.tag || 'maowcore');
    this.logHistory = [];
    this.diagnostics = new Diagnostics();
    // A song deleted from the library leaves every queue right away, so the bot
    // doesn't later try to play a file that's gone (and fail, and skip).
    library.onRemove((entry) => { this._dropFromQueues(entry.file).catch(() => {}); });
    // The saved welcome sound plays through this server (works on every OS;
    // DisTube's file: links don't work on Windows).
    require('./welcome-intro').setUrlMaker((file) => `http://127.0.0.1:${this.port}/welcome-cache/${encodeURIComponent(path.basename(file))}`);
    // Playlist downloads: a saved queue that survives restarts (lib/download-queue.js).
    // Started once the server is fully set up (its messages go to this.log / broadcast).
    setImmediate(() => require('./download-queue').start({
      onUpdate: (job) => { try { this.broadcast({ type: 'install_job', job }); } catch { /* not listening yet */ } },
      onLog: (text, level) => { try { this.log(text, level || 'info', 'install', { subsystem: 'library' }); } catch { console.log(text); } },
    }));
    this._lastCpus = os.cpus();
    this._lastCpuSample = Date.now();
    this._startedAt = Date.now();

    // A handler that throws must answer with an error, not leave the request hanging.
    const handler = (req, res) => {
      Promise.resolve().then(() => this.handleHttp(req, res)).catch((e) => {
        console.warn('[control] request failed:', req.method, req.url, e?.message || e);
        try { if (!res.headersSent) this._json(res, { error: e?.message || 'Server error' }, 500); else res.end(); } catch { /* socket gone */ }
      });
    };
    this._handler = handler;
    // Plain http. With https on, it only answers the bot itself (127.0.0.1:
    // library songs, welcome sounds, yt-stream); everyone else is sent to https.
    this.httpServer = http.createServer((req, res) => {
      if (this.httpsServer && !ControlServer.isSelfRequest(req)) return this._toHttps(req, res);
      handler(req, res);
    });
    this.wss = new WebSocketServer({ noServer: true });
    this._onUpgrade = (req, socket, head) => {
      if (this.httpsServer && !req.socket.encrypted && !ControlServer.isSelfRequest(req)) { socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
    };
    this.httpServer.on('upgrade', this._onUpgrade);
    this.httpServer.on('error', (e) => console.warn('[control] http error:', e.message));
    this._listen(port, host);

    this.wss.on('connection', (ws, req) => {
      if (!require('./panel-extras').wsAllowed(ws, req, this)) {
        try { ws.send(JSON.stringify({ type: 'auth_required', message: 'Sign in required.' })); ws.close(1008, 'Unauthorized'); } catch { /* */ }
        return;
      }
      if (!this._checkWsAuth(ws, req)) return;
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

    // REST round trip (a full API request through discord.js), shown only on
    // the diagnostics page. The ping everyone sees comes from lib/latency.js:
    // this one includes discord.js's queue and HTTPS overhead, so it always
    // reads several times higher than the real latency. Once a minute is plenty.
    this._restPing = null;
    this._measureRestPing();
    this.pingTimer = setInterval(() => this._measureRestPing(), 60000);
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

    // v2.2.0 — load any plugins in plugins/
    try {
      const loader = require('./plugin-loader');
      this._plugins = loader.loadAll({ control: this, client, distube });
    } catch (e) {
      console.warn('[control] plugin loader failed:', e.message);
      this._plugins = [];
    }

    // v2.3.0 — daily auto-backup (5 min after boot, then every 24h, retain 14).
    try {
      const backup = require('./backup');
      this._stopBackupScheduler = backup.startScheduler({
        intervalHours: 24, retain: 14,
        onLog: (text, level) => this.log(text, level, 'system', { subsystem: 'system' }),
      });
    } catch (e) {
      console.warn('[control] backup scheduler failed:', e.message);
    }

    // v2.5.0 — automation scheduler. Tick every 20s, fire cron actions
    // whose expression matches the current minute. Action types supported:
    //   { type: 'console', line: 'play https://...' }
    //   { type: 'log', text: '...' }   (mostly useful for testing)
    try {
      const automation = require('./automation');
      this._stopAutomationScheduler = automation.startScheduler({
        onLog: (text, level) => this.log(text, level, 'system', { subsystem: 'system' }),
        onCron: async (c) => {
          if (c.action?.type === 'console' && c.action.line) {
            await this.runConsoleLine(String(c.action.line), c.guildId);
          } else if (c.action?.type === 'log') {
            this.log(`[automation] ${c.action.text || ''}`, 'info', 'system', { subsystem: 'system' });
          }
        },
      });
    } catch (e) {
      console.warn('[control] automation scheduler failed:', e.message);
    }
  }

  // ===== Listening: plain http, or http + https on the same port =====
  // With https (lib/tls-cert.js) one plain TCP server takes every connection
  // and looks at its first byte: 0x16 starts a TLS handshake, anything else is
  // plain http ("GET …"). So a browser that types http:// gets a redirect
  // instead of "SSL protocol error", and the bot's own 127.0.0.1 links keep
  // working without a certificate.
  _listen(port, host) {
    const tlsCert = require('./tls-cert');
    const plain = () => {
      this.listener = this.httpServer;
      this.httpServer.listen(port, host, () => console.log(`[control] dashboard http://${host}:${port}/  ·  ws ws://${host}:${port}/`));
    };
    if (!tlsCert.wanted()) return plain();
    tlsCert.load().then((creds) => {
      this.httpsServer = https.createServer({ key: creds.key, cert: creds.cert }, this._handler);
      this.httpsServer.on('upgrade', this._onUpgrade);
      // A browser stopping at the certificate warning ends the handshake; not an error.
      this.httpsServer.on('tlsClientError', () => {});
      this.listener = net.createServer((socket) => this._routeSocket(socket));
      this.listener.on('error', (e) => console.warn('[control] listen error:', e.message));
      this.listener.listen(port, host, () => {
        console.log(`[control] dashboard https://${host}:${port}/ (http:// is redirected) · certificate: ${creds.source}`);
        if (creds.fingerprint) console.log(`[https] Certificate fingerprint (SHA-256): ${creds.fingerprint}`);
        if (creds.source === 'self-signed') console.log('[https] Browsers warn once about this certificate: "Advanced" > "Proceed". Use the server\'s IP address if the domain forces https (HSTS).');
      });
      this._certFingerprint = creds.fingerprint;
      // Once a day: a certificate close to expiring is remade and swapped in without a restart.
      this._certTimer = setInterval(() => {
        tlsCert.load().then((c) => {
          if (c.fingerprint && c.fingerprint !== this._certFingerprint) {
            this.httpsServer.setSecureContext({ key: c.key, cert: c.cert });
            this._certFingerprint = c.fingerprint;
            console.log(`[https] Using the renewed certificate (${c.fingerprint}).`);
          }
        }).catch((e) => console.warn('[https] certificate check failed:', e.message));
      }, 24 * 3600 * 1000);
      this._certTimer.unref?.();
    }).catch((e) => {
      console.warn(`[https] Could not set up https (${e.message}); the dashboard stays on plain http.`);
      plain();
    });
  }

  _routeSocket(socket) {
    socket.on('error', () => {});
    socket.setTimeout(15000, () => socket.destroy());   // connected but never sent anything
    socket.once('data', (buf) => {
      socket.setTimeout(0);
      socket.pause();
      socket.unshift(buf);
      (buf[0] === 0x16 ? this.httpsServer : this.httpServer).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
  }

  _toHttps(req, res) {
    const hostHeader = String(req.headers.host || '');
    if (!/^[\w.\-:[\]]+$/.test(hostHeader)) { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('Use https:// for this dashboard.'); }
    res.writeHead(301, { Location: `https://${hostHeader}${req.url || '/'}`, 'Content-Type': 'text/plain' });
    res.end('This dashboard uses https.');
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

  // Check Bearer authentication on a request. Returns true if authorized
  // (or auth is disabled), false (and writes a 401 response) otherwise.
  // Static files and a handful of unauth'd routes are allowed through.
  _checkAuth(req, res, urlPath) {
    if (!this.authToken) return true;  // legacy open mode
    // A signed-in Discord user is let through too (panel-extras already
    // checked their rank), so CONTROL_TOKEN and Discord login can coexist.
    if (req.headers['x-maow-session']) {
      try { if (require('./dashboard-auth').lookup(req.headers['x-maow-session'])) return true; } catch { /* fall through */ }
    }
    if (urlPath.startsWith('/api/auth/') || ['/login-gate.js', '/panel-revamp.js', '/panel-revamp.css', '/panel-plus.js', '/downloads.js', '/theme-pack-c.js', '/neon.css', '/neon.js', '/listen.html', '/listen'].includes(urlPath) || urlPath === '/icon.svg' || urlPath === '/manifest.json' || urlPath === '/sw.js') return true;
    // The bot plays uploads, soundboard clips and ambience by having yt-dlp
    // fetch them from this server (it can't read local paths), with no token.
    // Those fetches come from this machine; everyone else still needs a token.
    if (/^\/(library|sounds|ambience|welcome-cache)\//.test(urlPath) && ControlServer.isSelfRequest(req)) return true;
    // Listen-room audio: an <audio> element can't send headers, so a signed-in
    // listener's session comes in the address (?session=), like the WebSocket.
    if (urlPath === '/api/listen/audio') {
      try {
        const s = new URL(req.url || '/', 'http://x').searchParams.get('session');
        if (s && require('./dashboard-auth').lookup(s)) return true;
      } catch { /* fall through to the token check */ }
    }
    // Static dashboard files load before the token is known — let them through.
    if (urlPath === '/'
      || urlPath === '/dashboard.html'
      || urlPath === '/app.js'
      || urlPath === '/style.css'
      || urlPath === '/theme-pizzeria.css'
      || urlPath === '/theme-pizzeria.js'
      || urlPath === '/theme-pack.js'
      || urlPath === '/theme-extras.js'
      || urlPath === '/theme-space-a.js'
      || urlPath === '/theme-space-b.js'
      || urlPath === '/panel-extras.js'
      || urlPath === '/panel-extras.css'
      || urlPath === '/favicon.svg'
      || urlPath === '/favicon.ico') return true;  // dashboard files load before the token is known
    // Unauth'd health check so the multi-bot dashboard can probe instances
    // without holding the token yet. Returns minimal data only.
    if (urlPath === '/api/health') return true;

    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] === this.authToken) return true;
    res.writeHead(401, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'Unauthorized — missing or wrong Bearer token.' }));
    return false;
  }

  // Same check for WS — returns true if authorized, false if it closed the conn.
  _checkWsAuth(ws, req) {
    if (!this.authToken) return true;
    // Token can come in the Authorization header or as ?token=... in the URL
    // (browsers can't set custom WS headers, so query-string is the norm).
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] === this.authToken) return true;
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.searchParams.get('token') === this.authToken) return true;
      // A signed-in Discord user, same as _checkAuth (app.js sends ?session=).
      const session = url.searchParams.get('session');
      if (session && require('./dashboard-auth').lookup(session)) return true;
    } catch { /* */ }
    try {
      ws.send(JSON.stringify({ type: 'auth_required', message: 'Bearer token required.' }));
      ws.close(1008, 'Unauthorized');
    } catch { /* */ }
    return false;
  }

  // ===== HTTP =====
  async handleHttp(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const urlPath0 = url.pathname;

    // CORS for cross-instance dashboard requests (v2.0+ multi-bot setup).
    // When a single dashboard talks to multiple bots, the bots respond from
    // different origins and the browser needs CORS headers to read the body.
    // Only trusted origins get CORS headers. This used to echo back ANY origin,
    // which let every website you visit read and drive the panel API.
    const origin = req.headers.origin;
    const corsOk = origin && require('./panel-extras').originAllowed(origin, req.headers.host);
    if (corsOk) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Filename, X-Maow-Session');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(corsOk ? 204 : 403).end(); return; }

    // Lightweight, un-authed health probe so the multi-bot dashboard can
    // discover instances and check liveness before authenticating.
    if (urlPath0 === '/api/health') {
      return this._json(res, {
        ok: true,
        name: this.instanceName,
        botTag: this.client?.user?.tag || null,
        version: require('../package.json').version,
        startedAt: this._startedAt,
        authRequired: !!this.authToken,
        requireLogin: require('./panel-extras').loginRequired(),
        loginWanted: require('./panel-extras').loginWanted(),
        oauthConfigured: require('./dashboard-auth').isConfigured(),
      });
    }

    // Permission gate, audit log, soundboard, synced lyrics, restart/update.
    if (require('./panel-extras').handle(req, res, urlPath0, this, url)) return;

    // Status page + status admin API (does its own token check).
    if (require('./status-monitor').handleHttp(req, res, urlPath0, this)) return;

    // YouTube audio for ffmpeg (local only, secret key) — see lib/yt-stream.js.
    if (urlPath0 === '/yt-stream') {
      return require('./yt-stream').handle(req, res, url, { log: (t, l) => this.log(t, l, 'playback', { subsystem: 'ytdlp' }) });
    }

    if (!this._checkAuth(req, res, urlPath0)) return;

    // v3.3 panel features: profiles, reminders, ambience, listen room, health alerts.
    if (urlPath0.startsWith('/api/') && await require('./panel-features').handle(req, res, urlPath0, this, url)) return;

    // ===== POST routes (uploads / mutations) =====
    if (req.method === 'POST') {
      if (urlPath0 === '/api/library/upload') return this._handleLibraryUpload(req, res);
      if (urlPath0 === '/api/library/delete') return this._handleLibraryDelete(req, res);
      if (urlPath0 === '/api/library/install') return this._handleLibraryInstall(req, res);
      if (urlPath0 === '/api/library/install-playlist') return this._handleLibraryInstallPlaylist(req, res);
      if (urlPath0 === '/api/library/probe-playlist') return this._handleLibraryProbePlaylist(req, res);
      if (urlPath0 === '/api/library/config') return this._handleLibraryConfigSet(req, res);
      // /api/library/install-jobs/:id/(cancel|pause|resume|retry|remove), /api/library/downloads/continue-now
      const jobAction = urlPath0.match(/^\/api\/library\/install-jobs\/([^/]+)\/(cancel|pause|resume|retry|remove|play)$/);
      if (jobAction) return jobAction[2] === 'play'
        ? this._handleLibraryJobPlay(req, res, jobAction[1])
        : this._handleLibraryJobAction(req, res, jobAction[1], jobAction[2]);
      if (urlPath0 === '/api/library/downloads/continue-now') return this._json(res, { ok: require('./download-queue').continueNow() });

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

      // v2.1.0
      if (urlPath0 === '/api/auth/discord/start') return this._handleAuthStart(req, res);
      if (urlPath0 === '/api/auth/logout') return this._handleAuthLogout(req, res);
      if (urlPath0 === '/api/auth/logout-all') return this._handleAuthLogoutAll(req, res);
      if (urlPath0 === '/api/auth/sessions/revoke') return this._handleAuthRevoke(req, res);
      if (urlPath0 === '/api/auth/setup') return this._handleAuthSetup(req, res);
      if (urlPath0 === '/api/auth/lock') return this._handleAuthLock(req, res);
      if (urlPath0 === '/api/social/profile') return this._handleSocialProfileSet(req, res);
      if (urlPath0 === '/api/social/rate') return this._handleSocialRate(req, res);
      if (urlPath0 === '/api/library/cleanup/delete-orphans') return this._handleCleanupDeleteOrphans(req, res);
      if (urlPath0 === '/api/library/cleanup/probe-missing') return this._handleCleanupProbeMissing(req, res);
      if (urlPath0 === '/api/library/cleanup/delete-songs') return this._handleCleanupDeleteSongs(req, res);

      // v2.3.0
      if (urlPath0 === '/api/backup/create') return this._handleBackupCreate(req, res);
      if (urlPath0 === '/api/backup/restore') return this._handleBackupRestore(req, res);
      if (urlPath0 === '/api/backup/delete') return this._handleBackupDelete(req, res);
      if (urlPath0 === '/api/market/export') return this._handleMarketExport(req, res);
      if (urlPath0 === '/api/market/import') return this._handleMarketImport(req, res);
      if (urlPath0 === '/api/market/save') return this._handleMarketSave(req, res);
      if (urlPath0 === '/api/market/delete') return this._handleMarketDelete(req, res);
      if (urlPath0 === '/api/market/fetch') return this._handleMarketFetch(req, res);

      // v2.5.0+ — automation / economy / custom-cmds / game / templates
      if (urlPath0 === '/api/automation/cron/add') return this._handleAutomationCronAdd(req, res);
      if (urlPath0 === '/api/automation/cron/remove') return this._handleAutomationCronRemove(req, res);
      if (urlPath0 === '/api/automation/cron/toggle') return this._handleAutomationCronToggle(req, res);
      if (urlPath0 === '/api/automation/webhook/add') return this._handleAutomationWebhookAdd(req, res);
      if (urlPath0 === '/api/automation/webhook/remove') return this._handleAutomationWebhookRemove(req, res);
      if (urlPath0 === '/api/automation/rule/add') return this._handleAutomationRuleAdd(req, res);
      if (urlPath0 === '/api/automation/rule/remove') return this._handleAutomationRuleRemove(req, res);
      if (urlPath0.startsWith('/api/automation/hook/')) return this._handleAutomationHookFire(req, res, urlPath0);
      if (urlPath0 === '/api/economy/spend') return this._handleEconomySpend(req, res);
      if (urlPath0 === '/api/economy/shop/add') return this._handleEconomyShopAdd(req, res);
      if (urlPath0 === '/api/economy/shop/remove') return this._handleEconomyShopRemove(req, res);
      if (urlPath0 === '/api/economy/shop/seed') return this._handleEconomyShopSeed(req, res);
      if (urlPath0 === '/api/custom-cmds/add') return this._handleCustomCmdsAdd(req, res);
      if (urlPath0 === '/api/custom-cmds/remove') return this._handleCustomCmdsRemove(req, res);
      if (urlPath0 === '/api/custom-cmds/run') return this._handleCustomCmdsRun(req, res);
      if (urlPath0 === '/api/templates/apply') return this._handleTemplatesApply(req, res);
      if (urlPath0 === '/api/observability/alert') return this._handleAlertFire(req, res);
      if (urlPath0 === '/api/diag/restart') return this._handleDiagRestart(req, res);
      if (urlPath0 === '/api/diag/reconnect') return this._handleDiagReconnect(req, res);
      if (urlPath0 === '/api/diag/gc') return this._handleDiagGc(req, res);
      if (urlPath0 === '/api/guild-config') return this._handleGuildConfigSet(req, res);
      // Account / power-user (POST). (/api/auth/sessions/revoke is handled further up, by _handleAuthRevoke.)
      if (urlPath0 === '/api/tokens/create') return this._handleTokenCreate(req, res);
      if (urlPath0 === '/api/tokens/revoke') return this._handleTokenRevoke(req, res);
      if (urlPath0 === '/api/presence') return this._handlePresenceSet(req, res);
      if (urlPath0 === '/api/integrations/lastfm') return this._handleLastfmSet(req, res);
      if (urlPath0 === '/api/prefs') return this._handlePrefsSet(req, res);
      if (urlPath0 === '/api/sound/play') return this._handleSoundPlay(req, res);
      if (urlPath0 === '/api/playlists/play') return this._handlePlaylistPlay(req, res);
      if (urlPath0 === '/api/playlists/delete') return this._handlePlaylistDelete(req, res);
      if (urlPath0 === '/api/channel/send') return this._handleChannelSend(req, res);
      if (urlPath0 === '/api/reminders/add') return this._handleReminderAdd(req, res);
      if (urlPath0 === '/api/reminders/remove') return this._handleReminderRemove(req, res);
      if (urlPath0.startsWith('/api/suggestions/')) return this._handleSuggestions(req, res, urlPath0);
      if (urlPath0.startsWith('/api/polls/')) return this._handlePolls(req, res, urlPath0);
      if (urlPath0.startsWith('/api/giveaways/')) return this._handleGiveaways(req, res, urlPath0);
      if (urlPath0.startsWith('/api/tickets/')) return this._handleTickets(req, res, urlPath0);
      if (urlPath0.startsWith('/api/appeals/')) return this._handleAppeals(req, res, urlPath0);
      if (urlPath0 === '/api/dev/db/query') return this._handleDevDbQuery(req, res);

      // v3.2.0
      if (urlPath0 === '/api/roles/grant') return this._handleRolesGrant(req, res);
      if (urlPath0 === '/api/posts/create') return this._handlePostsCreate(req, res);
      if (urlPath0 === '/api/posts/update') return this._handlePostsUpdate(req, res);
      if (urlPath0 === '/api/posts/delete') return this._handlePostsDelete(req, res);

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
    {
      // one download with every song's status
      const m = urlPath0.match(/^\/api\/library\/install-jobs\/([^/]+)$/);
      if (m) {
        const job = require('./download-queue').get(decodeURIComponent(m[1]));
        return job ? this._json(res, { job }) : this._json(res, { error: 'No such download.' }, 404);
      }
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

    // v2.1.0 — auth, social, cleanup
    if (urlPath0 === '/api/auth/discord/callback') return this._handleAuthCallback(req, res, url);
    if (urlPath0 === '/api/auth/me') return this._handleAuthMe(req, res);
    if (urlPath0 === '/api/auth/sessions') return this._handleAuthSessions(req, res);
    if (urlPath0 === '/api/auth/logins') return this._handleAuthLogins(req, res, url);
    if (urlPath0 === '/api/social/profile') return this._handleSocialProfile(req, res, url);
    if (urlPath0 === '/api/social/leaderboard') return this._handleSocialLeaderboard(req, res, url);
    if (urlPath0 === '/api/social/top-rated') return this._handleSocialTopRated(req, res, url);
    if (urlPath0 === '/api/social/ratings') return this._handleSocialRatings(req, res, url);
    if (urlPath0 === '/api/library/cleanup/scan') return this._handleCleanupScan(req, res);

    // v2.2.0 — integrations, dev tooling, i18n
    if (urlPath0 === '/api/integrations/status') return this._handleIntegrationsStatus(req, res);
    if (urlPath0 === '/api/integrations/search-urls') return this._handleSearchUrls(req, res, url);
    if (urlPath0 === '/api/dev/endpoints') return this._handleDevEndpoints(req, res);
    if (urlPath0 === '/api/dev/plugins') return this._handleDevPlugins(req, res);
    if (urlPath0 === '/api/dev/db/tables') return this._handleDevDbTables(req, res);

    // v3.2.0 — roles + posts
    if (urlPath0 === '/api/roles/list') return this._handleRolesList(req, res);
    if (urlPath0 === '/api/posts/list') return this._handlePostsList(req, res, url);
    if (urlPath0.match(/^\/api\/posts\/\d+$/)) return this._handlePostsGet(req, res, urlPath0);

    // v2.3.0 — backup / marketplace
    if (urlPath0 === '/api/backup/list') return this._handleBackupList(req, res);
    if (urlPath0 === '/api/market/list') return this._handleMarketList(req, res);

    // v2.4.0+ — wrapped / automation / economy / custom commands / game / templates
    if (urlPath0 === '/api/wrapped') return this._handleWrappedGet(req, res, url);
    if (urlPath0 === '/api/wrapped/years') return this._handleWrappedYears(req, res, url);
    if (urlPath0 === '/api/automation/list') return this._handleAutomationList(req, res);
    if (urlPath0.startsWith('/api/automation/hook/')) return this._handleAutomationHookGet(req, res, urlPath0);
    if (urlPath0 === '/api/economy/leaderboard') return this._handleEconomyLeaderboard(req, res, url);
    if (urlPath0 === '/api/economy/me') return this._handleEconomyMe(req, res, url);
    if (urlPath0 === '/api/economy/shop') return this._handleEconomyShop(req, res, url);
    if (urlPath0 === '/api/custom-cmds/list') return this._handleCustomCmdsList(req, res, url);
    if (urlPath0 === '/api/game/sessions') return this._handleGameSessions(req, res, url);
    if (urlPath0 === '/api/templates/build') return this._handleTemplatesBuild(req, res, url);

    // v3.0.0 — observability
    if (urlPath0 === '/api/observability/status') {
      return this._json(res, require('./observability').status());
    }

    // Diagnostics ops console (GET)
    if (urlPath0 === '/api/diag/versions') return this._handleDiagVersions(req, res);
    if (urlPath0 === '/api/diag/dbstats') return this._handleDiagDbStats(req, res);
    if (urlPath0 === '/api/diag/commands') return this._json(res, { commands: require('./ops').commandStats() });
    if (urlPath0 === '/api/diag/ratelimits') return this._json(res, require('./ops').rateLimits());
    if (urlPath0 === '/api/diag/restart-history') return this._json(res, { events: require('./ops').history() });
    if (urlPath0 === '/api/guild-config') return this._handleGuildConfigGet(req, res, url);
    // Account / power-user (GET). (/api/auth/sessions is handled further up.)
    if (urlPath0 === '/api/tokens') return this._handleTokensList(req, res);
    if (urlPath0 === '/api/presence') return this._json(res, require('./presence').getConfig());
    if (urlPath0 === '/api/integrations/lastfm') return this._json(res, require('./integrations-config').getLastfm());
    if (urlPath0 === '/api/prefs') return this._handlePrefsGet(req, res);
    // Music pages
    if (urlPath0 === '/api/lyrics') return this._handleLyrics(req, res, url);
    if (urlPath0 === '/api/sounds') return this._handleSoundsList(req, res);
    if (urlPath0 === '/api/playlists') return this._handlePlaylistsList(req, res, url);
    if (urlPath0 === '/api/reminders') return this._json(res, { reminders: require('./reminders').all() });
    if (urlPath0 === '/api/suggestions') return this._json(res, { suggestions: require('./suggestions').list(url.searchParams.get('guildId')) });
    if (urlPath0 === '/api/polls') return this._json(res, { polls: require('./polls').list(url.searchParams.get('guildId')) });
    if (urlPath0 === '/api/giveaways') return this._json(res, { giveaways: require('./giveaways').list(url.searchParams.get('guildId')) });
    if (urlPath0 === '/api/tickets') return this._json(res, { tickets: require('./tickets').list(url.searchParams.get('guildId')) });
    if (urlPath0 === '/api/appeals') return this._json(res, { appeals: require('./appeals').list(url.searchParams.get('guildId')) });
    if (urlPath0 === '/api/message-logs') return this._json(res, { logs: require('./message-logs').list(url.searchParams.get('guildId'), 200) });
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
    if (urlPath0.startsWith('/welcome-cache/')) {
      return this._serveWelcomeFile(urlPath0, req, res);
    }
    if (urlPath0.startsWith('/ambience/')) {
      const m = urlPath0.match(/^\/ambience\/([a-z]+)\.wav$/);
      const a = require('./ambience');
      if (!m || !a.PRESETS[m[1]]) { res.writeHead(404).end('Not found'); return; }
      return this._streamFile(a.fileFor(m[1]), req, res);
    }

    // API routes
    if (urlPath0 === '/health') {
      const stats = await this._collectStats();
      return this._json(res, {
        ok: true,
        botTag: this.client.user?.tag || null,
        uptime: stats.process.uptime,
        memRss: stats.process.rss,
        ping: require('./latency').get().ms,
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

    // Unknown /api/* paths return JSON 404 instead of falling through to
    // static-file lookup (which would 404 as text/plain, breaking JSON.parse
    // on the client side and producing the cryptic "Unexpected token 'N'..."
    // error from older versions).
    if (urlPath0.startsWith('/api/')) {
      return this._json(res, { error: `Unknown endpoint ${urlPath0}` }, 404);
    }

    // Static files: the dashboard in public/ ("/" = dashboard.html, plus listen,
    // status page, themes, Control room). (The separate SvelteKit dashboard was
    // removed in 3.8.0.)
    let urlPath = urlPath0;
    if (urlPath === '/') urlPath = '/dashboard.html';
    if (urlPath === '/listen') urlPath = '/listen.html';
    const safe = path.normalize(urlPath).replace(/^([\\/])+/, '');
    const full = path.join(PUBLIC_DIR, safe);
    if (!full.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let isFile = false;
    try { isFile = fs.statSync(full).isFile(); } catch { /* missing */ }
    if (!isFile) {
      // Bookmarks from the removed SvelteKit dashboard (/diagnostics, /leveling,
      // /v2/...) are pages without a file extension: send them to the dashboard.
      if (!path.extname(safe)) { res.writeHead(302, { Location: '/' }).end(); return; }
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const cacheCtl = 'no-cache';
    // Faster loading: gzip text files (kept in memory until the file changes)
    // and answer "304 Not Modified" when the browser already has this version.
    fs.stat(full, (statErr, st) => {
      if (statErr || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
      const mime = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
      const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
      const base = { 'Content-Type': mime, 'Cache-Control': cacheCtl, ETag: etag, Vary: 'Accept-Encoding' };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, base).end(); return; }
      const gzipOk = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && /^(text\/|application\/(javascript|json|manifest)|image\/svg)/.test(mime);
      const cached = this._staticCache?.get(full);
      if (cached && cached.etag === etag) {
        if (gzipOk) res.writeHead(200, { ...base, 'Content-Encoding': 'gzip' }).end(cached.gz);
        else res.writeHead(200, base).end(cached.raw);
        return;
      }
      fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
        if (!gzipOk && !/^(text\/|application\/(javascript|json)|image\/svg)/.test(mime)) { res.writeHead(200, base).end(data); return; }
        const gz = require('node:zlib').gzipSync(data, { level: 6 });
        this._staticCache = this._staticCache || new Map();
        this._staticCache.set(full, { etag, raw: data, gz });
        if (gzipOk) res.writeHead(200, { ...base, 'Content-Encoding': 'gzip' }).end(gz);
        else res.writeHead(200, base).end(data);
      });
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

  _ambienceUrl(preset) {
    return `http://127.0.0.1:${this.port}/ambience/${encodeURIComponent(preset)}.wav`;
  }

  // ===== Local library: upload / serve / delete =====
  // Upload accepts the raw file bytes as the request body (no multipart
  // parsing dependency). The client sends the original filename in the
  // X-Filename header. We buffer with a hard size cap to avoid OOM.
  _handleLibraryUpload(req, res) {
    let target;
    try {
      // A stray % in the filename used to throw outside any try and hang the upload.
      const rawName = decodeURIComponent(req.headers['x-filename'] || 'upload');
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
    // Size- and time-capped body read (the old raw reader had no limit).
    this._readJsonBody(req).then(async (body) => {
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

  // Takes a deleted library file out of every queue. Upcoming copies are
  // removed; if it's playing now, the bot moves on (or stops if nothing's left).
  async _dropFromQueues(file) {
    const isIt = (s) => library.fileOfUrl(s?.url) === file;
    let removed = 0;
    for (const queue of this.distube?.queues?.collection?.values?.() || []) {
      for (let i = queue.songs.length - 1; i >= 1; i--) {
        if (isIt(queue.songs[i])) { queue.songs.splice(i, 1); removed++; }
      }
      if (isIt(queue.songs[0])) {
        removed++;
        try { await queue.skip(); } catch { try { await queue.stop(); } catch { /* already over */ } }
      }
    }
    if (removed) this.log(`🗑 Took a deleted library song out of the queue (${removed}×)`, 'info', 'library');
    return removed;
  }

  _handleLibraryDelete(req, res) {
    this._readJsonBody(req).then((body) => {
      const ok = library.remove(String(body.id || ''));
      this._json(res, { ok });
    });
  }

  // ===== Playlist install — background job manager =====

  // Read a JSON request body with a 5 MB hard cap and a 30s timeout.
  // Always resolves (never throws) so every existing caller keeps working
  // without try/catch boilerplate. On cap exceeded or timeout, resolves
  // to {} and logs the rejection — the caller will see an empty body and
  // typically return a 400. Without these caps an attacker POSTing a huge
  // body to /api/* could exhaust memory; without a timeout, a slow-loris
  // attack hangs the request handler forever.
  _readJsonBody(req, { maxBytes = 5 * 1024 * 1024, timeoutMs = 30000 } = {}) {
    return new Promise((resolve) => {
      const chunks = [];
      let total = 0;
      let done = false;
      const finish = (body) => { if (done) return; done = true; clearTimeout(timer); resolve(body); };
      const timer = setTimeout(() => {
        try { req.destroy(); } catch { /* */ }
        this.log(`Request body read timed out (>${(timeoutMs / 1000).toFixed(0)}s)`, 'warn', 'http', { subsystem: 'http' });
        finish({});
      }, timeoutMs);
      req.on('data', (c) => {
        if (done) return;
        total += c.length;
        if (total > maxBytes) {
          try { req.destroy(); } catch { /* */ }
          this.log(`Request body too large (>${(maxBytes / 1024 / 1024).toFixed(0)} MB) — rejecting`, 'warn', 'http', { subsystem: 'http' });
          return finish({});
        }
        chunks.push(c);
      });
      req.on('end', () => {
        try { finish(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
        catch { finish({}); }   // malformed JSON → empty body (legacy behavior)
      });
      req.on('error', () => finish({}));
      req.on('aborted', () => finish({}));
    });
  }

  // ===== Playlist downloads (lib/download-queue.js) =====
  // Probe: the full song list for the picker (playlists, albums, Spotify).
  async _handleLibraryProbePlaylist(req, res) {
    const body = await this._readJsonBody(req);
    const url = String(body.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return this._json(res, { error: 'Invalid URL.' }, 400);
    }
    try {
      const p = await require('./download-queue').probe(url);
      return this._json(res, {
        ok: true,
        playlistName: p.name, name: p.name, source: p.source, count: p.entries.length,
        entries: p.entries.map((e, i) => ({ i, title: e.title, duration: e.duration })),
        sample: p.entries.slice(0, 5).map((e) => e.title), // older dashboard code
      });
    } catch (e) {
      return this._json(res, { error: library.explainYtDlpError(e.message) }, 500);
    }
  }

  // Start a download. body: { url, format, pick?: [song indexes] } (no pick = all songs)
  async _handleLibraryInstallPlaylist(req, res) {
    const body = await this._readJsonBody(req);
    const url = String(body.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return this._json(res, { error: 'Invalid URL.' }, 400);
    }
    try {
      const job = await require('./download-queue').create(url, {
        format: String(body.format || 'original'),
        pick: Array.isArray(body.pick) ? body.pick : null,
      });
      return this._json(res, { ok: true, jobId: job.id, job });
    } catch (e) {
      return this._json(res, { error: library.explainYtDlpError(e.message) }, 500);
    }
  }

  // ▶ Play a finished download: queue all its songs in voice. Uses the bot's
  // current voice channel, else joins the one the signed-in user is in.
  async _handleLibraryJobPlay(req, res, jobId) {
    const q = require('./download-queue');
    const body = await this._readJsonBody(req);
    let ids;
    try { ids = q.entryIds(decodeURIComponent(jobId)); } catch (e) { return this._json(res, { error: e.message }, 404); }
    const entries = ids.map((id) => library.get(id)).filter((e) => e && library.getPath(e.id));
    if (!entries.length) return this._json(res, { error: 'Nothing from this download is in the library yet.' }, 400);
    const userId = this._maowSession(req)?.userId || require('./owners').primary();
    const guilds = body.guildId
      ? [this.client.guilds.cache.get(String(body.guildId))].filter(Boolean)
      : [...this.client.guilds.cache.values()];
    let channel = null;
    for (const g of guilds) { channel = this.distube.voices.get(g.id)?.channel || null; if (channel) break; }
    if (!channel && userId) for (const g of guilds) { channel = g.voiceStates?.cache?.get(userId)?.channel || null; if (channel) break; }
    if (!channel) return this._json(res, { error: 'Join a voice channel first (or have the bot in one), then press Play.' }, 400);
    this._json(res, { ok: true, queued: entries.length, channel: channel.name });
    let n = 0;
    for (const e of entries) {
      try {
        await this.distube.play(channel, this._libraryUrl(e.file), { metadata: { localName: e.name, durationSec: e.durationSec } });
        n++;
      } catch (err) { this.log(`Play download: skipped ${e.name}: ${err.message}`, 'warn', 'play'); }
    }
    this.log(`♫ Queued ${n} song${n === 1 ? '' : 's'} from a download in ${channel.name}`, 'info', 'play', { subsystem: 'distube' });
  }

  async _handleLibraryJobAction(req, res, jobId, action) {
    const q = require('./download-queue');
    try {
      const id = decodeURIComponent(jobId);
      const result = action === 'remove' ? q.remove(id) : q[action](id);
      return this._json(res, { ok: true, job: result === true ? null : result });
    } catch (e) {
      return this._json(res, { error: e.message }, 404);
    }
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

  // Download summaries for the dashboard (newest first).
  _snapshotInstallJobs() {
    return require('./download-queue').list();
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
      // DM first (with an Appeal button when /appeals is on).
      try {
        const u = await this.client.users.fetch(userId);
        await u.send(require('./mod-tools').appealDm(guild, reason));
      } catch { /* DMs closed */ }
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
      if ('welcomeSoundUrl' in body) {
        patch.welcomeSoundUrl = String(body.welcomeSoundUrl || '').slice(0, 500);
        // Download it now so it plays instantly next time the bot joins.
        if (patch.welcomeSoundUrl) require('./welcome-intro').warm(patch.welcomeSoundUrl, (t) => this.log(t, 'warn', 'play'));
      }
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
        this.log(result.queued
          ? `✓ Sub sync: ${result.queued} new song${result.queued === 1 ? '' : 's'} queued (see ⬇ Downloads), ${result.skipped} already had`
          : `✓ Sub sync: nothing new (${result.skipped} already had)${result.busy ? ', the previous sync is still downloading' : ''}`,
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

  // ===== v2.1.0 — Auth =====

  _maowSession(req) {
    const token = req.headers['x-maow-session'] || '';
    const sess = require('./dashboard-auth').lookup(token);
    if (sess) return sess;
    // Fall back to a personal API token (in X-Maow-Session or X-Api-Token).
    return require('./api-tokens').lookup(token || req.headers['x-api-token'] || '');
  }

  // ===== Account / power-user (sessions, tokens, presence, integrations, sync) =====

  // (sessions: _handleAuthSessions / _handleAuthRevoke / _handleAuthLogoutAll further down)
  _handleTokensList(req, res) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    return this._json(res, { tokens: require('./api-tokens').listForUser(caller.userId) });
  }
  async _handleTokenCreate(req, res) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: true, ...require('./api-tokens').create(caller.userId, body.name) });
  }
  async _handleTokenRevoke(req, res) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: require('./api-tokens').revoke(caller.userId, String(body.id || '')) });
  }
  async _handlePresenceSet(req, res) {
    if (!this._requireAdmin(req, res)) return;
    const body = await this._readJsonBody(req);
    const presence = require('./presence');
    const config = presence.setConfig(body);
    try { presence.applyNow(this.client); } catch { /* */ }
    this.log('🎭 Bot presence updated', 'info', 'system', { subsystem: 'system', meta: config });
    return this._json(res, { ok: true, config });
  }
  async _handleLastfmSet(req, res) {
    if (!this._requireAdmin(req, res)) return;
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: true, status: require('./integrations-config').setLastfm(body) });
  }
  _handlePrefsGet(req, res) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    return this._json(res, require('./user-prefs').get(caller.userId) || { prefs: null, theme: null });
  }
  async _handlePrefsSet(req, res) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: true, ...require('./user-prefs').set(caller.userId, body) });
  }

  _clientMeta(req) {
    return { ip: req.socket?.remoteAddress || null, ua: String(req.headers['user-agent'] || '').slice(0, 300) };
  }

  // Same-site check for the sign-in POSTs (they change who is signed in).
  _sameSite(req) {
    const o = req.headers.origin;
    return !o || o === `http://${req.headers.host}` || o === `https://${req.headers.host}`;
  }

  async _handleAuthStart(req, res) {
    const body = await this._readJsonBody(req);
    const auth = require('./dashboard-auth');
    try {
      if (!auth.isConfigured()) {
        return this._json(res, { error: 'Discord sign-in is not set up yet. Paste the client secret on the Login page first.' }, 400);
      }
      // Built server-side so it always matches what's registered in the
      // Developer Portal (the client used to send this, and could get it wrong).
      // body.next = 'listen' brings friends back to the listen room afterwards.
      const { authUrl } = auth.startAuth(auth.callbackUrl(req.headers.host, this.port), body.next);
      return this._json(res, { ok: true, authUrl });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleAuthCallback(req, res, url) {
    const auth = require('./dashboard-auth');
    const meta = this._clientMeta(req);
    const back = (hash) => res.writeHead(302, { Location: `/dashboard.html#${hash}` }).end();
    // The user pressed "Cancel" on Discord's screen.
    if (url.searchParams.get('error')) {
      auth.recordEvent('failed', null, `cancelled: ${url.searchParams.get('error')}`, meta);
      return back('login_error=' + encodeURIComponent('Sign-in was cancelled.'));
    }
    const code = url.searchParams.get('code');
    const stateNonce = url.searchParams.get('state');
    if (!code || !stateNonce) return back('login_error=' + encodeURIComponent('Discord did not send a sign-in code.'));
    let result;
    try {
      result = await auth.completeAuth(code, stateNonce, meta);
    } catch (e) {
      auth.recordEvent('failed', null, e.message, meta);
      this.log(`✕ Panel sign-in failed: ${e.message}`, 'warn', 'system', { subsystem: 'system' });
      return back('login_error=' + encodeURIComponent(e.message));
    }
    const { token, user } = result;
    // back to where sign-in started: the listen room, the new dashboard (at /), or the classic one
    const home = result.next === 'listen' ? '/listen' : '/dashboard.html';
    let roleRow = null;
    try {
      const roles = require('./roles');
      roleRow = roles.noteLogin(user);
      if (roleRow?.rank === 'banned') {
        auth.logout(token);
        auth.recordEvent('denied', user, 'banned', meta);
        this.log(`✗ Banned user ${user.tag} (${user.userId}) tried to sign in`,
          'warn', 'system', { subsystem: 'system', meta: { userId: user.userId } });
        return back('banned=1');
      }
      if (roleRow?.rank === 'owner' && roleRow.grantedBy === 'bootstrap' && Date.now() - roleRow.grantedAt < 60000) {
        this.log(`👑 Bootstrap: ${user.tag} (${user.userId}) is now owner`, 'success', 'system',
          { subsystem: 'system', meta: { userId: user.userId, rank: 'owner' } });
      }
    } catch (e) {
      console.warn('[control-server] roles.noteLogin failed:', e.message);
    }
    auth.recordEvent('login', user, roleRow?.rank || null, meta);
    this.log(`🔐 ${user.tag} signed in to the panel${roleRow?.rank ? ` (${roleRow.rank})` : ''}`, 'info', 'system',
      { subsystem: 'system', meta: { userId: user.userId } });
    return res.writeHead(302, { Location: `${home}#maow_session=${encodeURIComponent(token)}` }).end();
  }

  _handleAuthMe(req, res) {
    const auth = require('./dashboard-auth');
    const extras = require('./panel-extras');
    const lock = { requireLogin: extras.loginRequired(), loginWanted: extras.loginWanted() };
    if (!auth.isConfigured()) {
      return this._json(res, {
        configured: false, ...lock,
        callbackUrl: auth.callbackUrl(req.headers.host, this.port),
        clientId: auth.clientId() || null,
      });
    }
    const user = this._maowSession(req);
    let rank = null;
    if (user) {
      try {
        const roles = require('./roles');
        if (roles.hasTable() && !roles.get(user.userId)) roles.noteLogin(user);
        rank = roles.rankOf(user.userId);
        if (rank === 'banned') {
          auth.logout(req.headers['x-maow-session'] || '');
          return this._json(res, { configured: true, ...lock, user: null, rank: 'banned', banned: true });
        }
      } catch { /* roles unavailable — fall through with null rank */ }
    }
    return this._json(res, {
      configured: true, ...lock, user: user ? { ...user, sessionId: undefined } : null, rank,
      callbackUrl: auth.callbackUrl(req.headers.host, this.port),
    });
  }

  async _handleAuthLogout(req, res) {
    await this._readJsonBody(req);
    const auth = require('./dashboard-auth');
    const token = req.headers['x-maow-session'] || '';
    const user = auth.lookup(token);
    auth.logout(token);
    if (user) auth.recordEvent('logout', user, null, this._clientMeta(req));
    return this._json(res, { ok: true });
  }

  async _handleAuthLogoutAll(req, res) {
    await this._readJsonBody(req);
    if (!this._sameSite(req)) return this._json(res, { error: 'Blocked: request came from another site.' }, 403);
    const auth = require('./dashboard-auth');
    const user = this._maowSession(req);
    if (!user) return this._json(res, { error: 'Not signed in.' }, 401);
    const n = auth.logoutAll(user.userId);
    auth.recordEvent('logout_all', user, `${n} device(s)`, this._clientMeta(req));
    return this._json(res, { ok: true, signedOut: n });
  }

  _handleAuthSessions(req, res) {
    const auth = require('./dashboard-auth');
    const user = this._maowSession(req);
    if (!user) return this._json(res, { error: 'Not signed in.' }, 401);
    return this._json(res, { sessions: auth.listSessions(user.userId, req.headers['x-maow-session']) });
  }

  async _handleAuthRevoke(req, res) {
    const body = await this._readJsonBody(req);
    if (!this._sameSite(req)) return this._json(res, { error: 'Blocked: request came from another site.' }, 403);
    const auth = require('./dashboard-auth');
    const user = this._maowSession(req);
    if (!user) return this._json(res, { error: 'Not signed in.' }, 401);
    const ok = auth.revokeSession(user.userId, String(body.id || ''));
    if (ok) auth.recordEvent('revoked', user, 'one device', this._clientMeta(req));
    return this._json(res, { ok });
  }

  // Login history. Admins see everyone's; others only their own.
  _handleAuthLogins(req, res, url) {
    const auth = require('./dashboard-auth');
    const user = this._maowSession(req);
    if (!user) return this._json(res, { error: 'Not signed in.' }, 401);
    let admin = false;
    try { admin = require('./roles').check(user.userId, 'admin'); } catch { /* */ }
    const all = admin && url.searchParams.get('all') === '1';
    return this._json(res, {
      events: auth.recentEvents({ limit: url.searchParams.get('limit') || 50, userId: all ? null : user.userId }),
      all,
    });
  }

  // First-time setup: paste the Discord client secret from the panel. Only
  // works while sign-in is NOT configured yet, from this panel itself, so it
  // can't be used to swap the secret later.
  async _handleAuthSetup(req, res) {
    const body = await this._readJsonBody(req);
    if (!this._sameSite(req)) return this._json(res, { error: 'Blocked: request came from another site.' }, 403);
    const auth = require('./dashboard-auth');
    if (auth.isConfigured()) return this._json(res, { error: 'Discord sign-in is already set up. Change it in .env if you need to.' }, 409);
    try {
      auth.setupSecret(body.secret);
      if (body.lock) auth.setEnv('PANEL_REQUIRE_LOGIN', '1');
      this.log('🔐 Discord sign-in was set up from the panel', 'success', 'system', { subsystem: 'system' });
      return this._json(res, { ok: true, callbackUrl: auth.callbackUrl(req.headers.host, this.port) });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  // Turn the login lock on/off. Owner only. Turning it ON needs a signed-in
  // owner (so you can't lock yourself out); OFF is allowed for the owner too.
  async _handleAuthLock(req, res) {
    const body = await this._readJsonBody(req);
    if (!this._sameSite(req)) return this._json(res, { error: 'Blocked: request came from another site.' }, 403);
    const auth = require('./dashboard-auth');
    const extras = require('./panel-extras');
    const user = this._maowSession(req);
    const me = extras.identify(req, this);
    const isOwner = user ? require('./roles').check(user.userId, 'owner') : (!extras.loginRequired() && me.rank === 'owner');
    if (!isOwner) return this._json(res, { error: 'Only the owner can change this.' }, 403);
    const on = !!body.on;
    if (on && !user) return this._json(res, { error: 'Sign in with Discord first, so you are not locked out.' }, 409);
    if (on && !auth.isConfigured()) return this._json(res, { error: 'Set up Discord sign-in first.' }, 409);
    auth.setEnv('PANEL_REQUIRE_LOGIN', on ? '1' : '0');
    this.log(`🔐 Panel login lock turned ${on ? 'ON' : 'OFF'}${user ? ` by ${user.tag}` : ''}`, 'warn', 'system', { subsystem: 'system' });
    return this._json(res, { ok: true, requireLogin: extras.loginRequired() });
  }

  // ===== v2.1.0 — Social =====

  _handleSocialProfile(req, res, url) {
    const social = require('./social');
    const guildId = url.searchParams.get('guildId');
    const userId = url.searchParams.get('userId') || this._maowSession(req)?.userId;
    if (!guildId || !userId) return this._json(res, { error: 'guildId + userId required.' }, 400);
    return this._json(res, { profile: social.getProfile(guildId, userId) });
  }

  async _handleSocialProfileSet(req, res) {
    const social = require('./social');
    const body = await this._readJsonBody(req);
    const user = this._maowSession(req);
    if (!user) return this._json(res, { error: 'Not logged in.' }, 401);
    if (!body.guildId) return this._json(res, { error: 'guildId required.' }, 400);
    const patch = {};
    if (typeof body.bio === 'string') patch.bio = body.bio.slice(0, 280);
    if (typeof body.favoriteSong === 'string') patch.favoriteSong = body.favoriteSong.slice(0, 200);
    if (typeof body.color === 'string') patch.color = body.color.slice(0, 20);
    // Auto-attach Discord identity
    patch.tag = user.tag;
    patch.avatar = user.avatar;
    return this._json(res, { profile: social.setProfile(body.guildId, user.userId, patch) });
  }

  _handleSocialLeaderboard(req, res, url) {
    const social = require('./social');
    const history = require('./history');
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    const limit = Math.max(5, Math.min(100, Number(url.searchParams.get('limit')) || 20));
    return this._json(res, { leaderboard: social.leaderboard(history, guildId, limit) });
  }

  _handleSocialTopRated(req, res, url) {
    const social = require('./social');
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    const limit = Math.max(5, Math.min(100, Number(url.searchParams.get('limit')) || 20));
    return this._json(res, { topRated: social.topRated(guildId, limit) });
  }

  _handleSocialRatings(req, res, url) {
    const social = require('./social');
    const guildId = url.searchParams.get('guildId');
    const songName = url.searchParams.get('song');
    if (!guildId || !songName) return this._json(res, { error: 'guildId + song required.' }, 400);
    return this._json(res, social.ratingsFor(guildId, songName));
  }

  async _handleSocialRate(req, res) {
    const social = require('./social');
    const body = await this._readJsonBody(req);
    const user = this._maowSession(req);
    if (!user) return this._json(res, { error: 'Not logged in.' }, 401);
    if (!body.guildId || !body.song || body.stars == null) {
      return this._json(res, { error: 'guildId + song + stars required.' }, 400);
    }
    try {
      const r = social.rate(body.guildId, user.userId, body.song, body.stars, body.note);
      return this._json(res, { ok: true, rating: r });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  // ===== v2.1.0 — Library cleanup =====

  _handleCleanupScan(req, res) {
    const cleanup = require('./library-cleanup');
    const library = require('./library');
    const history = require('./history');
    try {
      const report = cleanup.scan(library, history);
      return this._json(res, { ok: true, report });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleCleanupDeleteOrphans(req, res) {
    const cleanup = require('./library-cleanup');
    const body = await this._readJsonBody(req);
    if (!Array.isArray(body.files)) return this._json(res, { error: 'files[] required.' }, 400);
    try {
      const results = cleanup.deleteOrphans(body.files);
      this.log(`🧹 Cleanup: deleted ${results.filter((r) => r.ok).length}/${results.length} orphan files`,
        'info', 'library', { subsystem: 'library', meta: { results } });
      return this._json(res, { ok: true, results });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  // Remove chosen library songs (duplicates) by id.
  async _handleCleanupDeleteSongs(req, res) {
    const cleanup = require('./library-cleanup');
    const body = await this._readJsonBody(req);
    if (!Array.isArray(body.ids) || !body.ids.length) return this._json(res, { error: 'ids[] required.' }, 400);
    try {
      const results = cleanup.removeSongs(require('./library'), body.ids.slice(0, 2000));
      this.log(`🧹 Tidy-up: removed ${results.filter((r) => r.ok).length}/${results.length} duplicate songs`,
        'info', 'library', { subsystem: 'library', meta: { count: results.length } });
      return this._json(res, { ok: true, results });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleCleanupProbeMissing(req, res) {
    const cleanup = require('./library-cleanup');
    const library = require('./library');
    try {
      const result = await cleanup.probeMissing(library);
      this.log(`🩺 Cleanup: re-probed ${result.probed}/${result.attempted} missing durations`,
        'info', 'library', { subsystem: 'library', meta: result });
      return this._json(res, { ok: true, result });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
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
  _safeDecode(s) {
    try { return decodeURIComponent(s); } catch { return null; }
  }

  _serveLibraryFile(urlPath, req, res) {
    const decoded = this._safeDecode(urlPath.slice('/library/'.length));
    if (decoded == null) { res.writeHead(400).end('Bad file name'); return; }
    const file = path.basename(decoded);
    const entry = library.list().find((s) => s.file === file);
    if (!entry) { res.writeHead(404).end('Not found'); return; }
    this._streamFile(path.join(library.LIB_DIR, entry.file), req, res);
  }

  // Serve a soundboard file from data/sounds/. Path-traversal-safe via
  // basename + the startsWith(SOUND_DIR) check.
  _serveSoundFile(urlPath, req, res) {
    const SOUND_DIR = path.join(__dirname, '..', 'data', 'sounds');
    const decoded = this._safeDecode(urlPath.slice('/sounds/'.length));
    if (decoded == null) { res.writeHead(400).end('Bad file name'); return; }
    const file = path.basename(decoded);
    const full = path.join(SOUND_DIR, file);
    if (!full.startsWith(SOUND_DIR + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
    this._streamFile(full, req, res);
  }

  // The saved welcome sound (lib/welcome-intro.js), for the bot's own player.
  _serveWelcomeFile(urlPath, req, res) {
    const DIR = require('./welcome-intro').CACHE_DIR;
    const decoded = this._safeDecode(urlPath.slice('/welcome-cache/'.length));
    if (decoded == null) { res.writeHead(400).end('Bad file name'); return; }
    const full = path.join(DIR, path.basename(decoded));
    if (!full.startsWith(DIR + path.sep) || full.endsWith('.json')) { res.writeHead(403).end('Forbidden'); return; }
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
    // v3.0.0 — error-budget tracking + outage-alert dispatch.
    if (level === 'error') {
      try { require('./observability').recordError(entry); } catch { /* */ }
    }
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
        // People (not bots) in the bot's voice channel; drives the panel's motion tracker.
        listeners: queue.voice?.channel?.members?.filter?.((m) => !m.user?.bot)?.size || 0,
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
    // One measurement for every display (lib/latency.js). `websocket` keeps its
    // old name because both dashboards read it; it's the value to show.
    const p = require('./latency').get();
    return {
      websocket: p.ms,           // what the dashboards show: real round trip to Discord (null = not measured yet)
      network: p.network,        // TCP round trip to the gateway, median of the last 6 (every 10 s)
      heartbeat: p.heartbeat,    // Discord's heartbeat ack, median of the last 5 (one every ~41 s)
      source: p.source,
      rest: this._restPing,      // a full API request through discord.js: diagnostics only, always higher
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
        heapLimit: require('node:v8').getHeapStatistics().heap_size_limit, // true V8 ceiling
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
        autoplay: queue ? !!queue.autoplay : !!cfg.autoplay,
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

  // ===== v2.2.0 — Integrations + Dev =====

  _handleIntegrationsStatus(req, res) {
    const integrations = require('./integrations');
    return this._json(res, {
      lastfm: integrations.lastfmConfigured(),
      spotify: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      discordOauth: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
    });
  }

  _handleSearchUrls(req, res, url) {
    const integrations = require('./integrations');
    const title = url.searchParams.get('title') || '';
    const artist = url.searchParams.get('artist') || '';
    return this._json(res, integrations.searchUrls(title, artist));
  }

  _handleDevEndpoints(req, res) {
    // Self-documenting catalog of every endpoint. Drives the in-dashboard
    // API explorer.
    return this._json(res, {
      endpoints: [
        { method: 'GET', path: '/api/health', desc: 'Liveness + version (un-authed)' },
        { method: 'GET', path: '/api/library', desc: 'List songs + library stats' },
        { method: 'POST', path: '/api/library/install', desc: 'Install a single song from URL' },
        { method: 'POST', path: '/api/library/install-playlist', desc: 'Background playlist install' },
        { method: 'POST', path: '/api/library/probe-playlist', desc: 'Get playlist metadata without installing' },
        { method: 'GET', path: '/api/library/install-jobs', desc: 'List install jobs' },
        { method: 'POST', path: '/api/library/install-jobs/:id/cancel', desc: 'Cancel install job' },
        { method: 'GET', path: '/api/library/config', desc: 'Download config (concurrency, rate)' },
        { method: 'POST', path: '/api/library/config', desc: 'Save download config' },
        { method: 'POST', path: '/api/library/cleanup/scan', desc: 'Cleanup scan report' },
        { method: 'POST', path: '/api/library/cleanup/delete-orphans', desc: 'Delete orphan files' },
        { method: 'POST', path: '/api/library/cleanup/probe-missing', desc: 'Re-probe missing durations' },
        { method: 'GET', path: '/api/mod/bans', desc: 'List guild bans' },
        { method: 'POST', path: '/api/mod/ban', desc: 'Ban a user' },
        { method: 'POST', path: '/api/mod/unban', desc: 'Unban a user' },
        { method: 'POST', path: '/api/mod/kick', desc: 'Kick a member' },
        { method: 'POST', path: '/api/mod/timeout', desc: 'Timeout a member' },
        { method: 'GET', path: '/api/mod/warns', desc: 'Warnings per user' },
        { method: 'POST', path: '/api/mod/warn-clear', desc: 'Clear warnings' },
        { method: 'GET/POST', path: '/api/mod/automod', desc: 'Automod rule toggles' },
        { method: 'GET', path: '/api/mod/audit', desc: 'Discord audit log' },
        { method: 'GET', path: '/api/admin/members', desc: 'Paginated member browser' },
        { method: 'GET', path: '/api/admin/channels', desc: 'Channels grouped by category' },
        { method: 'POST', path: '/api/admin/channel-edit', desc: 'Edit channel' },
        { method: 'GET', path: '/api/admin/roles', desc: 'List roles' },
        { method: 'POST', path: '/api/admin/role-create|edit|delete', desc: 'Role CRUD' },
        { method: 'GET/POST', path: '/api/admin/speedtest', desc: 'Speedtest result cache' },
        { method: 'GET/POST', path: '/api/admin/welcome', desc: 'Welcome/farewell config' },
        { method: 'GET/POST', path: '/api/admin/reaction-roles[/create|delete]', desc: 'Reaction role CRUD' },
        { method: 'ALL', path: '/api/admin/playlist-subs[/add|update|remove|sync]', desc: 'Playlist subscriptions' },
        { method: 'GET', path: '/api/admin/heatmap', desc: 'Listening heatmap (byDay)' },
        { method: 'POST', path: '/api/auth/discord/start', desc: 'Begin Discord OAuth' },
        { method: 'GET', path: '/api/auth/discord/callback', desc: 'Complete OAuth (redirect target)' },
        { method: 'GET', path: '/api/auth/me', desc: 'Current session info' },
        { method: 'POST', path: '/api/auth/logout', desc: 'Drop current session' },
        { method: 'GET/POST', path: '/api/social/profile', desc: 'User profile read/write' },
        { method: 'GET', path: '/api/social/leaderboard', desc: 'Top listeners' },
        { method: 'GET', path: '/api/social/top-rated', desc: 'Top rated tracks' },
        { method: 'GET', path: '/api/social/ratings', desc: 'Ratings for a song' },
        { method: 'POST', path: '/api/social/rate', desc: 'Rate a song (1-5 stars)' },
        { method: 'GET', path: '/api/integrations/status', desc: 'Which integrations are configured' },
        { method: 'GET', path: '/api/integrations/search-urls', desc: 'Cross-service search URLs' },
        { method: 'GET', path: '/api/dev/endpoints', desc: 'This endpoint catalog' },
        { method: 'GET', path: '/api/dev/plugins', desc: 'Loaded plugins' },
        { method: 'GET', path: '/api/dev/db/tables', desc: 'SQLite table list + row counts + schema' },
        { method: 'POST', path: '/api/dev/db/query', desc: 'Run a SQL query against maow.db (write requires { write: true })' },
        // v3.2.0 — roles + posts (rank-gated)
        { method: 'GET',  path: '/api/roles/list',  desc: 'List all dashboard users + ranks (admin+ only)' },
        { method: 'POST', path: '/api/roles/grant', desc: 'Grant a rank to a user — { targetId, rank, notes? }' },
        { method: 'GET',  path: '/api/posts/list',  desc: 'List posts (signed-in users) — ?category=&limit=&offset=' },
        { method: 'GET',  path: '/api/posts/:id',   desc: 'Single post by ID (signed-in users)' },
        { method: 'POST', path: '/api/posts/create', desc: 'Publish a post (admin+) — { title, body, category, pinned? }' },
        { method: 'POST', path: '/api/posts/update', desc: 'Edit a post (admin+ or author) — { id, ...patch }' },
        { method: 'POST', path: '/api/posts/delete', desc: 'Delete a post (admin+) — { id }' },
      ],
    });
  }

  _handleDevPlugins(req, res) {
    const list = (this._plugins || []).map((p) => ({
      id: p.id, name: p.name, version: p.version,
      slashCommandCount: p.slashCommandCount,
      wsActionCount: p.wsActionCount,
      httpRouteCount: p.httpRouteCount,
    }));
    return this._json(res, { plugins: list, count: list.length });
  }

  // ===== v3.1.1 — In-dashboard DB browser =====
  // GET /api/dev/db/tables  → list user tables + row counts + schema SQL
  // POST /api/dev/db/query  → run a SQL query. READ-ONLY by default; pass
  //                           { write: true } to allow mutations (with a
  //                           strong client-side confirm). Results capped
  //                           at 1000 rows so a runaway SELECT can't ship
  //                           gigabytes.

  _handleDevDbTables(req, res) {
    let db;
    try { db = require('./db'); } catch { /* */ }
    if (!db?.isAvailable) {
      return this._json(res, { error: 'SQLite not loaded — bot is running on the JSON fallback path.', isAvailable: false });
    }
    try {
      const rows = db.raw.prepare(
        `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      ).all();
      const tables = rows.map((r) => {
        let count = null;
        try { count = db.raw.prepare(`SELECT COUNT(*) AS n FROM ${r.name}`).get().n; } catch { /* */ }
        return { name: r.name, count, sql: r.sql };
      });
      const schemaRow = db.raw.prepare(`SELECT value FROM _meta WHERE key = 'schema_version'`).get();
      return this._json(res, {
        isAvailable: true,
        path: db.path,
        schemaVersion: schemaRow?.value || null,
        tables,
      });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  // ===== v3.2.0 — Roles + Posts =====

  async _handleRolesList(req, res) {
    // v3.2.0 — admin+ only. The roles list leaks Discord user IDs + tags +
    // avatars, so it's not safe to expose to lower-ranked or unauth'd callers.
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    try {
      const roles = require('./roles');
      if (!roles.check(caller.userId, 'admin')) {
        return this._json(res, { error: 'Admin+ required.' }, 403);
      }
      const users = roles.list();
      // Root owners who never signed in have no name stored: ask Discord.
      await Promise.all(users.filter((u) => !u.tag).map(async (u) => {
        try {
          const d = await this.client.users.fetch(u.userId);
          u.tag = d.globalName || d.username;
          u.avatar = d.displayAvatarURL?.({ size: 64 }) || null;
        } catch { /* unknown user: the page shows "(unknown)" */ }
      }));
      // Return under both `users` and `roles` keys so older and newer clients
      // both work — the dashboard reads `data.users`.
      return this._json(res, { ok: true, users, roles: users, ladder: roles.LADDER });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleRolesGrant(req, res) {
    const body = await this._readJsonBody(req);
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    try {
      const roles = require('./roles');
      // Accept either `targetId` (dashboard v3.2+) or `userId` (legacy / direct API).
      const target = String(body.targetId || body.userId || '').trim();
      const newRank = String(body.rank || '').trim();
      const updated = roles.grant(caller.userId, target, newRank, body.notes);
      this.log(`⚖ ${caller.tag} set ${target} to ${newRank}`, 'info', 'system',
        { subsystem: 'system', meta: { caller: caller.userId, target, rank: newRank } });
      return this._json(res, { ok: true, role: updated });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  _handlePostsList(req, res, url) {
    // Any signed-in user can read posts. Unauth'd callers get 401 so the
    // post body content stays gated.
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    try {
      const posts = require('./posts');
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const category = url.searchParams.get('category') || null;
      return this._json(res, { ok: true, ...posts.list({ limit, offset, category }) });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  _handlePostsGet(req, res, urlPath) {
    // Same gating as the list endpoint — signed-in members only.
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    try {
      const id = Number(urlPath.match(/^\/api\/posts\/(\d+)$/)[1]);
      const posts = require('./posts');
      const post = posts.get(id);
      if (!post) return this._json(res, { error: 'Not found' }, 404);
      return this._json(res, { ok: true, post });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handlePostsCreate(req, res) {
    const body = await this._readJsonBody(req);
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    try {
      const posts = require('./posts');
      const post = posts.create(caller.userId, body);
      this.log(`📝 Post created: "${post.title}" by ${caller.tag}`, 'info', 'system',
        { subsystem: 'system', meta: { postId: post.id, authorId: caller.userId } });
      return this._json(res, { ok: true, post });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  async _handlePostsUpdate(req, res) {
    const body = await this._readJsonBody(req);
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    if (!body.id) return this._json(res, { error: 'id required.' }, 400);
    try {
      const posts = require('./posts');
      const post = posts.update(caller.userId, Number(body.id), body);
      return this._json(res, { ok: true, post });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  async _handlePostsDelete(req, res) {
    const body = await this._readJsonBody(req);
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    if (!body.id) return this._json(res, { error: 'id required.' }, 400);
    try {
      const posts = require('./posts');
      return this._json(res, { ok: posts.remove(caller.userId, Number(body.id)) });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  async _handleDevDbQuery(req, res) {
    let db;
    try { db = require('./db'); } catch { /* */ }
    if (!db?.isAvailable) {
      return this._json(res, { error: 'SQLite not loaded — no db to query.' }, 400);
    }
    const body = await this._readJsonBody(req);
    const sql = String(body.sql || '').trim();
    const allowWrite = !!body.write;
    if (!sql) return this._json(res, { error: 'sql required.' }, 400);
    // Tolerate trailing semicolon since users will paste them.
    const clean = sql.replace(/;\s*$/, '');
    const isRead = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(clean);
    try {
      if (isRead) {
        const stmt = db.raw.prepare(clean);
        // Cap at 1000 rows to keep the payload sensible.
        const all = stmt.all();
        const capped = all.length > 1000;
        const rows = capped ? all.slice(0, 1000) : all;
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return this._json(res, { ok: true, kind: 'read', columns, rows, capped, totalRows: all.length });
      }
      // Mutating SQL — require allowWrite + log it.
      if (!allowWrite) {
        return this._json(res, {
          error: 'Non-SELECT query requires { write: true } in the request body. The UI prompts for confirmation.',
        }, 400);
      }
      this.log(`⚠ Dashboard SQL write: ${clean.slice(0, 200)}`, 'warn', 'system',
        { subsystem: 'system', meta: { sql: clean.slice(0, 1000) } });
      const info = db.raw.prepare(clean).run();
      return this._json(res, { ok: true, kind: 'write', changes: info.changes, lastInsertRowid: String(info.lastInsertRowid) });
    } catch (e) {
      return this._json(res, { error: e.message }, 400);
    }
  }

  // ===== v2.3.0 — Backup / DR =====

  _handleBackupList(req, res) {
    const backup = require('./backup');
    return this._json(res, { snapshots: backup.list() });
  }

  _handleBackupCreate(req, res) {
    const backup = require('./backup');
    try {
      const snap = backup.create();
      this.log(`✓ Snapshot created: ${snap.name}`, 'success', 'system',
        { subsystem: 'system', meta: snap });
      return this._json(res, { ok: true, snapshot: snap });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleBackupRestore(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.name) return this._json(res, { error: 'name required.' }, 400);
    try {
      const backup = require('./backup');
      const result = backup.restore(body.name, { dryRun: !!body.dryRun });
      this.log(`${body.dryRun ? '◐ Dry-run' : '↺ Restored'} snapshot: ${body.name} (${result.restored} files)`,
        'warn', 'system', { subsystem: 'system', meta: result });
      return this._json(res, { ok: true, ...result });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleBackupDelete(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.name) return this._json(res, { error: 'name required.' }, 400);
    try {
      const backup = require('./backup');
      const ok = backup.remove(body.name);
      return this._json(res, { ok });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  // ===== v2.3.0 — Marketplace =====

  _handleMarketList(req, res) {
    const market = require('./marketplace');
    return this._json(res, { bundles: market.list() });
  }

  async _handleMarketExport(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.kind || !body.guildId) return this._json(res, { error: 'kind + guildId required.' }, 400);
    try {
      const market = require('./marketplace');
      let bundle;
      switch (body.kind) {
        case 'playlist':
          if (!body.userId || !body.name) throw new Error('playlist export requires userId + name');
          bundle = market.exportPlaylist(body.guildId, body.userId, body.name);
          break;
        case 'automod':
          bundle = market.exportAutomod(body.guildId, body.label);
          break;
        case 'welcome':
          bundle = market.exportWelcome(body.guildId, body.label);
          break;
        default: throw new Error(`Unknown kind: ${body.kind}`);
      }
      if (body.description) bundle.description = String(body.description).slice(0, 280);
      return this._json(res, { ok: true, bundle });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  async _handleMarketSave(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.bundle) return this._json(res, { error: 'bundle required.' }, 400);
    try {
      const market = require('./marketplace');
      const file = market.save(body.bundle);
      return this._json(res, { ok: true, file });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleMarketImport(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.guildId) return this._json(res, { error: 'guildId required.' }, 400);
    try {
      const market = require('./marketplace');
      // Accept either an inline `bundle` object or a `bundleFile` to load
      // from the local registry. Dashboard's apply flow uses bundleFile.
      let bundle = body.bundle;
      if (!bundle && body.bundleFile) bundle = market.read(body.bundleFile);
      if (!bundle) return this._json(res, { error: 'bundle or bundleFile required.' }, 400);
      const userId = body.userId || this._maowSession(req)?.userId;
      const result = market.importBundle(body.guildId, userId, bundle);
      this.log(`✓ Imported bundle "${result.name}" (${result.kind})`, 'success', 'library',
        { subsystem: 'library', meta: result });
      return this._json(res, { ok: true, result });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  async _handleMarketDelete(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.file) return this._json(res, { error: 'file required.' }, 400);
    try {
      const market = require('./marketplace');
      const ok = market.remove(body.file);
      return this._json(res, { ok });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleMarketFetch(req, res) {
    const body = await this._readJsonBody(req);
    if (!body.url) return this._json(res, { error: 'url required.' }, 400);
    try {
      const market = require('./marketplace');
      const bundle = await market.fetchBundle(body.url);
      return this._json(res, { ok: true, bundle });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  // ===== v2.4.0 — Music Wrapped =====
  _handleWrappedGet(req, res, url) {
    const wrapped = require('./wrapped');
    const guildId = url.searchParams.get('guildId');
    const year = url.searchParams.get('year');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    return this._json(res, wrapped.buildWrapped(guildId, year ? Number(year) : null));
  }
  _handleWrappedYears(req, res, url) {
    const wrapped = require('./wrapped');
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    return this._json(res, { years: wrapped.availableYears(guildId) });
  }

  // ===== v2.5.0 — Automation =====
  _handleAutomationList(req, res) {
    const a = require('./automation');
    return this._json(res, { crons: a.listCrons(), webhooks: a.listWebhooks(), rules: a.listRules() });
  }
  async _handleAutomationCronAdd(req, res) {
    const a = require('./automation');
    const body = await this._readJsonBody(req);
    try { return this._json(res, { ok: true, cron: a.addCron(body) }); }
    catch (e) { return this._json(res, { error: e.message }, 400); }
  }
  async _handleAutomationCronRemove(req, res) {
    const a = require('./automation');
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: a.removeCron(body.id) });
  }
  async _handleAutomationCronToggle(req, res) {
    const a = require('./automation');
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: true, cron: a.toggleCron(body.id, body.enabled) });
  }
  async _handleAutomationWebhookAdd(req, res) {
    const a = require('./automation');
    const body = await this._readJsonBody(req);
    try { return this._json(res, { ok: true, webhook: a.addWebhook(body) }); }
    catch (e) { return this._json(res, { error: e.message }, 400); }
  }
  async _handleAutomationWebhookRemove(req, res) {
    const a = require('./automation');
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: a.removeWebhook(body.id) });
  }
  async _handleAutomationRuleAdd(req, res) {
    const a = require('./automation');
    const body = await this._readJsonBody(req);
    try { return this._json(res, { ok: true, rule: a.addRule(body) }); }
    catch (e) { return this._json(res, { error: e.message }, 400); }
  }
  async _handleAutomationRuleRemove(req, res) {
    const a = require('./automation');
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: a.removeRule(body.id) });
  }
  _handleAutomationHookGet(req, res, urlPath) {
    // GET is just an inspection — return whether the secret matches a hook.
    const a = require('./automation');
    const secret = urlPath.slice('/api/automation/hook/'.length);
    const hook = a.findWebhookBySecret(secret);
    if (!hook) return this._json(res, { ok: false }, 404);
    return this._json(res, { ok: true, name: hook.name, hitCount: hook.hitCount });
  }
  async _handleAutomationHookFire(req, res, urlPath) {
    const a = require('./automation');
    const secret = urlPath.slice('/api/automation/hook/'.length);
    const hook = a.findWebhookBySecret(secret);
    if (!hook) return this._json(res, { error: 'unknown webhook' }, 404);
    try {
      if (hook.action?.type === 'console' && hook.action.line) {
        await this.runConsoleLine(String(hook.action.line), hook.guildId);
      } else if (hook.action?.type === 'log') {
        this.log(`[webhook] ${hook.name}: ${hook.action.text || ''}`, 'info', 'system', { subsystem: 'system' });
      }
      a.noteWebhookHit(hook.id);
      return this._json(res, { ok: true });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  // ===== v2.6.0 — Economy =====
  // Resolve a userId to a display tag + avatar from the bot's caches.
  _resolveUserMeta(guildId, userId) {
    const guild = this._resolveGuild(guildId);
    const member = guild?.members?.cache?.get(userId);
    const u = member?.user || this.client.users.cache.get(userId);
    return {
      tag: member?.displayName || u?.globalName || u?.username || null,
      avatar: u?.displayAvatarURL?.({ size: 64 }) || null,
    };
  }

  _handleEconomyLeaderboard(req, res, url) {
    const econ = require('./economy');
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    // Enrich each row with a display name + avatar + the XP needed for the
    // next level, so the dashboard can show usernames and progress bars.
    const leaderboard = econ.leaderboard(guildId, 20).map((u) => ({
      ...u,
      ...this._resolveUserMeta(guildId, u.userId),
      nextLevelXp: econ.xpForLevel(u.level),
    }));
    return this._json(res, { leaderboard });
  }
  _handleEconomyMe(req, res, url) {
    const econ = require('./economy');
    const guildId = url.searchParams.get('guildId');
    const user = this._maowSession(req);
    if (!user) return this._json(res, { error: 'not logged in' }, 401);
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    const u = econ.getUser(guildId, user.userId);
    return this._json(res, {
      user: { ...u, ...this._resolveUserMeta(guildId, user.userId), nextLevelXp: econ.xpForLevel(u.level) },
    });
  }
  _handleEconomyShop(req, res, url) {
    const econ = require('./economy');
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    return this._json(res, { shop: econ.getShop(guildId) });
  }
  async _handleEconomySpend(req, res) {
    const econ = require('./economy');
    const body = await this._readJsonBody(req);
    const user = this._maowSession(req);
    if (!user) return this._json(res, { error: 'not logged in' }, 401);
    try { return this._json(res, { ok: true, ...econ.spend(body.guildId, user.userId, Number(body.coins), body.label) }); }
    catch (e) { return this._json(res, { error: e.message }, 400); }
  }
  async _handleEconomyShopAdd(req, res) {
    const econ = require('./economy');
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: true, item: econ.addShopItem(body.guildId, body) });
  }
  async _handleEconomyShopSeed(req, res) {
    const econ = require('./economy');
    const body = await this._readJsonBody(req);
    const guildId = body.guildId;
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    const DEFAULTS = [
      { name: '🎵 Song Skip Token',        cost: 250,   description: 'Force-skip the current song once.' },
      { name: '⏭️ Queue Priority',          cost: 500,   description: 'Jump your next request to the top of the queue.' },
      { name: '🎨 Custom Role Color',       cost: 1000,  description: 'Pick a custom color for your role.' },
      { name: '✨ Custom Nickname',         cost: 750,   description: 'Set a special nickname for yourself.' },
      { name: '🔊 Priority Speaker (1d)',   cost: 1200,  description: 'Priority speaker in voice for 24 hours.' },
      { name: '📌 Pin a Message',           cost: 300,   description: 'Pin one message of your choice.' },
      { name: '🎤 Personal Intro Sound',    cost: 2000,  description: 'A sound that plays when you join voice.' },
      { name: '🌟 VIP Role (7d)',           cost: 5000,  description: 'Temporary VIP access for a week.' },
      { name: '🎲 Mystery Box',             cost: 800,   description: 'A random reward — coins or an item.' },
      { name: '💎 Double XP (1h)',          cost: 1500,  description: '2× XP gain for one hour.' },
      { name: '🏷️ Custom Tag',              cost: 600,   description: 'A custom tag shown next to your name.' },
      { name: '🎉 Announcement Shoutout',   cost: 400,   description: 'A shoutout in the announcements channel.' },
      { name: '🔔 Ping Exemption (1d)',     cost: 350,   description: 'Skip one mass ping for a day.' },
      { name: '🎧 Reserved Queue Slot',     cost: 1100,  description: 'Reserve a permanent queue slot.' },
      { name: '👑 Server Royalty (24h)',    cost: 10000, description: 'Be crowned server royalty for a day.' },
    ];
    try {
      const existing = econ.getShop(guildId);
      const have = new Set(existing.map((i) => i.name));
      const added = [];
      for (const item of DEFAULTS) {
        if (!have.has(item.name)) added.push(econ.addShopItem(guildId, item));
      }
      this.log(`🛍️ Seeded ${added.length} default shop items for guild ${guildId}`, 'info', 'system',
        { subsystem: 'system', meta: { guildId, added: added.length } });
      return this._json(res, { ok: true, added: added.length, shop: econ.getShop(guildId) });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleEconomyShopRemove(req, res) {
    const econ = require('./economy');
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: econ.removeShopItem(body.guildId, body.id) });
  }

  // ===== v2.6.0 — Custom commands =====
  _handleCustomCmdsList(req, res, url) {
    const cc = require('./custom-commands');
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    return this._json(res, { commands: cc.listFor(guildId) });
  }
  async _handleCustomCmdsAdd(req, res) {
    const cc = require('./custom-commands');
    const body = await this._readJsonBody(req);
    try { return this._json(res, { ok: true, command: cc.add(body.guildId, body) }); }
    catch (e) { return this._json(res, { error: e.message }, 400); }
  }
  async _handleCustomCmdsRemove(req, res) {
    const cc = require('./custom-commands');
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: cc.remove(body.guildId, body.name) });
  }
  async _handleCustomCmdsRun(req, res) {
    const cc = require('./custom-commands');
    const body = await this._readJsonBody(req);
    const cmd = cc.find(body.guildId, body.name);
    if (!cmd) return this._json(res, { error: 'unknown command' }, 404);
    const user = this._maowSession(req);
    const text = cc.render(cmd.template, {
      user: user?.tag || 'anon',
      server: body.serverName || '',
      args: body.args || [],
    });
    cc.noteRun(body.guildId, body.name);
    return this._json(res, { ok: true, text, embed: cmd.embed });
  }

  // ===== v2.7.0 — Game night =====
  _handleGameSessions(req, res, url) {
    const gn = require('./game-night');
    const guildId = url.searchParams.get('guildId');
    return this._json(res, { sessions: gn.listSessions(guildId) });
  }

  // ===== v2.7.0 — Server templates =====
  _handleTemplatesBuild(req, res, url) {
    const t = require('./server-templates');
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    return this._json(res, { template: t.buildTemplate(guildId, url.searchParams.get('name'), url.searchParams.get('description')) });
  }
  async _handleAlertFire(req, res) {
    const body = await this._readJsonBody(req);
    try {
      await require('./observability').fireManual(body.title || 'Manual alert', body.description || '');
      return this._json(res, { ok: true });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  // ===== Per-server bot config (Settings → Player & Bot) =====

  _handleGuildConfigGet(req, res, url) {
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    const cfg = getGuild(guildId);
    return this._json(res, {
      volume: cfg.volume ?? 100,
      stay247: !!cfg.stay247,
      sponsorblock: !!cfg.sponsorblock,
      djOnly: !!cfg.djOnly,
      prefix: cfg.prefix ?? '/',
      language: cfg.language ?? cfg.locale ?? 'en',
      announceNowPlaying: cfg.announceNowPlaying !== false,
      hideRequester: !!cfg.hideRequester,
      maxQueue: cfg.maxQueue ?? 0,
      voteSkip: cfg.voteSkip ?? 0,
      preventDuplicates: !!cfg.preventDuplicates,
    });
  }

  async _handleGuildConfigSet(req, res) {
    if (!this._requireAdmin(req, res)) return;
    const body = await this._readJsonBody(req);
    const guildId = body.guildId;
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    const patch = {};
    if (body.volume != null) patch.volume = Math.max(0, Math.min(150, Number(body.volume) || 100));
    if (typeof body.stay247 === 'boolean') patch.stay247 = body.stay247;
    if (typeof body.sponsorblock === 'boolean') patch.sponsorblock = body.sponsorblock;
    if (typeof body.djOnly === 'boolean') patch.djOnly = body.djOnly;
    if (typeof body.prefix === 'string') patch.prefix = body.prefix.slice(0, 8);
    if (typeof body.language === 'string') patch.language = body.language.slice(0, 5);
    if (typeof body.announceNowPlaying === 'boolean') patch.announceNowPlaying = body.announceNowPlaying;
    if (typeof body.hideRequester === 'boolean') patch.hideRequester = body.hideRequester;
    if (body.maxQueue != null) patch.maxQueue = Math.max(0, Math.min(10000, Number(body.maxQueue) || 0));
    if (body.voteSkip != null) patch.voteSkip = Math.max(0, Math.min(100, Number(body.voteSkip) || 0));
    if (typeof body.preventDuplicates === 'boolean') patch.preventDuplicates = body.preventDuplicates;
    updateGuild(guildId, patch);
    this.log(`⚙ Guild config updated (${Object.keys(patch).join(', ') || 'none'})`, 'info', 'system',
      { subsystem: 'system', meta: { guildId, patch } });
    return this._json(res, { ok: true });
  }

  // ===== Creator tools (embed/announce) + reminders =====

  async _handleChannelSend(req, res) {
    if (!this._requireAdmin(req, res)) return;
    const body = await this._readJsonBody(req);
    const guild = this._resolveGuild(body.guildId);
    if (!guild) return this._json(res, { error: 'Guild not found.' }, 404);
    const channel = guild.channels.cache.get(String(body.channelId || ''));
    if (!channel?.isTextBased?.()) return this._json(res, { error: 'Text channel not found.' }, 404);
    try {
      const payload = {};
      let content = body.content ? String(body.content).slice(0, 1900) : '';
      if (body.mention) content = `${body.mention} ${content}`.trim();
      if (content) payload.content = content;
      const em = body.embed;
      if (em && (em.title || em.description)) {
        const e = {};
        if (em.title) e.title = String(em.title).slice(0, 256);
        if (em.description) e.description = String(em.description).slice(0, 4000);
        if (em.color) { const n = parseInt(String(em.color).replace('#', ''), 16); if (!Number.isNaN(n)) e.color = n; }
        if (em.footer) e.footer = { text: String(em.footer).slice(0, 2048) };
        if (em.image) e.image = { url: String(em.image) };
        if (em.thumbnail) e.thumbnail = { url: String(em.thumbnail) };
        if (em.author) e.author = { name: String(em.author).slice(0, 256) };
        if (Array.isArray(em.fields)) {
          e.fields = em.fields.filter((f) => f.name && f.value).slice(0, 25)
            .map((f) => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline }));
        }
        payload.embeds = [e];
      }
      if (!payload.content && !payload.embeds) return this._json(res, { error: 'Nothing to send.' }, 400);
      await channel.send(payload);
      this.log(`📣 Dashboard sent a message to #${channel.name}`, 'info', 'command', { subsystem: 'discord', meta: { guildId: guild.id, channelId: channel.id } });
      return this._json(res, { ok: true });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handleReminderAdd(req, res) {
    const caller = this._maowSession(req);
    const body = await this._readJsonBody(req);
    const reminder = {
      id: 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      text: String(body.text || '').slice(0, 500),
      fireAt: Number(body.fireAt) || Date.now() + 3600000,
      userId: caller?.userId || body.userId || null,
      channelId: body.channelId || null,
      guildId: body.guildId || null,
      createdAt: Date.now(),
    };
    require('./reminders').add(reminder);
    return this._json(res, { ok: true, reminder });
  }
  async _handleReminderRemove(req, res) {
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: require('./reminders').remove(body.id) });
  }

  // ===== Community systems (suggestions, polls, giveaways, tickets, appeals) =====

  async _handleSuggestions(req, res, urlPath) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    const m = require('./suggestions');
    const action = urlPath.split('/').pop();
    try {
      if (action === 'add') return this._json(res, { ok: true, suggestion: m.add(body.guildId, { text: body.text, authorId: caller.userId, authorTag: caller.tag }) });
      if (action === 'vote') return this._json(res, { ok: true, suggestion: m.vote(body.guildId, body.id, caller.userId, body.dir) });
      if (action === 'status') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: true, suggestion: m.setStatus(body.guildId, body.id, body.status) }); }
      if (action === 'remove') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: m.remove(body.guildId, body.id) }); }
    } catch (e) { return this._json(res, { error: e.message }, 400); }
    return this._json(res, { error: 'Unknown action' }, 404);
  }

  async _handlePolls(req, res, urlPath) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    const m = require('./polls');
    const action = urlPath.split('/').pop();
    try {
      if (action === 'create') return this._json(res, { ok: true, poll: m.create(body.guildId, { question: body.question, options: body.options, authorId: caller.userId }) });
      if (action === 'vote') return this._json(res, { ok: true, poll: m.vote(body.guildId, body.id, Number(body.optionIdx), caller.userId) });
      if (action === 'close') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: true, poll: m.close(body.guildId, body.id) }); }
      if (action === 'remove') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: m.remove(body.guildId, body.id) }); }
    } catch (e) { return this._json(res, { error: e.message }, 400); }
    return this._json(res, { error: 'Unknown action' }, 404);
  }

  async _handleGiveaways(req, res, urlPath) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    const m = require('./giveaways');
    const action = urlPath.split('/').pop();
    try {
      if (action === 'create') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: true, giveaway: m.create(body.guildId, { prize: body.prize, winners: body.winners, endsAt: body.endsAt, authorId: caller.userId }) }); }
      if (action === 'enter') return this._json(res, { ok: true, giveaway: m.enter(body.guildId, body.id, caller.userId) });
      if (action === 'draw') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: true, giveaway: m.draw(body.guildId, body.id) }); }
      if (action === 'remove') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: m.remove(body.guildId, body.id) }); }
    } catch (e) { return this._json(res, { error: e.message }, 400); }
    return this._json(res, { error: 'Unknown action' }, 404);
  }

  async _handleTickets(req, res, urlPath) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    const m = require('./tickets');
    const action = urlPath.split('/').pop();
    try {
      if (action === 'open') return this._json(res, { ok: true, ticket: m.open(body.guildId, { subject: body.subject, openedBy: caller.userId, openedTag: caller.tag, channelId: body.channelId }) });
      if (action === 'claim') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: true, ticket: m.claim(body.guildId, body.id, caller.userId, caller.tag) }); }
      if (action === 'close') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: true, ticket: m.close(body.guildId, body.id) }); }
      if (action === 'remove') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: m.remove(body.guildId, body.id) }); }
    } catch (e) { return this._json(res, { error: e.message }, 400); }
    return this._json(res, { error: 'Unknown action' }, 404);
  }

  async _handleAppeals(req, res, urlPath) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    const m = require('./appeals');
    const action = urlPath.split('/').pop();
    try {
      if (action === 'submit') return this._json(res, { ok: true, appeal: m.submit(body.guildId, { userId: caller.userId, userTag: caller.tag, reason: body.reason, type: body.type }) });
      if (action === 'resolve') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: true, appeal: m.resolve(body.guildId, body.id, body.status, caller.tag, body.note) }); }
      if (action === 'remove') { if (!this._requireAdmin(req, res)) return; return this._json(res, { ok: m.remove(body.guildId, body.id) }); }
    } catch (e) { return this._json(res, { error: e.message }, 400); }
    return this._json(res, { error: 'Unknown action' }, 404);
  }

  // ===== Music pages (lyrics, soundboard, playlists) =====

  async _handleLyrics(req, res, url) {
    const q = url.searchParams.get('q');
    if (!q) return this._json(res, { error: 'q required.' }, 400);
    try {
      const Genius = require('genius-lyrics');
      const genius = new Genius.Client(process.env.GENIUS_TOKEN || undefined);
      const results = await genius.songs.search(q);
      const song = results?.[0];
      if (!song) return this._json(res, { error: 'No lyrics found.' }, 404);
      const lyrics = await song.lyrics();
      return this._json(res, {
        title: song.title, artist: song.artist?.name || null,
        thumbnail: song.thumbnail || null, url: song.url || null, lyrics,
      });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  _handleSoundsList(req, res) {
    const SOUND_DIR = path.join(__dirname, '..', 'data', 'sounds');
    let sounds = [];
    try {
      if (fs.existsSync(SOUND_DIR)) {
        sounds = fs.readdirSync(SOUND_DIR)
          .filter((f) => /\.(mp3|wav|ogg|m4a|opus)$/i.test(f))
          .map((f) => ({ name: path.basename(f, path.extname(f)), file: f }));
      }
    } catch { /* */ }
    return this._json(res, { sounds });
  }

  async _handleSoundPlay(req, res) {
    const body = await this._readJsonBody(req);
    const SOUND_DIR = path.join(__dirname, '..', 'data', 'sounds');
    const safe = path.basename(String(body.file || ''));
    if (!safe || !fs.existsSync(path.join(SOUND_DIR, safe))) return this._json(res, { error: 'Sound not found.' }, 404);
    const voice = body.guildId ? this.distube.voices.get(body.guildId) : null;
    if (!voice?.channel) return this._json(res, { error: 'Bot is not in a voice channel. Use /play or /sb in Discord first.' }, 400);
    try {
      await this.distube.play(voice.channel, this._soundUrl(safe), { textChannel: voice.textChannel });
      return this._json(res, { ok: true });
    } catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  _handlePlaylistsList(req, res, url) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const guildId = url.searchParams.get('guildId');
    if (!guildId) return this._json(res, { error: 'guildId required.' }, 400);
    try { return this._json(res, { playlists: require('./playlists').listFor(guildId, caller.userId) }); }
    catch (e) { return this._json(res, { error: e.message }, 500); }
  }

  async _handlePlaylistPlay(req, res) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    const pl = require('./playlists').load(body.guildId, caller.userId, body.name);
    const urls = pl?.urls || pl?.songs || [];
    if (!urls.length) return this._json(res, { error: 'Playlist empty or not found.' }, 404);
    const voice = this.distube.voices.get(body.guildId);
    if (!voice?.channel) return this._json(res, { error: 'Bot is not in a voice channel.' }, 400);
    let queued = 0;
    for (const u of urls.slice(0, 100)) {
      try { await this.distube.play(voice.channel, u); queued++; } catch { /* skip bad url */ }
    }
    return this._json(res, { ok: true, queued });
  }

  async _handlePlaylistDelete(req, res) {
    const caller = this._maowSession(req);
    if (!caller) return this._json(res, { error: 'Not signed in.' }, 401);
    const body = await this._readJsonBody(req);
    return this._json(res, { ok: require('./playlists').remove(body.guildId, caller.userId, body.name) });
  }

  // ===== Diagnostics ops console =====

  async _handleDiagVersions(req, res) {
    const ops = require('./ops');
    return this._json(res, { deps: ops.depVersions(), binaries: await ops.binaryVersions() });
  }

  _handleDiagDbStats(req, res) {
    let db;
    try { db = require('./db'); } catch { /* */ }
    if (!db?.isAvailable) return this._json(res, { available: false });
    const sizeOf = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
    const dbPath = db.path;
    let tables = [];
    try {
      const names = db.raw.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      ).all();
      tables = names.map((n) => {
        let rows = 0;
        try { rows = db.raw.prepare(`SELECT COUNT(*) AS c FROM "${n.name}"`).get().c; } catch { /* */ }
        return { name: n.name, rows };
      });
    } catch { /* */ }
    return this._json(res, {
      available: true,
      path: dbPath,
      sizeBytes: sizeOf(dbPath),
      walBytes: sizeOf(`${dbPath}-wal`),
      shmBytes: sizeOf(`${dbPath}-shm`),
      tables,
    });
  }

  async _handleDiagRestart(req, res) {
    if (!this._requireAdmin(req, res)) return;
    this.log('↻ Dashboard requested bot restart', 'warn', 'system', { subsystem: 'system' });
    this._json(res, { ok: true, message: 'Restarting…' });
    // Respawn a detached copy of this process, then exit. Works for a bare
    // `npm start` (no supervisor needed) — the new process runs in background.
    setTimeout(() => {
      try {
        const { spawn } = require('node:child_process');
        spawn(process.argv[0], process.argv.slice(1), {
          detached: true, stdio: 'ignore', cwd: process.cwd(), env: process.env,
        }).unref();
      } catch (e) { console.error('[restart] respawn failed:', e.message); }
      process.exit(0);
    }, 400);
  }

  _handleDiagReconnect(req, res) {
    if (!this._requireAdmin(req, res)) return;
    this.log('↻ Dashboard requested Discord reconnect', 'warn', 'discord', { subsystem: 'discord' });
    // Respond first — destroy/login takes time and we don't want the HTTP
    // request to hang. Then attempt a soft reconnect; if the gateway doesn't
    // come back within 8s (discord.js v14's destroy() is effectively terminal),
    // respawn the process so the bot ALWAYS returns.
    this._json(res, { ok: true, message: 'Reconnecting to Discord…' });

    const respawn = () => {
      try {
        const { spawn } = require('node:child_process');
        spawn(process.argv[0], process.argv.slice(1), {
          detached: true, stdio: 'ignore', cwd: process.cwd(), env: process.env,
        }).unref();
      } catch (e) { console.error('[reconnect] respawn failed:', e.message); }
      process.exit(0);
    };

    setTimeout(async () => {
      const watchdog = setTimeout(() => {
        this.log('↻ Soft reconnect timed out — respawning process', 'warn', 'discord', { subsystem: 'discord' });
        respawn();
      }, 8000);
      try {
        await this.client.destroy();
        await this.client.login(process.env.DISCORD_TOKEN);
        clearTimeout(watchdog);
        this.log('✓ Discord reconnected', 'success', 'discord', { subsystem: 'discord' });
      } catch (e) {
        clearTimeout(watchdog);
        this.log(`↻ Soft reconnect failed (${e.message}) — respawning`, 'warn', 'discord', { subsystem: 'discord' });
        respawn();
      }
    }, 300);
  }

  async _handleDiagGc(req, res) {
    if (!this._requireAdmin(req, res)) return;
    const before = process.memoryUsage().heapUsed;
    let gcRan = false;
    try { if (global.gc) { global.gc(); gcRan = true; } } catch { /* */ }
    const cleared = [];
    for (const mod of ['./sponsorblock', './spotify-features']) {
      try {
        const m = require(mod);
        if (typeof m.clearCache === 'function') { m.clearCache(); cleared.push(mod.replace('./', '')); }
      } catch { /* */ }
    }
    const after = process.memoryUsage().heapUsed;
    this.log(`🧹 GC / cache clear (freed ~${Math.max(0, Math.round((before - after) / 1048576))} MB)`,
      'info', 'system', { subsystem: 'system' });
    return this._json(res, { ok: true, gcRan, freedBytes: Math.max(0, before - after), cleared });
  }

  // Admin gate for destructive controls: a signed-in admin+, or (single-operator
  // local setups) when OAuth isn't configured at all.
  _requireAdmin(req, res) {
    const caller = this._maowSession(req);
    try {
      const roles = require('./roles');
      if (caller && roles.check(caller.userId, 'admin')) return true;
    } catch { /* roles unavailable */ }
    try {
      const auth = require('./dashboard-auth');
      if (!auth.isConfigured()) return true;
    } catch { /* */ }
    this._json(res, { error: 'Admin+ required for this control.' }, 403);
    return false;
  }

  async _handleTemplatesApply(req, res) {
    const t = require('./server-templates');
    const body = await this._readJsonBody(req);
    if (!body.guildId || !body.template) return this._json(res, { error: 'guildId + template required.' }, 400);
    try {
      const result = t.applyTemplate(body.guildId, body.template, { includeChannelIds: !!body.includeChannelIds });
      this.log(`✓ Applied template "${body.template.name}" to ${body.guildId}`, 'success', 'library',
        { subsystem: 'library', meta: result });
      return this._json(res, { ok: true, ...result });
    } catch (e) { return this._json(res, { error: e.message }, 400); }
  }

  // ===== DisTube events =====
  hookDisTube() {
    const meta = (q, s) => ({ guild: q?.id, song: s?.name, url: s?.url, source: s?.source });
    this.distube
      .on('playSong', (q, s) => {
        this.log(`▶ Playing: ${s.name}`, 'info', 'play', { subsystem: 'distube', meta: meta(q, s) });
        // v2.2.0 — Last.fm scrobble (fire-and-forget). Discord activity is
        // handled separately by lib/presence.js.
        try {
          const integrations = require('./integrations');
          if (integrations.lastfmConfigured()) {
            integrations.nowPlaying({
              artist: s.uploader?.name || s.member?.displayName,
              track: s.name,
              durationSec: s.duration,
            });
            // Scrobble after the track is half done (Last.fm rule of thumb)
            // — but we don't have a "playback midway" event, so do it after
            // a fraction of the song's reported duration.
            const delay = Math.max(30, Math.min(240, Math.round((s.duration || 180) / 2))) * 1000;
            setTimeout(() => {
              integrations.scrobble({
                artist: s.uploader?.name || s.member?.displayName,
                track: s.name,
                durationSec: s.duration,
              }).catch(() => { /* */ });
            }, delay);
          }
        } catch { /* */ }
      })
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
      // DisTube v5 emits 'error' as (error, queue, song). (Older versions used
      // (channel, error), which is why this used to log "[object Object]".)
      .on('error', (a, b, song) => {
        const err = a instanceof Error ? a : (b instanceof Error ? b : a);
        const queue = a instanceof Error ? b : null;
        this.log(`▲ DisTube error: ${err?.message || String(err)}${song?.name ? ` (${song.name})` : ''}`, 'error', 'play',
          { subsystem: 'distube', meta: { guild: queue?.id, stack: err?.stack } });
      })
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
    if (!require('./panel-extras').wsCommandAllowed(ws, msg)) return;

    const guildId = this.resolveGuildId(msg);
    const queue = guildId ? this.distube.getQueue(guildId) : null;

    try {
      switch (msg.action) {
        case 'play': {
          const voice = guildId ? this.distube.voices.get(guildId) : null;
          // Not in voice yet: join the channel the bot owner is sitting in.
          const voices = this.client.guilds.cache.get(guildId)?.voiceStates?.cache;
          const ownerChannel = require('./owners').ids()
            .map((id) => voices?.get(id)?.channel).find(Boolean) || null;
          const target = voice?.channel || ownerChannel;
          if (!target) {
            this.log('GUI play failed: join a voice channel first, or use /play in Discord.', 'error');
            return;
          }
          await this.distube.play(target, String(msg.query || ''));
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
        case 'toggle_autoplay': {
          // Flip what's playing (if anything) and remember it for this server.
          if (!guildId) break;
          const next = !(queue ? queue.autoplay : getGuild(guildId).autoplay);
          if (queue && queue.autoplay !== next) queue.toggleAutoplay();
          updateGuild(guildId, { autoplay: next });
          break;
        }
        case 'set_config':
          // Only allow writes to keys on the dashboard allowlist — see top of
          // file. Rejects attempts to write playlists, favorites, ratings,
          // automod config, etc. via the generic `set_config` action.
          if (guildId && msg.key && ALLOWED_SET_CONFIG_KEYS.has(String(msg.key))) {
            updateGuild(guildId, { [msg.key]: msg.value });
            // A new welcome sound: download it now so it plays instantly.
            if (msg.key === 'welcomeSoundUrl' && msg.value) require('./welcome-intro').warm(String(msg.value), (t) => this.log(t, 'warn', 'play'));
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
        case 'queue_reorder': {  // ('queue_move', the classic dashboard's name, is handled further up)
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
      // Tell the person who clicked, so a failed play doesn't look like it worked.
      try { this.send(ws, { type: 'cmd_error', error: String(err.message || err).slice(0, 300) }); } catch { /* socket gone */ }
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
