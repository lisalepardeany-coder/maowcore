(() => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ===== Theme + motion preferences (localStorage) =====
  const VALID_THEMES = ['discord', 'linear', 'spotify', 'glass'];
  let savedTheme = localStorage.getItem('maow.theme') || 'discord';
  // Migrate users from the old theme names (cosmic / synthwave / cyberpunk /
  // minimal / high-contrast / colorblind) to the new 4-theme system.
  if (!VALID_THEMES.includes(savedTheme)) savedTheme = 'discord';
  const savedMotion = localStorage.getItem('maow.motion') || 'full';
  document.body.setAttribute('data-theme', savedTheme);
  document.body.setAttribute('data-motion', savedMotion);

  // ===== Mini-player mode (?mode=mini) =====
  if (new URLSearchParams(location.search).get('mode') === 'mini') {
    document.body.classList.add('mini-mode');
  }

  // ===== Sidebar collapse (persisted) =====
  if (localStorage.getItem('maow.sidebarCollapsed') === '1') {
    document.body.classList.add('sidebar-collapsed');
  }

  // ===== Custom background image (persisted) =====
  const savedBg = localStorage.getItem('maow.customBg') || '';
  if (savedBg) $('custom-bg').style.backgroundImage = `url(${savedBg})`;

  // ===== Register service worker (PWA) =====
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // ===== Toast notifications =====
  let toast = (title, body = '', level = 'info', ms = 4000) => {
    const container = $('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${level}`;
    el.innerHTML = `<div class="toast-title">${escapeHtmlSafe(title)}</div>${body ? `<div class="toast-body">${escapeHtmlSafe(body)}</div>` : ''}`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    }, ms);
  };
  const escapeHtmlSafe = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ===== Animated number counter =====
  const tweenNumber = (el, to, opts = {}) => {
    const from = parseFloat(el.dataset.lastValue || '0');
    const dur = opts.duration || 600;
    const suffix = opts.suffix || '';
    const startTime = performance.now();
    el.dataset.lastValue = String(to);
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      el.textContent = (opts.format ? opts.format(v) : Math.round(v)) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // ===== Album-art ambient theme (color extraction) =====
  const setAmbient = (thumbnailUrl) => {
    const el = $('album-ambient');
    if (!el) return;
    if (!thumbnailUrl) { el.style.backgroundImage = ''; el.style.opacity = '0'; return; }
    el.style.backgroundImage = `url(${thumbnailUrl})`;
    el.style.opacity = '0.35';
  };

  // Gauge gradients are defined as a single shared <defs> at the top of dashboard.html
  // (referenced from CSS via `stroke: url(#cosmic-gradient)`). No JS injection needed.

  // ===== State =====
  let ws = null;
  let connected = false;
  let state = null;
  let activePage = 'home';
  let volTimer = null;
  // The user-selected server. All data-driven panels (history, stats, profile,
  // favorites, server view) query this guild ID. Defaults to the first server
  // with an active queue, falling back to the first cached guild.
  let selectedServerId = localStorage.getItem('maow.selectedServerId') || null;
  const currentServer = () => {
    if (!state?.servers?.length) return null;
    if (selectedServerId) {
      const match = state.servers.find((s) => s.id === selectedServerId);
      if (match) return match;
    }
    // Default: pick the server with an active queue if any
    const withQueue = state.servers.find((s) =>
      state.queues?.some((q) => q.guildId === s.id),
    );
    return withQueue || state.servers[0];
  };

  // ===== Routing =====
  $$('.nav-item').forEach((el) => {
    el.addEventListener('click', () => switchPage(el.dataset.page));
  });
  function switchPage(name) {
    activePage = name;
    $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.page === name));
    $$('.page').forEach((el) => el.classList.toggle('hidden', el.id !== `page-${name}`));
    if (state) renderAll();
  }

  // ===== Formatters =====
  const fmtClock = (sec) => {
    if (sec == null) return '—';
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2,'0')}:${s}` : `${m}:${s}`;
  };
  const fmtUptime = (sec) => {
    if (sec == null) return '—';
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  };
  const fmtBytes = (n) => {
    if (n == null) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
  };
  const progressBar = (cur, total, length = 22) => {
    if (!total) return '─'.repeat(length);
    const ratio = Math.min(1, Math.max(0, cur / total));
    const pos = Math.floor(ratio * length);
    return '─'.repeat(pos) + '◆' + '─'.repeat(Math.max(0, length - pos - 1));
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ===== WebSocket =====
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/`);
    setStatus(false, 'connecting…');
    ws.onopen = () => { connected = true; setStatus(true, 'connected'); };
    ws.onclose = () => { connected = false; setStatus(false, 'disconnected'); setTimeout(connect, 2000); };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      try { handle(JSON.parse(e.data)); }
      catch (err) { console.warn('[dashboard] handler error:', err); }
    };
  }
  function send(action, extra = {}) {
    if (!connected) return;
    // Pin commands to the currently-selected server so multi-guild bots route
    // transport actions to the right queue. resolveGuildId() on the backend
    // falls back to "first queue" if no guildId is supplied.
    const server = currentServer();
    const guildId = extra.guildId ?? server?.id;
    ws.send(JSON.stringify({ type: 'cmd', action, ...(guildId ? { guildId } : {}), ...extra }));
  }
  function setStatus(ok, text) {
    $('status-dot').classList.toggle('ok', ok);
    $('status-text').textContent = text;
  }

  // ===== Handlers =====
  function handle(msg) {
    if (msg.type === 'log') {
      appendLog($('ov-log'), msg, 80);
      appendLog($('console-output'), msg);
      return;
    }
    if (msg.type === 'log_history') {
      msg.entries.forEach((e) => {
        appendLog($('ov-log'), e, 80);
        appendLog($('console-output'), e);
      });
      return;
    }
    if (msg.type === 'log_clear') {
      $('console-output').innerHTML = '';
      return;
    }
    if (msg.type === 'state') {
      // Server list isn't sent every tick (heavy). Carry it over from the previous state.
      if (!msg.servers && state?.servers) msg.servers = state.servers;
      state = msg;
      try { populateServerSelect(); } catch { /* defined later */ }
      renderAll();
      try { pushPerfHistory(); } catch { /* defined later in this IIFE */ }
      // Live-refresh data-driven pages while user is viewing them.
      // Stage-1 IA: insights bundles stats+profile+activity; library tabs
      // refresh on tab-click rather than every tick (less churn).
      try {
        if (activePage === 'insights') {
          renderStats?.(); renderProfile?.(); renderActivity?.();
        }
      } catch { /* renderers defined later in this IIFE */ }
      return;
    }
    if (msg.type === 'hello') {
      const tag = msg.botTag || '';
      const tagEl = $('bot-tag');
      if (tagEl) tagEl.textContent = tag;
      document.title = `MaowCore${tag ? ' — ' + tag : ''}`;
    }
  }

  function appendLog(el, entry, max = 500) {
    const when = new Date(entry.ts || Date.now()).toLocaleTimeString();
    const div = document.createElement('div');
    div.innerHTML = `<span class="ts">${when}</span><span class="${entry.level || 'info'}">${escapeHtml(entry.text || '')}</span>`;
    el.appendChild(div);
    while (el.children.length > max) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  // ===== Render: state -> DOM =====
  function renderAll() {
    if (!state) return;
    renderOverview();
    renderPlayer();
    renderServer();
    renderSettings();
    renderPerformance();
  }

  // Returns the queue for the currently-selected server, falling back to the
  // first queue if no server is selected or the selection has no active queue.
  // (The legacy name "firstQueue" survives so the many call sites don't need
  // to change.)
  function firstQueue() {
    if (!state?.queues?.length) return null;
    const server = currentServer();
    if (server) {
      const match = state.queues.find((q) => q.guildId === server.id);
      if (match) return match;
    }
    return state.queues[0];
  }

  function renderOverview() {
    const ping = state.ping || {};
    const stats = state.stats || {};
    $('ov-uptime').textContent = fmtUptime(stats.process?.uptime);
    $('ov-ping').textContent = ping.websocket != null ? `${Math.max(0, Math.round(ping.websocket))} ms` : '—';
    $('ping-value').textContent = ping.websocket != null ? `${Math.max(0, Math.round(ping.websocket))} ms` : '—';
    $('ov-servers').textContent = state.servers?.length ?? '—';
    $('ov-queues').textContent = state.queues?.length ?? 0;

    const q = firstQueue();
    if (q?.currentSong) {
      const s = q.currentSong;
      $('ov-title').textContent = s.name;
      $('ov-meta').textContent =
        (q.paused ? '⏸ paused · ' : '') +
        `${s.user} · vol ${q.volume}% · loop ${['off','signal','queue'][q.repeatMode]}` +
        (q.voiceChannelName ? ` · in #${q.voiceChannelName}` : '');
      $('ov-progress').textContent = `${fmtClock(s.currentTime)}  ${progressBar(s.currentTime || 0, s.duration || 0, 18)}  ${s.formattedDuration}`;
      if (s.thumbnail) { $('ov-thumb').src = s.thumbnail; } else { $('ov-thumb').removeAttribute('src'); }
    } else {
      $('ov-title').textContent = '— no signal —';
      $('ov-meta').textContent = '';
      $('ov-progress').textContent = '—';
      $('ov-thumb').removeAttribute('src');
    }
  }

  function renderPlayer() {
    const q = firstQueue();
    const dock = $('mini-dock');
    const vis = $('np-visualizer');
    if (!q?.currentSong) {
      $('np-title').textContent = '— no signal —';
      $('np-meta').textContent = '';
      $('np-progress').textContent = '—';
      $('np-thumb').removeAttribute('src');
      $('queue').innerHTML = '<div class="queue-empty">— cargo hold empty —</div>';
      if (dock) dock.classList.remove('visible');
      if (vis) vis.classList.add('paused');
      setAmbient(null);
      return;
    }
    const s = q.currentSong;
    $('np-title').textContent = s.name;
    const parts = [
      `requested by ${s.user}`,
      `vol ${q.volume}%`,
      `loop ${['off','signal','queue'][q.repeatMode]}`,
    ];
    if (q.filters?.length) parts.push(`filters: ${q.filters.join(', ')}`);
    if (q.autoplay) parts.push('autoplay on');
    if (q.voiceChannelName) parts.push(`in #${q.voiceChannelName}`);
    $('np-meta').textContent = (q.paused ? '⏸  PAUSED   ·   ' : '') + parts.join('   ·   ');
    $('np-progress').textContent = `${fmtClock(s.currentTime)}  ${progressBar(s.currentTime || 0, s.duration || 0)}  ${s.formattedDuration}`;
    if (s.thumbnail) { $('np-thumb').src = s.thumbnail; } else { $('np-thumb').removeAttribute('src'); }
    if (vis) vis.classList.toggle('paused', !!q.paused);
    setAmbient(s.thumbnail);

    // Mini-dock
    if (dock) {
      dock.classList.add('visible');
      const dt = $('dock-thumb'); if (s.thumbnail) dt.src = s.thumbnail; else dt.removeAttribute('src');
      $('dock-title').textContent = s.name;
      $('dock-sub').textContent = `${s.user} · ${s.formattedDuration}`;
      $('dock-bar').style.width = `${Math.min(100, Math.max(0, ((s.currentTime || 0) / (s.duration || 1)) * 100))}%`;
      $('dock-pause').textContent = q.paused ? '▶' : '⏸';
    }

    if (!volTimer) {
      $('vol-slider').value = q.volume;
      $('vol-label').textContent = `${q.volume}%`;
    }

    const queueEl = $('queue');
    queueEl.innerHTML = '';
    if (!q.upcoming?.length) {
      queueEl.innerHTML = '<div class="queue-empty">— cargo hold empty —</div>';
    } else {
      q.upcoming.forEach((song, i) => {
        const d = document.createElement('div');
        d.className = 'queue-row';
        d.dataset.idx = i + 1;
        d.draggable = true;
        d.innerHTML = `<span class="qr-pos">${String(i+1).padStart(2,' ')}.</span> <span class="qr-name">${escapeHtmlSafe(song.name)}</span> <span class="qr-dur muted">[${song.formattedDuration}]</span>`;
        // Hover preview popover
        d.addEventListener('mouseenter', (e) => showQueuePreview(e, song));
        d.addEventListener('mouseleave', hideQueuePreview);
        // Drag-drop reordering
        d.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', d.dataset.idx); d.style.opacity = '0.4'; });
        d.addEventListener('dragend', () => { d.style.opacity = ''; });
        d.addEventListener('dragover', (e) => e.preventDefault());
        d.addEventListener('drop', (e) => {
          e.preventDefault();
          const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
          const to = parseInt(d.dataset.idx, 10);
          if (from !== to) {
            send('queue_move', { from, to });
            toast('Queue reordered', `${from} → ${to}`, 'success');
          }
        });
        queueEl.appendChild(d);
      });
    }
  }

  // Hover preview popover
  let previewEl = null;
  const showQueuePreview = (evt, song) => {
    if (!previewEl) {
      previewEl = document.createElement('div');
      previewEl.className = 'preview-popover';
      document.body.appendChild(previewEl);
    }
    previewEl.innerHTML = `
      ${song.thumbnail ? `<img src="${escapeHtmlSafe(song.thumbnail)}" />` : ''}
      <div class="pp-title">${escapeHtmlSafe(song.name)}</div>
      <div class="pp-meta">${escapeHtmlSafe(song.formattedDuration || '')}</div>
    `;
    previewEl.style.display = 'block';
    const rect = evt.currentTarget.getBoundingClientRect();
    previewEl.style.left = `${Math.min(window.innerWidth - 300, rect.right + 12)}px`;
    previewEl.style.top = `${rect.top}px`;
  };
  const hideQueuePreview = () => { if (previewEl) previewEl.style.display = 'none'; };

  function renderServer() {
    const server = currentServer();
    if (!server) {
      $('server-header').innerHTML = '<div class="muted">No servers found.</div>';
      $('voice-list').innerHTML = '';
      $('text-list').innerHTML = '';
      return;
    }
    $('server-header').innerHTML = `
      ${server.iconURL ? `<img class="server-icon" src="${escapeHtmlSafe(server.iconURL)}" />` : '<div class="server-icon" style="background:linear-gradient(135deg,var(--cosmic),var(--nebula));display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700">◆</div>'}
      <div class="server-info">
        <h2>${escapeHtml(server.name)}</h2>
        <div class="muted">${server.memberCount} members · ${server.channels.length} channels</div>
      </div>
    `;

    // Voice channels with members
    const voice = server.channels.filter((c) => c.type === 2 || c.type === 13);
    const voiceEl = $('voice-list');
    voiceEl.innerHTML = '';
    if (!voice.length) voiceEl.innerHTML = '<div class="queue-empty">— no voice channels —</div>';
    voice.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'channel-row';
      row.innerHTML = `
        <span class="ch-icon">🎙</span>
        <span class="ch-name">${escapeHtml(c.name)}</span>
        <span class="ch-meta">${c.members?.length || 0}${c.userLimit ? `/${c.userLimit}` : ''}</span>
      `;
      voiceEl.appendChild(row);
      if (c.members?.length) {
        const mem = document.createElement('div');
        mem.className = 'channel-members';
        mem.textContent = c.members.map((m) => (m.bot ? '🤖 ' : '✦ ') + m.name).join(' · ');
        voiceEl.appendChild(mem);
      }
    });

    // Text channels grouped by category
    const text = server.channels.filter((c) => c.type === 0 || c.type === 5 || c.type === 15);
    const categories = server.channels.filter((c) => c.type === 4);
    const catById = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    const textEl = $('text-list');
    textEl.innerHTML = '';
    const grouped = {};
    text.forEach((c) => {
      const cat = catById[c.parentId] || '— ungrouped —';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(c);
    });
    Object.entries(grouped).forEach(([cat, list]) => {
      const h = document.createElement('div');
      h.className = 'category-row';
      h.textContent = cat;
      textEl.appendChild(h);
      list.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'channel-row';
        row.innerHTML = `<span class="ch-icon">#</span><span class="ch-name">${escapeHtml(c.name)}</span>`;
        textEl.appendChild(row);
      });
    });
  }

  function renderSettings() {
    const server = currentServer();
    if (!server) return;
    const cfg = (state.configs || {})[server.id] || {};
    $('cfg-247').checked = !!cfg.stay247;
    $('cfg-sponsorblock').checked = !!cfg.sponsorblock;
    $('cfg-autoplay').checked = !!cfg.autoplay;
    $('cfg-autoplay').disabled = !cfg.activeQueue;
    if (document.activeElement !== $('cfg-volume')) {
      $('cfg-volume').value = cfg.volume ?? 100;
      $('cfg-volume-label').textContent = `${cfg.volume ?? 100}%`;
    }
  }

  function renderPerformance() {
    const s = state.stats || {};
    const ping = state.ping || {};
    const sys = s.system || {};
    const proc = s.process || {};
    const disk = s.disk;

    // Gauges
    const cpuPct = Math.round(sys.cpuPct || 0);
    const ramPct = sys.memTotal ? Math.round((sys.memUsed / sys.memTotal) * 100) : 0;
    const diskPct = disk && disk.total ? Math.round(((disk.total - disk.free) / disk.total) * 100) : 0;
    setGauge('cpu', cpuPct);
    setGauge('ram', ramPct);
    setGauge('disk', disk ? diskPct : null);
    $('gauge-cpu-val').textContent = `${cpuPct}%`;
    $('gauge-ram-val').textContent = `${ramPct}%`;
    $('gauge-disk-val').textContent = disk ? `${diskPct}%` : 'n/a';

    $('sys-host').textContent = sys.hostname || '—';
    $('sys-plat').textContent = sys.platform || '—';
    $('sys-arch').textContent = sys.arch || '—';
    $('sys-rel').textContent = sys.release || '—';
    $('sys-cpu').textContent = sys.cpuModel || '—';
    $('sys-cores').textContent = `${sys.cpus || '—'} cores @ ${sys.cpuSpeedMHz || '—'} MHz`;
    $('sys-up').textContent = fmtUptime(sys.uptime);
    $('sys-load').textContent = (sys.loadavg || []).map((n) => n.toFixed(2)).join(' · ') || '—';

    $('proc-node').textContent = proc.nodeVersion || '—';
    $('proc-pid').textContent = `${proc.pid ?? '—'} / ${proc.ppid ?? '—'}`;
    $('proc-up').textContent = fmtUptime(proc.uptime);
    $('proc-heap').textContent = `${fmtBytes(proc.heapUsed)} / ${fmtBytes(proc.heapTotal)}`;
    $('proc-rss').textContent = fmtBytes(proc.rss);
    if ($('proc-external')) $('proc-external').textContent = fmtBytes(proc.external);
    {
      // Show the breakdown so it's clear where the number comes from:
      // gateway heartbeat (— when Discord hasn't ack'd one yet) + measured
      // REST round-trip.
      const hb = (typeof ping.heartbeat === 'number' && ping.heartbeat >= 0) ? `${Math.round(ping.heartbeat)}ms` : '—';
      const rest = ping.rest != null ? `${Math.round(ping.rest)}ms` : '—';
      $('proc-ping').textContent = `heartbeat ${hb} · REST ${rest}`;
    }
    if ($('proc-lag') && proc.eventLoopLagMs != null) $('proc-lag').textContent = `${proc.eventLoopLagMs.toFixed(2)} ms`;
    if ($('proc-cwd')) $('proc-cwd').textContent = proc.cwd || '—';

    // Discord cache panel
    const d = s.discord || {};
    const STATUS = { 0: 'READY', 1: 'CONNECTING', 2: 'RECONNECTING', 3: 'IDLE', 4: 'NEARLY', 5: 'DISCONNECTED' };
    if ($('disc-status')) $('disc-status').textContent = STATUS[d.wsStatus] ?? '—';
    if ($('disc-guilds')) $('disc-guilds').textContent = d.guilds ?? '—';
    if ($('disc-users')) $('disc-users').textContent = d.users ?? '—';
    if ($('disc-channels')) $('disc-channels').textContent = d.channels ?? '—';
    if ($('disc-voice')) $('disc-voice').textContent = d.voiceConnections ?? '—';
    if ($('disc-queues')) $('disc-queues').textContent = d.activeQueues ?? '—';
    if ($('disc-shards')) $('disc-shards').textContent = d.gatewayShards ?? '—';
  }

  function setGauge(id, pct) {
    const el = $(`gauge-${id}-fg`);
    if (!el) return;
    const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    el.setAttribute('stroke-dashoffset', 100 - v);
  }

  // ===== Controls wiring =====
  $$('.transport button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      const q = firstQueue();
      if (a === 'pause-toggle' && q) return send(q.paused ? 'resume' : 'pause');
      if (a === 'loop' && q) return send('loop', { value: (q.repeatMode + 1) % 3 });
      send(a);
    });
  });
  $('play-btn').addEventListener('click', () => {
    const q = $('play-input').value.trim();
    if (!q) return;
    send('play', { query: q });
    $('play-input').value = '';
  });
  $('play-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('play-btn').click(); });
  $('vol-slider').addEventListener('input', () => {
    const v = +$('vol-slider').value;
    $('vol-label').textContent = `${v}%`;
    if (volTimer) clearTimeout(volTimer);
    volTimer = setTimeout(() => { send('volume', { value: v }); volTimer = null; }, 200);
  });

  // Settings
  $('cfg-247').addEventListener('change', () => send('toggle_247'));
  $('cfg-sponsorblock').addEventListener('change', () => send('toggle_sponsorblock'));
  $('cfg-autoplay').addEventListener('change', () => send('toggle_autoplay'));
  $('cfg-volume').addEventListener('input', () => {
    const v = +$('cfg-volume').value;
    $('cfg-volume-label').textContent = `${v}%`;
  });
  $('cfg-volume').addEventListener('change', () => {
    send('volume', { value: +$('cfg-volume').value });
  });

  // Console
  const consoleHistory = [];
  let historyIdx = -1;
  $('console-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const line = $('console-input').value;
      if (line.trim()) {
        consoleHistory.unshift(line);
        if (consoleHistory.length > 50) consoleHistory.pop();
        historyIdx = -1;
        send('console', { line });
      }
      $('console-input').value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIdx < consoleHistory.length - 1) {
        historyIdx++;
        $('console-input').value = consoleHistory[historyIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        historyIdx--;
        $('console-input').value = consoleHistory[historyIdx];
      } else {
        historyIdx = -1;
        $('console-input').value = '';
      }
    }
  });

  // ===== Theme & motion controls =====
  // Theme picker — visual swatch buttons + hidden select for legacy callers.
  const themeSelect = $('cfg-theme');
  const applyTheme = (t) => {
    if (!VALID_THEMES.includes(t)) t = 'discord';
    document.body.setAttribute('data-theme', t);
    localStorage.setItem('maow.theme', t);
    if (themeSelect) themeSelect.value = t;
    document.querySelectorAll('.theme-swatch').forEach((el) => {
      el.classList.toggle('active', el.dataset.theme === t);
    });
  };
  if (themeSelect) {
    themeSelect.value = savedTheme;
    themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
  }
  document.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });
  // Mark the currently-active swatch on initial render.
  applyTheme(savedTheme);

  // ===== Library tabs (search / history / favorites / recent searches) =====
  document.querySelectorAll('#library-tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('#library-tabs .tab').forEach((t) => t.classList.toggle('active', t === btn));
      document.querySelectorAll('#page-library .tab-panel').forEach((p) => p.classList.toggle('hidden', p.id !== `tab-${target}`));
      // Lazy-load each tab's content so we don't fetch everything on first paint.
      try {
        if (target === 'history') renderHistory?.();
        else if (target === 'favorites') renderFavorites?.();
        else if (target === 'searches') renderSearches?.();
        else if (target === 'uploads') renderUploads?.();
      } catch { /* renderers defined later in this IIFE */ }
    });
  });

  // ===== Sidebar collapse toggle =====
  $('sidebar-toggle')?.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('maow.sidebarCollapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '0');
  });

  // ===== Notification bell toggle =====
  $('notif-bell')?.addEventListener('click', () => {
    $('notif-panel')?.classList.toggle('open');
  });

  // ===== Palette trigger button (top bar) =====
  $('palette-trigger')?.addEventListener('click', () => openPalette?.());
  const motionToggle = $('cfg-motion');
  if (motionToggle) {
    motionToggle.checked = savedMotion === 'reduced';
    motionToggle.addEventListener('change', () => {
      const v = motionToggle.checked ? 'reduced' : 'full';
      document.body.setAttribute('data-motion', v);
      localStorage.setItem('maow.motion', v);
    });
  }

  // ===== Search panel =====
  let searchResults = [];
  const renderSearchResults = (rows) => {
    const out = $('search-results');
    out.innerHTML = '';
    if (!rows.length) { out.innerHTML = '<div class="queue-empty">— no signals matched —</div>'; return; }
    rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'search-row';
      row.innerHTML = `
        ${r.thumbnail ? `<img src="${escapeHtmlSafe(r.thumbnail)}" />` : '<div style="width:80px;height:60px;border-radius:6px;background:var(--bg-input)"></div>'}
        <div class="meta">
          <div class="title">${escapeHtml(r.name)}</div>
          <div class="sub">${escapeHtml(r.uploader || 'unknown')} · ${fmtClock(r.duration)}</div>
        </div>
        <div class="actions">
          <button data-act="queue" data-idx="${i}">Queue</button>
          <button data-act="play" data-idx="${i}" class="primary">Play now</button>
        </div>
      `;
      out.appendChild(row);
    });
    out.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = searchResults[+btn.dataset.idx];
        if (!r) return;
        send('play', { query: r.url });
        if (btn.dataset.act === 'play') {
          // queue at the front by skipping after queueing — best-effort, depends on bot
          setTimeout(() => send('skip'), 600);
        }
      });
    });
  };
  $('search-btn')?.addEventListener('click', async () => {
    const q = $('search-input').value.trim();
    if (!q) return;
    $('search-results').innerHTML = '<div class="muted">Scanning subspace…</div>';
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      searchResults = data.results || [];
      renderSearchResults(searchResults);
    } catch (e) {
      $('search-results').innerHTML = `<div class="error">▲ ${escapeHtml(e.message)}</div>`;
    }
  });
  $('search-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('search-btn').click(); });

  // ===== History page =====
  let renderHistory = async () => {
    const out = $('history-list');
    out.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const server = currentServer();
      const url = server ? `/api/history?guildId=${server.id}` : '/api/history';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const entries = data.entries || [];
      $('history-count').textContent = `${entries.length} entries · ${server?.name || 'first cached guild'}`;
      if (!entries.length) {
        out.innerHTML = `<div class="queue-empty">— no plays logged yet for <b>${escapeHtml(server?.name || 'this server')}</b> —</div>`;
        return;
      }
      out.innerHTML = '';
      entries.forEach((e, i) => {
        const row = document.createElement('div');
        row.className = 'history-row';
        const when = new Date(e.ts).toLocaleString();
        row.innerHTML = `
          ${e.thumbnail ? `<img src="${escapeHtmlSafe(e.thumbnail)}" />` : '<div style="width:56px;height:42px;border-radius:6px;background:var(--bg-input)"></div>'}
          <div class="meta">
            <div class="title">${escapeHtml(e.name)}</div>
            <div class="sub">${escapeHtml(e.user || 'unknown')} · ${when}</div>
          </div>
          <button data-url="${escapeHtmlSafe(e.url || '')}" class="primary">▶ Replay</button>
        `;
        out.appendChild(row);
      });
      out.querySelectorAll('button[data-url]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.url) send('play', { query: btn.dataset.url });
        });
      });
    } catch (e) {
      out.innerHTML = `<div class="error">▲ ${escapeHtml(e.message)}</div>`;
    }
  };
  // ===== Stats page =====
  let renderStats = async () => {
    try {
      const server = currentServer();
      const url = server ? `/api/stats?guildId=${server.id}` : '/api/stats';
      const res = await fetch(url);
      const s = await res.json();
      $('stats-total').textContent = s.total ?? 0;
      const mins = Math.round((s.totalListeningSec || 0) / 60);
      const hrs = Math.floor(mins / 60);
      $('stats-listen').textContent = hrs ? `${hrs}h ${mins % 60}m` : `${mins}m`;
      $('stats-top-artist').textContent = s.topArtists?.[0]?.name || '—';
      $('stats-top-song').textContent = s.topSongs?.[0]?.name || '—';
      // Donut chart of top artists
      renderDonut(s.topArtists || []);
      const songsHtml = (s.topSongs || []).map((e, i) => `<div class="queue-row">${i + 1}.  ${escapeHtml(e.name)}  <span class="muted">(${e.count})</span></div>`).join('') || '<div class="queue-empty">no data yet</div>';
      $('stats-songs-list').innerHTML = songsHtml;
      const artistsHtml = (s.topArtists || []).map((e, i) => `<div class="queue-row">${i + 1}.  ${escapeHtml(e.name)}  <span class="muted">(${e.count})</span></div>`).join('') || '<div class="queue-empty">no data yet</div>';
      $('stats-artists-list').innerHTML = artistsHtml;
      // Hours chart — simple SVG bars
      const hours = s.plays24h || new Array(24).fill(0);
      const max = Math.max(1, ...hours);
      const svg = $('stats-hours-chart');
      svg.innerHTML = hours.map((v, h) => {
        const x = (h * 480) / 24;
        const barWidth = 480 / 24 - 2;
        const barHeight = (v / max) * 110;
        const y = 120 - barHeight;
        return `<rect x="${x + 1}" y="${y}" width="${barWidth}" height="${barHeight}" style="fill:var(--cosmic)" rx="2"/><text x="${x + barWidth/2}" y="135" style="fill:var(--fg-dim)" font-size="8" text-anchor="middle">${h}</text>`;
      }).join('');
    } catch (e) { /* silent */ }
  };

  // Re-render history/stats when switching to those pages.
  // Stage-1 IA: 'library' lazy-renders via its tabs; 'insights' renders
  // stats + profile + activity since they all live on the same page now.
  const originalSwitchPage = switchPage;
  switchPage = function (name) {
    originalSwitchPage(name);
    if (name === 'library') {
      // Library defaults to the Search tab — nothing to fetch on mount.
      // Other tabs lazy-load via their click handlers.
    }
    if (name === 'insights') {
      try { renderStats?.(); } catch {}
      try { renderProfile?.(); } catch {}
      try { renderActivity?.(); } catch {}
    }
    // Legacy direct page names still supported (palette/Cmd+K entries).
    if (name === 'history') renderHistory();
    if (name === 'stats') renderStats();
  };

  // ===== Mini-dock wiring =====
  $('dock-pause')?.addEventListener('click', () => {
    const q = firstQueue();
    if (!q) return;
    send(q.paused ? 'resume' : 'pause');
  });
  $('dock-skip')?.addEventListener('click', () => send('skip'));
  $('dock-fs')?.addEventListener('click', () => toggleFullscreen());

  // ===== Fullscreen mode =====
  let cursorTimer = null;
  const toggleFullscreen = (on) => {
    const wantFs = on !== undefined ? on : !document.body.classList.contains('fullscreen');
    document.body.classList.toggle('fullscreen', wantFs);
    if (wantFs) {
      switchPage('player');
      document.documentElement.requestFullscreen?.().catch(() => {});
      armCursorHider();
    } else {
      document.exitFullscreen?.().catch(() => {});
      if (cursorTimer) clearTimeout(cursorTimer);
      document.body.classList.remove('cursor-hidden');
    }
  };
  const armCursorHider = () => {
    if (cursorTimer) clearTimeout(cursorTimer);
    document.body.classList.remove('cursor-hidden');
    cursorTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), 3000);
  };
  document.addEventListener('mousemove', () => {
    if (document.body.classList.contains('fullscreen')) armCursorHider();
  });

  // ===== Command palette (Cmd+K / Ctrl+K) =====
  const PALETTE_ACTIONS = [
    { glyph: '⌂', label: 'Go to Home', meta: 'page', action: () => switchPage('home') },
    { glyph: '≡', label: 'Go to Library', meta: 'page', action: () => switchPage('library') },
    { glyph: '◐', label: 'Go to Insights', meta: 'page', action: () => switchPage('insights') },
    { glyph: '⌬', label: 'Go to Server', meta: 'page', action: () => switchPage('server') },
    { glyph: '⚙', label: 'Go to Settings', meta: 'page', action: () => switchPage('settings') },
    { glyph: '⏸', label: 'Pause / Resume', meta: 'control', action: () => { const q = firstQueue(); if (q) send(q.paused ? 'resume' : 'pause'); } },
    { glyph: '⏭', label: 'Skip', meta: 'control', action: () => send('skip') },
    { glyph: '⏹', label: 'Stop', meta: 'control', action: () => send('stop') },
    { glyph: '✦', label: 'Shuffle', meta: 'control', action: () => send('shuffle') },
    { glyph: '⌬', label: 'Leave voice', meta: 'control', action: () => send('leave') },
    { glyph: '↻', label: 'Cycle loop mode', meta: 'control', action: () => { const q = firstQueue(); if (q) send('loop', { value: (q.repeatMode + 1) % 3 }); } },
    { glyph: '⛶', label: 'Toggle fullscreen Now Playing', meta: 'view', action: () => toggleFullscreen() },
    { glyph: '🎨', label: 'Cycle theme', meta: 'view', action: () => cycleTheme() },
    { glyph: '✦', label: 'Copy invite link', meta: 'invite', action: async () => {
      try {
        const r = await fetch('/api/invite');
        const d = await r.json();
        if (!d.url) return toast('▲ Invite unavailable', 'Client ID not ready yet', 'error', 2500);
        await navigator.clipboard.writeText(d.url);
        toast('✦ Copied', 'Invite link copied', 'success', 2000);
      } catch { toast('▲ Copy failed', '', 'error', 2000); }
    } },
  ];

  const openPalette = () => {
    $('palette-overlay').classList.add('open');
    $('palette-input').value = '';
    renderPalette('');
    setTimeout(() => $('palette-input').focus(), 50);
  };
  const closePalette = () => { $('palette-overlay').classList.remove('open'); };
  let paletteSelected = 0;
  const renderPalette = (filter) => {
    const f = filter.toLowerCase();
    const filtered = PALETTE_ACTIONS.filter((a) => a.label.toLowerCase().includes(f));
    paletteSelected = 0;
    $('palette-results').innerHTML = filtered.map((a, i) => `
      <div class="palette-item ${i === 0 ? 'selected' : ''}" data-idx="${i}">
        <div><span class="pi-glyph">${a.glyph}</span> ${escapeHtmlSafe(a.label)}</div>
        <div class="pi-meta">${a.meta}</div>
      </div>`).join('');
    $('palette-results').querySelectorAll('.palette-item').forEach((el, i) => {
      el.addEventListener('mouseenter', () => { selectPalette(i, filtered); });
      el.addEventListener('click', () => { filtered[i].action(); closePalette(); });
    });
  };
  const selectPalette = (i, list) => {
    paletteSelected = i;
    $$('.palette-item').forEach((el, j) => el.classList.toggle('selected', j === i));
  };
  $('palette-input')?.addEventListener('input', (e) => renderPalette(e.target.value));
  $('palette-input')?.addEventListener('keydown', (e) => {
    const items = $$('.palette-item');
    if (e.key === 'Escape') return closePalette();
    if (e.key === 'ArrowDown') { e.preventDefault(); selectPalette(Math.min(items.length - 1, paletteSelected + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); selectPalette(Math.max(0, paletteSelected - 1)); }
    if (e.key === 'Enter') {
      const f = $('palette-input').value.toLowerCase();
      const filtered = PALETTE_ACTIONS.filter((a) => a.label.toLowerCase().includes(f));
      if (filtered[paletteSelected]) { filtered[paletteSelected].action(); closePalette(); }
    }
  });
  $('palette-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'palette-overlay') closePalette(); });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if ((e.key === 'f' || e.key === 'F') && !$('palette-overlay').classList.contains('open')) {
      const active = document.activeElement?.tagName;
      if (active !== 'INPUT' && active !== 'TEXTAREA') toggleFullscreen();
    }
    if (e.key === 'Escape' && document.body.classList.contains('fullscreen')) toggleFullscreen(false);
  });

  // ===== Theme cycler (palette shortcut) =====
  const THEMES = VALID_THEMES;
  const cycleTheme = () => {
    const current = document.body.getAttribute('data-theme') || 'cosmic';
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('maow.theme', next);
    if (themeSelect) themeSelect.value = next;
    toast('Theme', next, 'info', 1500);
  };

  // ===== Easter eggs =====
  // Konami code: ↑↑↓↓←→←→BA — skip when user is typing in an input
  const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let konamiIdx = 0;
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;  // don't swallow keys in text fields
    const want = KONAMI[konamiIdx];
    if (e.key === want || e.key.toLowerCase() === want.toLowerCase()) {
      konamiIdx++;
      if (konamiIdx === KONAMI.length) {
        document.body.classList.toggle('matrix-mode');
        toast('◇ MATRIX MODE', 'You have unlocked the void.', 'success', 3000);
        konamiIdx = 0;
      }
    } else { konamiIdx = 0; }
  });
  // Click logo 7 times → cycle theme
  let logoClicks = 0;
  document.querySelector('.brand-glyph')?.addEventListener('click', () => {
    logoClicks++;
    if (logoClicks >= 7) { logoClicks = 0; cycleTheme(); toast('✦ Secret unlocked', 'Theme cycled', 'success', 2000); }
  });

  // ===== Profile page =====
  let renderProfile = async () => {
    const server = currentServer();
    if (!server) {
      const total = $('prof-total');
      if (total) total.textContent = '—';
      return;
    }
    try {
      const sRes = await fetch(`/api/stats?guildId=${server.id}`);
      const stats = await sRes.json();
      const hRes = await fetch(`/api/history?guildId=${server.id}`);
      const history = (await hRes.json()).entries || [];
      tweenNumber($('prof-total'), stats.total || 0);
      const hours = Math.floor((stats.totalListeningSec || 0) / 3600);
      tweenNumber($('prof-hours'), hours);
      // Streak: count consecutive days with at least one play
      const days = new Set(history.map((h) => new Date(h.ts).toDateString()));
      let streak = 0;
      const d = new Date();
      while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
      tweenNumber($('prof-streak'), streak);
      // Current obsession: most-played this week
      const weekAgo = Date.now() - 7 * 86400000;
      const weekPlays = history.filter((h) => h.ts >= weekAgo);
      const byName = new Map();
      weekPlays.forEach((h) => byName.set(h.name, (byName.get(h.name) || 0) + 1));
      const obs = [...byName.entries()].sort((a, b) => b[1] - a[1])[0];
      const obsEntry = obs ? history.find((h) => h.name === obs[0]) : null;
      if (obsEntry) {
        $('prof-obsession').innerHTML = `
          ${obsEntry.thumbnail ? `<img class="np-thumb-mini" src="${escapeHtmlSafe(obsEntry.thumbnail)}" />` : '<div class="np-thumb-mini"></div>'}
          <div class="np-info">
            <div class="np-title">${escapeHtmlSafe(obsEntry.name)}</div>
            <div class="np-meta muted">${obs[1]} plays this week</div>
          </div>`;
      } else {
        $('prof-obsession').innerHTML = '<div class="muted">Need at least 5 plays this week.</div>';
      }
      $('prof-artists').innerHTML = (stats.topArtists || []).map((e, i) =>
        `<div class="queue-row">${i + 1}. ${escapeHtmlSafe(e.name)}  <span class="muted">(${e.count})</span></div>`,
      ).join('') || '<div class="queue-empty">no data</div>';
      $('prof-songs').innerHTML = (stats.topSongs || []).map((e, i) =>
        `<div class="queue-row">${i + 1}. ${escapeHtmlSafe(e.name)}  <span class="muted">(${e.count})</span></div>`,
      ).join('') || '<div class="queue-empty">no data</div>';
      // Heatmap — last 365 days
      const heat = $('prof-heatmap');
      heat.innerHTML = '';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const playsByDay = new Map();
      history.forEach((h) => {
        const k = new Date(h.ts); k.setHours(0, 0, 0, 0);
        playsByDay.set(k.getTime(), (playsByDay.get(k.getTime()) || 0) + 1);
      });
      const max = Math.max(1, ...playsByDay.values());
      for (let i = 364; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const count = playsByDay.get(d.getTime()) || 0;
        const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
        const cell = document.createElement('div');
        cell.className = 'heatmap-day';
        cell.dataset.level = level;
        cell.title = `${d.toDateString()}: ${count} plays`;
        heat.appendChild(cell);
      }
    } catch (e) { console.warn('[profile] render error:', e); }
  };

  // ===== Activity feed =====
  let activityFilter = 'all';
  let renderActivity = () => {
    const src = $('ov-log');
    const dst = $('activity-feed');
    if (!src || !dst) return;
    if (!src.innerHTML.trim()) {
      dst.innerHTML = '<div class="muted">Waiting for activity… (logs appear as the bot plays songs or runs commands)</div>';
      return;
    }
    dst.innerHTML = src.innerHTML;
    if (activityFilter !== 'all') {
      dst.querySelectorAll('div').forEach((el) => {
        const has = el.querySelector(`.${activityFilter}`);
        if (!has) el.style.display = 'none';
      });
    }
    dst.scrollTop = dst.scrollHeight;
  };
  // Scope the activity filter to ONLY chips inside the Activity page — otherwise
  // it collides with the Stats time-range chips (also .filter-chip) and clicking
  // a Stats chip silently sets activityFilter to undefined → hides all entries.
  document.querySelectorAll('#page-activity .filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activityFilter = chip.dataset.filter;
      document.querySelectorAll('#page-activity .filter-chip').forEach((c) =>
        c.classList.toggle('active', c === chip),
      );
      renderActivity();
    });
  });

  // ===== Animated counters on overview =====
  const renderOverviewAnimated = () => {
    const ping = state.ping || {};
    const stats = state.stats || {};
    // Use tweenNumber for the headline stats
    tweenNumber($('ov-servers'), state.servers?.length ?? 0);
    tweenNumber($('ov-queues'), state.queues?.length ?? 0);
    if (ping.websocket != null) tweenNumber($('ov-ping'), Math.max(0, Math.round(ping.websocket)), { suffix: ' ms' });
    if (stats.process?.uptime != null) $('ov-uptime').textContent = fmtUptime(stats.process.uptime);
  };

  // Patch renderOverview to use animated counters
  const originalRenderOverview = renderOverview;
  renderOverview = function () {
    originalRenderOverview();
    renderOverviewAnimated();
  };

  // Patch switchPage one more time to handle the new pages
  const prev = switchPage;
  switchPage = function (name) {
    prev(name);
    if (name === 'profile') renderProfile();
    if (name === 'activity') renderActivity();
  };

  // ===== Donut chart for stats =====
  const DONUT_COLORS = ['#8B5CF6', '#06B6D4', '#FBBF24', '#10B981', '#EF4444', '#A78BFA', '#06B6D4', '#FB923C'];
  const renderDonut = (items) => {
    const svg = $('stats-donut');
    const legend = $('stats-donut-legend');
    if (!svg || !legend) return;
    const top = items.slice(0, 6);
    if (!top.length) { svg.innerHTML = ''; legend.innerHTML = '<div class="muted">no data</div>'; return; }
    const total = top.reduce((a, b) => a + b.count, 0);
    let offset = 0;
    const cx = 50, cy = 50, r = 35, stroke = 14;
    const segs = top.map((item, i) => {
      const frac = item.count / total;
      const dash = frac * (2 * Math.PI * r);
      const gap = (2 * Math.PI * r) - dash;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke-width="${stroke}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += dash;
      return seg;
    });
    svg.innerHTML = segs.join('') + `<text x="${cx}" y="${cy}" style="fill:var(--fg)" text-anchor="middle" dominant-baseline="middle" font-size="10">${total} plays</text>`;
    legend.innerHTML = top.map((item, i) => `<div><span class="swatch" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>${escapeHtmlSafe(item.name)} <span class="muted">(${item.count})</span></div>`).join('');
  };

  // ===== Real-time line graph on Performance page =====
  const perfHistory = { cpu: [], ram: [], ping: [] };
  const MAX_HISTORY_POINTS = 150;
  const pushPerfHistory = () => {
    const s = state?.stats?.system;
    if (!s) return;
    perfHistory.cpu.push(s.cpuPct || 0);
    perfHistory.ram.push(s.memTotal ? (s.memUsed / s.memTotal) * 100 : 0);
    perfHistory.ping.push(state.ping?.websocket || 0);
    Object.keys(perfHistory).forEach((k) => { if (perfHistory[k].length > MAX_HISTORY_POINTS) perfHistory[k].shift(); });
    renderPerfHistory();
  };
  const renderPerfHistory = () => {
    const svg = $('perf-history-chart');
    if (!svg) return;
    const W = 600, H = 140;
    const series = [
      { data: perfHistory.cpu,  style: 'stroke:var(--cosmic)', label: 'CPU' },
      { data: perfHistory.ram,  style: 'stroke:var(--nebula)', label: 'RAM' },
    ];
    const path = (data) => {
      if (!data.length) return '';
      const max = 100;
      const step = W / Math.max(1, MAX_HISTORY_POINTS - 1);
      return 'M ' + data.map((v, i) => `${i * step},${H - (v / max) * (H - 10)}`).join(' L ');
    };
    svg.innerHTML = series.map((s) => `<path d="${path(s.data)}" fill="none" style="${s.style}" stroke-width="2" stroke-linejoin="round"/>`).join('') +
      `<text x="10" y="14" style="fill:var(--cosmic)" font-size="11">CPU</text><text x="50" y="14" style="fill:var(--nebula)" font-size="11">RAM</text>`;
  };

  // ===== Sparklines on overview =====
  const overviewSparks = { uptime: [], queues: [], ping: [] };
  const pushSpark = (key, val) => {
    overviewSparks[key].push(val);
    if (overviewSparks[key].length > 30) overviewSparks[key].shift();
  };
  const sparklineSVG = (data, w = 60, h = 18) => {
    if (data.length < 2) return '';
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const step = w / (data.length - 1);
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}"><polyline points="${data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ')}" fill="none" style="stroke:var(--cosmic)" stroke-width="1.5"/></svg>`;
  };

  // ===== Onboarding tour (first visit) =====
  const TOUR_STEPS = [
    { selector: '.brand', title: '◆ Welcome', body: 'Welcome to MaowCore Control. A quick tour of the dashboard?' },
    { selector: '.nav', title: '◇ Navigation', body: 'Jump between Now Playing, Search, Server info, Settings, and more.' },
    { selector: '#mini-dock', title: '◆ Mini-player', body: 'Floating dock at the bottom of every page — control playback anywhere.', anchor: 'top' },
    { selector: '#page-overview', title: '◇ Live data', body: 'Stats update every 2 seconds via WebSocket. Press Ctrl+K anytime to jump anywhere.' },
    { selector: '#status-dot', title: '✦ Connection', body: 'Green dot means the bot is online. The panel auto-reconnects if the bot restarts.' },
  ];
  const showTour = () => {
    const overlay = $('tour-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    let i = 0;
    const next = () => {
      if (i >= TOUR_STEPS.length) {
        overlay.classList.remove('open');
        localStorage.setItem('maow.tourDone', '1');
        toast('✦ Tour complete', 'Press Ctrl+K to jump anywhere', 'success', 3000);
        return;
      }
      const step = TOUR_STEPS[i];
      const target = document.querySelector(step.selector);
      const tip = $('tour-tip');
      tip.innerHTML = `
        <h4>${step.title}</h4>
        <p>${step.body}</p>
        <div class="tour-actions">
          <button id="tour-skip">Skip tour</button>
          <button class="primary" id="tour-next">${i === TOUR_STEPS.length - 1 ? 'Finish' : 'Next →'}</button>
        </div>
      `;
      if (target) {
        const rect = target.getBoundingClientRect();
        const top = step.anchor === 'top' ? Math.max(20, rect.top - 160) : Math.min(window.innerHeight - 200, rect.bottom + 12);
        tip.style.left = `${Math.min(window.innerWidth - 360, Math.max(20, rect.left))}px`;
        tip.style.top = `${top}px`;
      } else {
        tip.style.left = '50%';
        tip.style.top = '40%';
        tip.style.transform = 'translate(-50%, -50%)';
      }
      $('tour-skip').onclick = () => { overlay.classList.remove('open'); localStorage.setItem('maow.tourDone', '1'); };
      $('tour-next').onclick = () => { i++; next(); };
    };
    next();
  };
  if (!localStorage.getItem('maow.tourDone')) {
    setTimeout(showTour, 1500);
  }

  // ===== Sound design (subtle UI feedback via Web Audio) =====
  let audioCtx = null;
  const SOUND_PROFILES = {
    click:   { freq: 880, decay: 0.06, type: 'sine',     vol: 0.04 },
    success: { freq: 660, decay: 0.18, type: 'triangle', vol: 0.06 },
    error:   { freq: 220, decay: 0.20, type: 'sawtooth', vol: 0.05 },
    hover:   { freq: 1200, decay: 0.04, type: 'sine',    vol: 0.02 },
  };
  const playSound = (name) => {
    if (localStorage.getItem('maow.soundsOff') === '1') return;
    const p = SOUND_PROFILES[name];
    if (!p) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = p.type; o.frequency.value = p.freq;
      g.gain.setValueAtTime(p.vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + p.decay);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + p.decay);
    } catch { /* ignored */ }
  };
  // Hook play sounds into existing toast + button clicks
  const origToast = toast;
  toast = (title, body, level, ms) => {
    playSound(level === 'error' ? 'error' : level === 'success' ? 'success' : 'click');
    origToast(title, body, level, ms);
  };
  document.querySelectorAll('.transport button').forEach((b) => b.addEventListener('click', () => playSound('click')));

  // ===== Holographic shimmer (cursor-tracking, throttled via rAF) =====
  let _shimmerFrame = null;
  let _shimmerEvent = null;
  document.addEventListener('mousemove', (e) => {
    _shimmerEvent = e;
    if (_shimmerFrame) return;
    _shimmerFrame = requestAnimationFrame(() => {
      _shimmerFrame = null;
      const ev = _shimmerEvent;
      // Use elementFromPoint to find the hovered card directly (O(1)) instead of
      // checking every .card's bounding rect on every frame.
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const card = el?.closest?.('.card');
      // Clear shimmer from any other card that still has it
      document.querySelectorAll('.card.holo').forEach((c) => { if (c !== card) c.classList.remove('holo'); });
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${((ev.clientX - r.left) / r.width) * 100}%`);
        card.style.setProperty('--my', `${((ev.clientY - r.top) / r.height) * 100}%`);
        card.classList.add('holo');
      }
    });
  });

  // ===== Server selector =====
  const populateServerSelect = () => {
    const sel = $('server-select');
    if (!sel || !state?.servers?.length) return;
    const cur = currentServer();
    // Skip rebuild if options already match (avoid resetting user mid-click)
    if (sel.dataset.fp === state.servers.map((s) => s.id).join(',')) {
      if (cur && sel.value !== cur.id) sel.value = cur.id;
      return;
    }
    sel.dataset.fp = state.servers.map((s) => s.id).join(',');
    sel.innerHTML = state.servers.map((s) =>
      `<option value="${s.id}">${escapeHtmlSafe(s.name)}</option>`,
    ).join('');
    if (cur) sel.value = cur.id;
  };
  $('server-select')?.addEventListener('change', (e) => {
    selectedServerId = e.target.value;
    localStorage.setItem('maow.selectedServerId', selectedServerId);
    if (state) renderAll();
    // Refresh data-driven pages immediately
    if (activePage === 'history') renderHistory();
    else if (activePage === 'profile') renderProfile();
    else if (activePage === 'stats') renderStats();
    else if (activePage === 'favorites') renderFavorites();
    else if (activePage === 'servers') renderServer();
    else if (activePage === 'overview') renderOverview();
  });

  // ===== Sidebar toggle =====
  $('sidebar-toggle')?.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('maow.sidebarCollapsed', collapsed ? '1' : '0');
    $('sidebar-toggle').textContent = collapsed ? '»' : '«';
  });
  if (document.body.classList.contains('sidebar-collapsed')) {
    $('sidebar-toggle').textContent = '»';
  }

  // ===== Notification center =====
  const notifs = [];
  const updateNotifBadge = () => {
    const unread = notifs.filter((n) => !n.read).length;
    const badge = $('notif-count');
    if (unread > 0) { badge.textContent = unread; badge.hidden = false; }
    else badge.hidden = true;
  };
  const pushNotif = (entry) => {
    notifs.unshift({ ...entry, read: false });
    if (notifs.length > 50) notifs.pop();
    renderNotifList();
    updateNotifBadge();
  };
  const renderNotifList = () => {
    const list = $('notif-list');
    if (!notifs.length) { list.innerHTML = '<div class="muted">No recent notifications.</div>'; return; }
    list.innerHTML = notifs.map((n) => {
      const when = new Date(n.ts || Date.now()).toLocaleTimeString();
      return `<div class="entry"><span class="ts">${when}</span><span class="${n.level || 'info'}">${escapeHtmlSafe(n.text || '')}</span></div>`;
    }).join('');
  };
  $('notif-bell')?.addEventListener('click', () => {
    const panel = $('notif-panel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      notifs.forEach((n) => n.read = true);
      updateNotifBadge();
    }
  });
  $('notif-clear')?.addEventListener('click', () => {
    notifs.length = 0;
    renderNotifList();
    updateNotifBadge();
  });

  // Hook log events into notification stream (warn/error only, info too noisy)
  // + live-refresh the activity feed if the user is currently viewing it.
  const origAppendLog = appendLog;
  appendLog = (el, entry, max) => {
    origAppendLog(el, entry, max);
    if (entry.level === 'warn' || entry.level === 'error') pushNotif(entry);
    if (activePage === 'activity' && el?.id === 'ov-log') {
      try { renderActivity(); } catch { /* renderActivity may not be defined yet */ }
    }
  };

  // ===== Favorite button on Now Playing =====
  $('favorite-btn')?.addEventListener('click', () => {
    const q = firstQueue();
    if (!q?.currentSong) return;
    send('favorite_add');
    $('favorite-btn').classList.toggle('starred');
    toast('★ Starred', q.currentSong.name, 'success', 2000);
  });

  // ===== Quick playlist buttons =====
  const renderQuickButtons = () => {
    const server = currentServer();
    const slots = (state?.configs || {})[server?.id]?.quickPlaylists || [null, null, null, null];
    document.querySelectorAll('.quick-btn').forEach((btn, i) => {
      const slot = slots[i];
      btn.textContent = slot?.label || `slot ${i + 1}`;
      btn.classList.toggle('filled', !!slot?.url);
      btn.title = slot?.url || 'Use /quickset to configure this slot';
    });
  };
  document.querySelectorAll('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = Number(btn.dataset.slot);
      send('quick_play', { slot });
    });
  });

  // ===== Search History page =====
  const renderSearches = async () => {
    const out = $('searches-list');
    out.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const res = await fetch('/api/searches');
      const data = await res.json();
      const entries = data.entries || [];
      if (!entries.length) { out.innerHTML = '<div class="queue-empty">— no searches yet —</div>'; return; }
      out.innerHTML = '';
      entries.forEach((e) => {
        const row = document.createElement('div');
        row.className = 'history-row';
        const when = new Date(e.ts).toLocaleString();
        row.innerHTML = `
          <div style="width:56px;height:42px;border-radius:6px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;color:var(--cosmic-bright)">⌕</div>
          <div class="meta">
            <div class="title">${escapeHtmlSafe(e.query)}</div>
            <div class="sub">${e.resultCount} results · ${when}</div>
          </div>
          <button data-q="${escapeHtmlSafe(e.query)}" class="primary">↻ Re-search</button>
        `;
        out.appendChild(row);
      });
      out.querySelectorAll('button[data-q]').forEach((btn) => {
        btn.addEventListener('click', () => {
          $('search-input').value = btn.dataset.q;
          switchPage('search');
          $('search-btn').click();
        });
      });
    } catch (e) {
      out.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
    }
  };
  $('searches-clear')?.addEventListener('click', async () => {
    if (!confirm('Clear all search history?')) return;
    // No dedicated endpoint; rely on persistent clear by emptying via WS or just empty here
    $('searches-list').innerHTML = '<div class="queue-empty">— cleared (UI only — file persists) —</div>';
  });

  // ===== Favorites page =====
  const renderFavorites = async () => {
    const out = $('favorites-list');
    out.innerHTML = '<div class="muted">Loading…</div>';
    const server = currentServer();
    if (!server) { out.innerHTML = '<div class="queue-empty">— bot not in any server —</div>'; return; }
    // Use 'dashboard' as the user id for web-initiated favorites (matches favorite_add WS handler)
    try {
      const res = await fetch(`/api/favorites?guildId=${server.id}&userId=dashboard`);
      const data = await res.json();
      const entries = data.entries || [];
      $('favorites-count').textContent = `${entries.length} starred`;
      if (!entries.length) { out.innerHTML = '<div class="queue-empty">— no favorites yet —</div>'; return; }
      out.innerHTML = '';
      entries.forEach((e) => {
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `
          ${e.thumbnail ? `<img src="${escapeHtmlSafe(e.thumbnail)}" />` : '<div style="width:56px;height:42px;border-radius:6px;background:var(--bg-input)"></div>'}
          <div class="meta">
            <div class="title">★ ${escapeHtmlSafe(e.name)}</div>
            <div class="sub">${escapeHtmlSafe(e.formattedDuration || '')}</div>
          </div>
          <button data-url="${escapeHtmlSafe(e.url || '')}" class="primary">▶ Play</button>
          <button data-rm="${escapeHtmlSafe(e.url || '')}">✕</button>
        `;
        out.appendChild(row);
      });
      out.querySelectorAll('button[data-url]').forEach((btn) => {
        btn.addEventListener('click', () => send('play', { query: btn.dataset.url }));
      });
      out.querySelectorAll('button[data-rm]').forEach((btn) => {
        btn.addEventListener('click', () => {
          send('favorite_remove', { url: btn.dataset.rm });
          setTimeout(renderFavorites, 200);
        });
      });
    } catch (e) {
      out.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
    }
  };

  // ===== Stats time-range chips =====
  let statsRange = 'all';
  document.querySelectorAll('[data-range]').forEach((chip) => {
    chip.addEventListener('click', () => {
      statsRange = chip.dataset.range;
      document.querySelectorAll('[data-range]').forEach((c) => c.classList.toggle('active', c === chip));
      renderStats();
    });
  });

  // Override renderStats to use the current range
  const origRenderStats = renderStats;
  renderStats = async () => {
    try {
      const server = currentServer();
      const url = server ? `/api/stats?guildId=${server.id}&range=${statsRange}` : '/api/stats';
      const res = await fetch(url);
      const s = await res.json();
      $('stats-total').textContent = s.total ?? 0;
      const mins = Math.round((s.totalListeningSec || 0) / 60);
      const hrs = Math.floor(mins / 60);
      $('stats-listen').textContent = hrs ? `${hrs}h ${mins % 60}m` : `${mins}m`;
      $('stats-top-artist').textContent = s.topArtists?.[0]?.name || '—';
      $('stats-top-song').textContent = s.topSongs?.[0]?.name || '—';
      renderDonut(s.topArtists || []);
      const songsHtml = (s.topSongs || []).map((e, i) => `<div class="queue-row">${i + 1}.  ${escapeHtmlSafe(e.name)}  <span class="muted">(${e.count})</span></div>`).join('') || '<div class="queue-empty">no data yet</div>';
      $('stats-songs-list').innerHTML = songsHtml;
      const artistsHtml = (s.topArtists || []).map((e, i) => `<div class="queue-row">${i + 1}.  ${escapeHtmlSafe(e.name)}  <span class="muted">(${e.count})</span></div>`).join('') || '<div class="queue-empty">no data yet</div>';
      $('stats-artists-list').innerHTML = artistsHtml;
      const hours = s.plays24h || new Array(24).fill(0);
      const max = Math.max(1, ...hours);
      const svg = $('stats-hours-chart');
      svg.innerHTML = hours.map((v, h) => {
        const x = (h * 480) / 24;
        const barWidth = 480 / 24 - 2;
        const barHeight = (v / max) * 110;
        const y = 120 - barHeight;
        return `<rect x="${x + 1}" y="${y}" width="${barWidth}" height="${barHeight}" style="fill:var(--cosmic)" rx="2"/><text x="${x + barWidth/2}" y="135" style="fill:var(--fg-dim)" font-size="8" text-anchor="middle">${h}</text>`;
      }).join('');
    } catch (e) { /* silent */ }
  };

  // ===== Top users on Profile page =====
  const origRenderProfile = renderProfile;
  renderProfile = async () => {
    await origRenderProfile();
    const server = currentServer();
    if (!server) return;
    try {
      const res = await fetch(`/api/topusers?guildId=${server.id}`);
      const data = await res.json();
      const users = data.users || [];
      $('prof-topusers').innerHTML = users.length
        ? users.map((u, i) => `<div class="queue-row">${i + 1}.  ${escapeHtmlSafe(u.name)}  <span class="muted">(${u.count})</span></div>`).join('')
        : '<div class="queue-empty">no data</div>';
    } catch { /* silent */ }
  };

  // ===== New settings handlers =====
  const cfgIdle = $('cfg-idle');
  const cfgIdleLabel = $('cfg-idle-label');
  if (cfgIdle) {
    cfgIdle.addEventListener('input', () => { cfgIdleLabel.textContent = `${cfgIdle.value}m`; });
    cfgIdle.addEventListener('change', () => send('set_config', { key: 'idleMinutes', value: +cfgIdle.value }));
  }
  $('cfg-default-loop')?.addEventListener('change', (e) => send('set_config', { key: 'defaultLoopMode', value: Number(e.target.value) }));
  $('cfg-hide-requester')?.addEventListener('change', (e) => send('set_config', { key: 'hideRequester', value: e.target.checked }));
  $('cfg-announce')?.addEventListener('change', (e) => send('set_config', { key: 'announce', value: e.target.checked }));
  $('cfg-crossfade')?.addEventListener('change', (e) => send('set_config', { key: 'crossfade', value: e.target.checked }));
  const cfgWelcome = $('cfg-welcome');
  if (cfgWelcome) {
    cfgWelcome.addEventListener('change', () => send('set_config', { key: 'welcomeSoundUrl', value: cfgWelcome.value.trim() || null }));
  }
  // QR phone access — encodes the dashboard URL into a QR via the free api.qrserver.com
  // (encodes only the URL string; no data exfiltration).
  const renderQr = () => {
    const box = $('qr-canvas');
    const urlEl = $('qr-url');
    if (!box || !urlEl) return;
    const url = `${location.protocol}//${location.host}/`;
    urlEl.textContent = url;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&color=8B5CF6&bgcolor=ffffff&data=${encodeURIComponent(url)}`;
    box.innerHTML = `<img src="${qrSrc}" alt="QR code" style="width:140px;height:140px"/>`;
  };
  renderQr();

  // ===== Invite link =====
  // Backend builds the OAuth2 URL with the right scopes/permissions and the
  // live bot client ID — we just fetch + display + copy.
  const loadInvite = async () => {
    const input = $('invite-url');
    const copyBtn = $('invite-copy');
    const openLink = $('invite-open');
    if (!input || !copyBtn || !openLink) return;
    try {
      const res = await fetch('/api/invite');
      const data = await res.json();
      if (data.url) {
        input.value = data.url;
        openLink.href = data.url;
      } else {
        input.value = '— client ID not available —';
        openLink.removeAttribute('href');
      }
    } catch {
      input.value = '— failed to load invite URL —';
    }
  };
  $('invite-copy')?.addEventListener('click', async () => {
    const input = $('invite-url');
    if (!input?.value || input.value.startsWith('—')) return;
    try {
      await navigator.clipboard.writeText(input.value);
      toast('✦ Copied', 'Invite link copied to clipboard', 'success', 2000);
    } catch {
      // Fallback for non-secure contexts / older browsers
      input.select();
      document.execCommand('copy');
      toast('✦ Copied', 'Invite link copied (fallback)', 'success', 2000);
    }
  });
  loadInvite();

  const cfgBg = $('cfg-bg');
  if (cfgBg) {
    cfgBg.value = savedBg;
    cfgBg.addEventListener('change', () => {
      const v = cfgBg.value.trim();
      localStorage.setItem('maow.customBg', v);
      $('custom-bg').style.backgroundImage = v ? `url(${v})` : '';
    });
  }

  // Patch renderSettings to populate the new fields
  const origRenderSettings = renderSettings;
  renderSettings = function () {
    origRenderSettings();
    const server = currentServer();
    if (!server) return;
    const cfg = (state.configs || {})[server.id] || {};
    if (cfgIdle && document.activeElement !== cfgIdle) {
      cfgIdle.value = cfg.idleMinutes ?? 5;
      cfgIdleLabel.textContent = `${cfgIdle.value}m`;
    }
    if ($('cfg-default-loop')) $('cfg-default-loop').value = String(cfg.defaultLoopMode ?? 0);
    if ($('cfg-hide-requester')) $('cfg-hide-requester').checked = !!cfg.hideRequester;
    if ($('cfg-announce')) $('cfg-announce').checked = !!cfg.announce;
    if ($('cfg-crossfade')) $('cfg-crossfade').checked = !!cfg.crossfade;
    if (cfgWelcome && document.activeElement !== cfgWelcome) cfgWelcome.value = cfg.welcomeSoundUrl || '';
  };

  // Patch renderPlayer to update favorite + quick buttons
  const origRenderPlayer = renderPlayer;
  renderPlayer = function () {
    origRenderPlayer();
    renderQuickButtons();
  };

  // ===== Local library (uploaded songs) =====
  const fmtBytes2 = (b) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  const renderUploads = async () => {
    const out = $('uploads-list');
    const countEl = $('uploads-count');
    if (!out) return;
    try {
      const res = await fetch('/api/library');
      const data = await res.json();
      const songs = data.songs || [];
      if (countEl) countEl.textContent = `${songs.length} song${songs.length === 1 ? '' : 's'}`;
      if (!songs.length) {
        out.innerHTML = '<div class="queue-empty">— no uploads yet —</div>';
        return;
      }
      out.innerHTML = '';
      songs.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'upload-row';
        row.innerHTML = `
          <div style="min-width:0">
            <div class="u-name">${escapeHtmlSafe(s.name)}</div>
            <div class="u-meta">${escapeHtmlSafe(s.ext || '')} · ${fmtBytes2(s.size || 0)}${s.durationSec ? ' · ' + fmtClock(s.durationSec) : ''}</div>
          </div>
          <div class="u-actions">
            <button class="primary" data-act="play" data-id="${escapeHtmlSafe(s.id)}">▶ Play now</button>
            <button data-act="queue" data-id="${escapeHtmlSafe(s.id)}">+ Queue</button>
            <button data-act="preview" data-id="${escapeHtmlSafe(s.id)}" data-file="${escapeHtmlSafe(s.file)}">🔈 Preview</button>
            <button class="danger" data-act="delete" data-id="${escapeHtmlSafe(s.id)}">✕</button>
          </div>`;
        out.appendChild(row);
      });
      out.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const act = btn.dataset.act;
          if (act === 'play') {
            send('library_play', { id });
            toast('♫ Playing now', 'Sent to the bot — make sure it’s in a voice channel', 'success', 2500);
          } else if (act === 'queue') {
            send('library_queue', { id });
            toast('+ Queued', 'Added to the end of the queue', 'success', 2000);
          } else if (act === 'preview') {
            // In-browser preview via the range-supporting /library/<file> route.
            previewAudio(`/library/${encodeURIComponent(btn.dataset.file)}`);
          } else if (act === 'delete') {
            if (!confirm('Delete this uploaded song? This removes the file permanently.')) return;
            fetch('/api/library/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            })
              .then((r) => {
                if (!r.ok) throw new Error(`server returned ${r.status}`);
                toast('✕ Deleted', '', 'info', 1500);
                renderUploads();
              })
              .catch((err) => toast('▲ Delete failed', err.message, 'error', 3000));
          }
        });
      });
    } catch (e) {
      out.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
    }
  };

  // Lightweight in-browser audio preview (shared single <audio> element).
  let previewEl2 = null;
  const previewAudio = (src) => {
    if (!previewEl2) { previewEl2 = new Audio(); }
    if (!previewEl2.paused && previewEl2.src.endsWith(src)) { previewEl2.pause(); return; }
    previewEl2.src = src;
    previewEl2.play().catch(() => toast('▲ Preview failed', 'Browser could not play this file', 'error', 2500));
  };

  // ===== Upload handling (drag-drop + browse) =====
  const uploadZone = $('upload-zone');
  const uploadInput = $('upload-input');
  const uploadProgress = $('upload-progress');

  const uploadFiles = async (files) => {
    const list = [...files];
    if (!list.length) return;
    if (uploadProgress) { uploadProgress.hidden = false; }
    let done = 0;
    for (const file of list) {
      if (uploadProgress) uploadProgress.textContent = `Uploading ${file.name} (${done + 1}/${list.length})…`;
      try {
        const res = await fetch('/api/library/upload', {
          method: 'POST',
          headers: { 'X-Filename': encodeURIComponent(file.name) },
          body: file,
        });
        const data = await res.json();
        if (data.error) { toast('▲ Upload failed', `${file.name}: ${data.error}`, 'error', 4000); }
        else { done++; }
      } catch (e) {
        toast('▲ Upload failed', `${file.name}: ${e.message}`, 'error', 4000);
      }
    }
    if (uploadProgress) {
      uploadProgress.textContent = `✓ Uploaded ${done}/${list.length} file${list.length === 1 ? '' : 's'}.`;
      setTimeout(() => { uploadProgress.hidden = true; }, 3000);
    }
    if (done) toast('⬆ Uploaded', `${done} song${done === 1 ? '' : 's'} added to your library`, 'success', 2500);
    renderUploads();
  };

  if (uploadZone && uploadInput) {
    uploadZone.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', () => { uploadFiles(uploadInput.files); uploadInput.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) =>
      uploadZone.addEventListener(ev, (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) =>
      uploadZone.addEventListener(ev, (e) => { e.preventDefault(); uploadZone.classList.remove('dragover'); }));
    uploadZone.addEventListener('drop', (e) => {
      if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
    });
  }

  connect();
})();
