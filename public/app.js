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

  // ===== Multi-bot instance registry (v2.0.0) =====
  //
  // The dashboard can talk to multiple MaowCore instances. Each instance is
  // stored in localStorage with its base URL + Bearer token. The active
  // instance drives every API call + WebSocket connection.
  //
  // Default: one instance pointing at the same origin we were served from
  // (legacy single-bot behavior, no auth required if the bot has no
  // CONTROL_TOKEN set).
  const instancesState = {
    instances: [],
    activeId: null,
    healthByInstance: {},     // id → { status, version, botTag, lastCheck }
  };

  function loadInstances() {
    try {
      const raw = localStorage.getItem('maow.instances');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.instances) && parsed.instances.length) {
        instancesState.instances = parsed.instances;
        instancesState.activeId = parsed.activeId || parsed.instances[0]?.id || null;
        return;
      }
    } catch { /* */ }
    // Default: same-origin instance with no token (legacy single-bot mode).
    instancesState.instances = [{
      id: 'local',
      name: 'This bot',
      url: location.origin,
      token: '',
    }];
    instancesState.activeId = 'local';
  }
  function saveInstances() {
    localStorage.setItem('maow.instances', JSON.stringify({
      instances: instancesState.instances,
      activeId: instancesState.activeId,
    }));
  }
  function activeInstance() {
    return instancesState.instances.find((i) => i.id === instancesState.activeId)
      || instancesState.instances[0]
      || { id: 'local', name: 'Local', url: location.origin, token: '' };
  }
  loadInstances();

  // Wrap fetch+json so a 404 that returns the static-file "Not found" body
  // (i.e. the route doesn't exist in the running backend yet — usually the bot
  // wasn't restarted after pulling a new version) shows a clear hint instead
  // of "Unexpected token 'N', "Not found" is not valid JSON".
  //
  // Also: route all API calls through the *active instance* so multi-bot
  // setups send each request to the right bot. Absolute URLs are left alone
  // so we don't double-prefix.
  async function fetchJson(url, opts = {}) {
    const inst = activeInstance();
    const isAbsolute = /^https?:\/\//i.test(url);
    const fullUrl = isAbsolute ? url : `${inst.url.replace(/\/$/, '')}${url.startsWith('/') ? url : '/' + url}`;
    const headers = { ...(opts.headers || {}) };
    if (inst.token && !headers.Authorization) {
      headers.Authorization = `Bearer ${inst.token}`;
    }
    // Retry once on transient network failure — multi-bot dashboards have to
    // tolerate brief instance restarts gracefully.
    const doFetch = async () => fetch(fullUrl, { ...opts, headers });
    let res;
    try { res = await doFetch(); }
    catch (e) {
      // Connection refused / DNS — wait 400ms and try once more before giving up.
      await new Promise((r) => setTimeout(r, 400));
      res = await doFetch();
    }
    if (res.status === 401) {
      throw new Error(
        `${inst.name}: 401 Unauthorized. Check the Bearer token on this instance.`,
      );
    }
    const text = await res.text();
    if (!res.ok && /^Not found/i.test(text.trim())) {
      throw new Error(
        `Endpoint ${url.split('?')[0]} not registered on ${inst.name}. Restart that bot — it's running an older version than the dashboard.`,
      );
    }
    try { return JSON.parse(text); }
    catch {
      throw new Error(`${inst.name} returned non-JSON for ${url.split('?')[0]} (HTTP ${res.status}). Restart the bot if it's running an older version.`);
    }
  }

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
    // When a sub-page activates, ensure its parent nav-group is expanded so the
    // user can see what they navigated to.
    const activeItem = document.querySelector(`.nav-item[data-page="${name}"]`);
    const parentGroup = activeItem?.closest('.nav-group');
    if (parentGroup) parentGroup.classList.remove('collapsed');
    if (state) renderAll();
  }

  // ===== Collapsible nav groups =====
  const collapsedGroups = new Set(JSON.parse(localStorage.getItem('maow.navCollapsed') || '[]'));
  $$('.nav-group').forEach((g) => {
    const key = g.dataset.group;
    if (collapsedGroups.has(key)) g.classList.add('collapsed');
    g.querySelector('.nav-group-head')?.addEventListener('click', () => {
      g.classList.toggle('collapsed');
      if (g.classList.contains('collapsed')) collapsedGroups.add(key);
      else collapsedGroups.delete(key);
      localStorage.setItem('maow.navCollapsed', JSON.stringify([...collapsedGroups]));
    });
  });

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
  // Connects to the *active instance*. Tokens go in the query string because
  // browser WebSocket can't set custom headers. Reconnects automatically; if
  // the active instance changes, switchInstance() closes this socket which
  // triggers the auto-reconnect against the new instance.
  function connect() {
    const inst = activeInstance();
    const wsUrl = new URL(inst.url);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    if (inst.token) wsUrl.searchParams.set('token', inst.token);
    try { ws = new WebSocket(wsUrl.toString()); }
    catch (e) { setStatus(false, `connect failed: ${e.message}`); setTimeout(connect, 2000); return; }
    setStatus(false, `connecting to ${inst.name}…`);
    ws.onopen = () => { connected = true; setStatus(true, `connected to ${inst.name}`); };
    ws.onclose = () => { connected = false; setStatus(false, 'disconnected'); setTimeout(connect, 2000); };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      try { handle(JSON.parse(e.data)); }
      catch (err) { console.warn('[dashboard] handler error:', err); }
    };
  }

  // Switch to a different instance. Closes the current WS (auto-reconnects
  // to the new instance) and refreshes the current page's data.
  function switchInstance(id) {
    if (!instancesState.instances.find((i) => i.id === id)) return;
    instancesState.activeId = id;
    saveInstances();
    // Visual: fade out, switch, fade in.
    document.querySelectorAll('.page').forEach((p) => p.classList.add('switching'));
    // Reset state so we don't show stale data from the previous instance.
    state = null;
    // Close current WS — onclose triggers auto-reconnect against new instance.
    try { ws?.close(); } catch { /* */ }
    // Visual feedback + re-render the current page if it has its own renderer.
    setTimeout(() => {
      renderInstancePicker();
      if (typeof renderAll === 'function') renderAll();
      document.querySelectorAll('.page').forEach((p) => p.classList.remove('switching'));
    }, 200);
  }

  // ===== Instance picker UI =====
  function renderInstancePicker() {
    // Update topbar chip
    const inst = activeInstance();
    const nameEl = document.getElementById('topbar-instance-name');
    const chip = document.getElementById('topbar-instance');
    if (nameEl) nameEl.textContent = inst.name;
    if (chip) {
      const h = instancesState.healthByInstance[inst.id]?.status || 'pending';
      chip.setAttribute('data-health', h === 'pending' ? '' : h);
    }
    // Update popover list
    const list = document.getElementById('instance-picker-list');
    if (!list) return;
    list.innerHTML = '';
    instancesState.instances.forEach((i) => {
      const item = document.createElement('div');
      item.className = 'instance-picker-item' + (i.id === inst.id ? ' active' : '');
      const h = instancesState.healthByInstance[i.id]?.status || '';
      if (h) item.setAttribute('data-health', h);
      item.innerHTML = `
        <span class="ip-dot"></span>
        <div>
          <div class="ip-name">${escapeHtmlSafe(i.name)}</div>
          <div class="ip-url">${escapeHtmlSafe(i.url)}</div>
        </div>
        <button class="ip-edit" data-id="${escapeHtmlSafe(i.id)}" title="Edit">✎</button>`;
      item.addEventListener('click', (ev) => {
        if (ev.target.classList.contains('ip-edit')) return;
        if (i.id !== inst.id) switchInstance(i.id);
        document.getElementById('instance-picker').classList.add('hidden');
      });
      item.querySelector('.ip-edit').addEventListener('click', (ev) => {
        ev.stopPropagation();
        openInstanceModal(i.id);
      });
      list.appendChild(item);
    });
  }

  // Topbar picker toggle.
  document.getElementById('topbar-instance')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const picker = document.getElementById('instance-picker');
    picker?.classList.toggle('hidden');
    renderInstancePicker();
  });
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('instance-picker');
    if (!picker || picker.classList.contains('hidden')) return;
    if (!picker.contains(e.target) && e.target.id !== 'topbar-instance' && !document.getElementById('topbar-instance').contains(e.target)) {
      picker.classList.add('hidden');
    }
  });

  // ===== Instance add/edit modal =====
  let editingInstanceId = null;
  function openInstanceModal(id) {
    editingInstanceId = id;
    const modal = document.getElementById('instance-modal');
    const title = document.getElementById('instance-modal-title');
    const inst = id ? instancesState.instances.find((i) => i.id === id) : null;
    if (inst) {
      title.textContent = `Edit instance: ${inst.name}`;
      document.getElementById('instance-edit-name').value = inst.name;
      document.getElementById('instance-edit-url').value = inst.url;
      document.getElementById('instance-edit-token').value = inst.token || '';
    } else {
      title.textContent = 'Add bot instance';
      document.getElementById('instance-edit-name').value = '';
      document.getElementById('instance-edit-url').value = 'http://127.0.0.1:8765';
      document.getElementById('instance-edit-token').value = '';
    }
    document.getElementById('instance-edit-status').textContent = '—';
    modal.classList.remove('hidden');
    document.getElementById('instance-picker')?.classList.add('hidden');
  }
  function closeInstanceModal() {
    document.getElementById('instance-modal').classList.add('hidden');
    editingInstanceId = null;
  }
  document.getElementById('instance-modal-close')?.addEventListener('click', closeInstanceModal);
  document.getElementById('instance-cancel-btn')?.addEventListener('click', closeInstanceModal);
  document.getElementById('instance-add-btn')?.addEventListener('click', () => openInstanceModal(null));

  document.getElementById('instance-save-btn')?.addEventListener('click', () => {
    const name = document.getElementById('instance-edit-name').value.trim();
    const url = document.getElementById('instance-edit-url').value.trim().replace(/\/$/, '');
    const token = document.getElementById('instance-edit-token').value.trim();
    if (!name || !url) return toast('▲ Missing fields', 'Name + URL required.', 'error', 2500);
    if (!/^https?:\/\//.test(url)) return toast('▲ Bad URL', 'Must start with http:// or https://', 'error', 2500);
    if (editingInstanceId) {
      const inst = instancesState.instances.find((i) => i.id === editingInstanceId);
      if (inst) { inst.name = name; inst.url = url; inst.token = token; }
    } else {
      const id = `inst-${Date.now().toString(36)}`;
      instancesState.instances.push({ id, name, url, token });
      // Auto-activate newly-added instances.
      switchInstance(id);
    }
    saveInstances();
    closeInstanceModal();
    renderInstancePicker();
    probeAllInstances();
    toast('✓ Saved', name, 'success', 2000);
  });

  document.getElementById('instance-test-btn')?.addEventListener('click', async () => {
    const url = document.getElementById('instance-edit-url').value.trim().replace(/\/$/, '');
    const token = document.getElementById('instance-edit-token').value.trim();
    const status = document.getElementById('instance-edit-status');
    status.textContent = 'Probing…';
    try {
      const res = await fetch(`${url}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      let msg = `✓ ${data.name || 'bot'} · v${data.version || '?'}`;
      if (data.botTag) msg += ` · ${data.botTag}`;
      if (data.authRequired && !token) msg += '  (▲ this bot requires a token)';
      else if (data.authRequired && token) {
        // Verify token works by hitting an auth'd endpoint.
        const authRes = await fetch(`${url}/api/library`, { headers: { Authorization: `Bearer ${token}` } });
        if (authRes.status === 401) msg += '  (▲ wrong token)';
        else msg += '  ✓ token ok';
      }
      status.textContent = msg;
      status.style.color = msg.includes('▲') ? 'var(--warning)' : 'var(--success)';
    } catch (e) {
      status.textContent = `▲ ${e.message}`;
      status.style.color = 'var(--danger)';
    }
  });

  // ===== Health probes for all instances =====
  async function probeInstance(inst) {
    const start = Date.now();
    try {
      const res = await fetch(`${inst.url}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      instancesState.healthByInstance[inst.id] = {
        status: 'ok',
        version: data.version,
        botTag: data.botTag,
        latencyMs: Date.now() - start,
        lastCheck: Date.now(),
      };
    } catch (e) {
      instancesState.healthByInstance[inst.id] = {
        status: 'down',
        error: e.message,
        lastCheck: Date.now(),
      };
    }
  }
  async function probeAllInstances() {
    await Promise.all(instancesState.instances.map(probeInstance));
    renderInstancePicker();
    if (activePage === 'fleet') renderFleet();
  }
  // Initial probe + then every 15s while the dashboard is open.
  setTimeout(probeAllInstances, 500);
  setInterval(probeAllInstances, 15000);

  // ===== Fleet page =====
  function renderFleet() {
    const grid = document.getElementById('fleet-grid');
    if (!grid) return;
    if (!instancesState.instances.length) {
      grid.innerHTML = '<div class="muted">No instances configured. Click + Add instance to get started.</div>';
      return;
    }
    grid.innerHTML = '';
    instancesState.instances.forEach((inst) => {
      const h = instancesState.healthByInstance[inst.id] || { status: 'pending' };
      const card = document.createElement('div');
      card.className = 'fleet-card' + (inst.id === instancesState.activeId ? ' active' : '');
      card.setAttribute('data-health', h.status || 'pending');
      const errHtml = h.status === 'down' ? `<div class="fleet-card-err">▲ ${escapeHtmlSafe(h.error || 'unreachable')}</div>` : '';
      card.innerHTML = `
        <div class="fleet-card-head">
          <div class="fleet-card-name">${escapeHtmlSafe(inst.name)}</div>
          <div class="fleet-card-version">${escapeHtmlSafe(h.version ? 'v' + h.version : '?')}</div>
        </div>
        <div class="fleet-card-url">${escapeHtmlSafe(inst.url)}</div>
        <div class="fleet-card-stats">
          <div><div class="fs-label">Bot</div><div class="fs-val">${escapeHtmlSafe(h.botTag || '—')}</div></div>
          <div><div class="fs-label">Latency</div><div class="fs-val">${h.latencyMs != null ? h.latencyMs + ' ms' : '—'}</div></div>
        </div>
        ${errHtml}`;
      card.addEventListener('click', () => {
        if (inst.id !== instancesState.activeId) switchInstance(inst.id);
        else switchPage('home');
      });
      grid.appendChild(card);
    });
  }
  document.getElementById('fleet-add')?.addEventListener('click', () => openInstanceModal(null));
  document.getElementById('fleet-refresh')?.addEventListener('click', probeAllInstances);

  // Hook into page switcher.
  const origSwitchPageMulti = switchPage;
  switchPage = (name) => {
    origSwitchPageMulti(name);
    if (name === 'fleet') renderFleet();
    if (name === 'social') renderSocialPage();
    if (name === 'cleanup') renderCleanupPage();
  };
  // Initial picker render
  setTimeout(renderInstancePicker, 50);

  // ===== v2.1.0 — Dashboard auth (Discord OAuth) =====
  // Bootstrap: read #maow_session=... from URL hash and store it.
  (function bootstrapSession() {
    const m = location.hash.match(/maow_session=([^&]+)/);
    if (m) {
      localStorage.setItem('maow.session', decodeURIComponent(m[1]));
      history.replaceState(null, '', location.pathname);
    }
  })();
  const maowSession = () => localStorage.getItem('maow.session') || '';

  // Augment fetchJson to include the session header.
  const origFetchJsonForAuth = fetchJson;
  fetchJson = (url, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    const sess = maowSession();
    if (sess) headers['X-Maow-Session'] = sess;
    return origFetchJsonForAuth(url, { ...opts, headers });
  };

  const authState = { configured: false, user: null };
  async function refreshAuthState() {
    try {
      const data = await fetchJson('/api/auth/me');
      authState.configured = !!data.configured;
      authState.user = data.user || null;
    } catch { /* */ }
    renderLoginButton();
  }
  function renderLoginButton() {
    const btn = $('topbar-login');
    const txt = $('topbar-login-text');
    if (!btn || !txt) return;
    if (!authState.configured) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    if (authState.user) {
      btn.classList.add('logged-in');
      btn.innerHTML = `${authState.user.avatar ? `<img src="${escapeHtmlSafe(authState.user.avatar)}" />` : ''}<span>${escapeHtmlSafe(authState.user.tag)}</span>`;
    } else {
      btn.classList.remove('logged-in');
      btn.innerHTML = '<span id="topbar-login-text">Sign in with Discord</span>';
    }
  }
  $('topbar-login')?.addEventListener('click', async () => {
    if (authState.user) {
      if (!confirm(`Sign out (${authState.user.tag})?`)) return;
      try {
        await fetchJson('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('maow.session');
        authState.user = null;
        renderLoginButton();
        toast('✓ Signed out', '', 'info', 1500);
      } catch (e) { toast('▲ Sign-out failed', e.message, 'error', 3000); }
      return;
    }
    try {
      const callback = `${activeInstance().url}/api/auth/discord/callback`;
      const data = await fetchJson('/api/auth/discord/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirect: callback }),
      });
      if (data.error) throw new Error(data.error);
      window.location.href = data.authUrl;
    } catch (e) { toast('▲ Sign-in failed', e.message, 'error', 4000); }
  });
  setTimeout(refreshAuthState, 200);

  // ===== Social page =====
  async function renderSocialPage() {
    const gId = activeGuildId();
    if (!gId) {
      $('lb-list').innerHTML = '<div class="muted">Select a server first.</div>';
      return;
    }
    try {
      const lb = await fetchJson(`/api/social/leaderboard?guildId=${encodeURIComponent(gId)}&limit=20`);
      const lbList = $('lb-list');
      const lbSummary = $('lb-summary');
      const entries = lb.leaderboard || [];
      lbSummary.textContent = `${entries.length} top listener${entries.length === 1 ? '' : 's'} (last 500 plays)`;
      lbList.innerHTML = entries.map((u, i) =>
        `<div class="lb-row"><div class="lb-rank">${i + 1}.</div><div><div class="lb-name">${escapeHtmlSafe(u.user)}</div><div class="lb-stats">${u.plays} plays · ${Math.round(u.totalSec / 60)} min</div></div></div>`,
      ).join('') || '<div class="muted">No plays recorded yet.</div>';
    } catch (e) {
      $('lb-list').innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
    }
    try {
      const tr = await fetchJson(`/api/social/top-rated?guildId=${encodeURIComponent(gId)}&limit=20`);
      const list = $('top-rated-list');
      const entries = tr.topRated || [];
      list.innerHTML = entries.map((t, i) => {
        const stars = '★'.repeat(Math.round(t.average)) + '☆'.repeat(5 - Math.round(t.average));
        return `<div class="tr-row"><div class="tr-rank">${i + 1}.</div><div><div class="tr-name">${escapeHtmlSafe(t.name)}</div><div class="lb-stats">${t.count} rating${t.count === 1 ? '' : 's'}</div></div><div class="tr-stars">${stars}</div></div>`;
      }).join('') || '<div class="muted">No rated tracks yet — rate some songs from the queue or history.</div>';
    } catch { /* */ }
    // Profile form
    const profileWrap = $('my-profile-form');
    if (authState.user) {
      const p = (await fetchJson(`/api/social/profile?guildId=${encodeURIComponent(gId)}&userId=${encodeURIComponent(authState.user.userId)}`)).profile || {};
      profileWrap.innerHTML = `
        <div class="profile-form">
          ${authState.user.avatar ? `<img src="${escapeHtmlSafe(authState.user.avatar)}" style="width:48px;height:48px;border-radius:50%;margin-bottom:8px" />` : ''}
          <div style="margin-bottom:8px"><strong>${escapeHtmlSafe(authState.user.tag)}</strong></div>
          <input id="profile-bio" placeholder="Bio (280 chars)" value="${escapeHtmlSafe(p.bio || '')}" />
          <input id="profile-favorite" placeholder="Favorite song" value="${escapeHtmlSafe(p.favoriteSong || '')}" />
          <button id="profile-save">Save</button>
        </div>`;
      $('profile-save').addEventListener('click', async () => {
        try {
          await fetchJson('/api/social/profile', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: gId, bio: $('profile-bio').value, favoriteSong: $('profile-favorite').value }),
          });
          toast('✓ Profile saved', '', 'success', 2000);
        } catch (e) { toast('▲ Save failed', e.message, 'error', 3000); }
      });
    } else {
      profileWrap.innerHTML = '<div class="muted small">Sign in with Discord (top-right) to set up your profile.</div>';
    }
  }
  $('social-refresh')?.addEventListener('click', renderSocialPage);

  // ===== Cleanup page =====
  async function renderCleanupPage(report) {
    if (!report) {
      $('cleanup-report').innerHTML = '<div class="muted">Click <strong>⟳ Scan</strong> to look for issues.</div>';
      return;
    }
    const wrap = $('cleanup-report');
    $('cleanup-summary').textContent = `${report.totalSongs} song${report.totalSongs === 1 ? '' : 's'} · ${(report.totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB · scanned ${new Date(report.scannedAt).toLocaleTimeString()}`;
    const section = (title, count, html) => `
      <div class="cleanup-section">
        <h4>${escapeHtmlSafe(title)} <span class="cs-count">${count}</span></h4>
        ${html}
      </div>`;
    const fmtSize = (b) => b < 1024 * 1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`;
    wrap.innerHTML = '';
    // Storage breakdown
    const bd = report.breakdown || {};
    const bdHtml = Object.entries(bd).map(([ext, v]) =>
      `<span class="cs-format">.${ext}: ${v.count} (${fmtSize(v.bytes)})</span>`).join('');
    wrap.insertAdjacentHTML('beforeend', section('Storage breakdown', Object.keys(bd).length + ' formats', bdHtml || '<div class="muted">—</div>'));
    // Orphans
    const orphansHtml = report.orphans.map((o) =>
      `<div class="cleanup-item"><input type="checkbox" data-file="${escapeHtmlSafe(o.file)}" checked /><span>${escapeHtmlSafe(o.file)}</span><span class="ci-size">${fmtSize(o.size)}</span></div>`).join('');
    const orphanFooter = report.orphans.length
      ? `<div class="cs-actions"><button id="del-orphans-btn" class="primary" style="background:var(--danger)">✕ Delete selected</button></div>`
      : '';
    wrap.insertAdjacentHTML('beforeend', section('Orphan files (on disk, not in manifest)', report.orphans.length,
      orphansHtml + orphanFooter));
    // Dupes
    const dupesHtml = report.dupes.slice(0, 50).map((d) => {
      const songs = d.songs.map((s) => `<div class="cleanup-item"><span>${escapeHtmlSafe(s.name)}</span><span class="ci-size">${fmtSize(s.size)}</span></div>`).join('');
      return `<div style="margin-bottom:8px"><div class="muted small">${d.kind === 'sourceUrl' ? 'same source' : 'same name'}: ${escapeHtmlSafe(String(d.key).slice(0, 80))}</div>${songs}</div>`;
    }).join('');
    wrap.insertAdjacentHTML('beforeend', section('Duplicates', report.dupes.length, dupesHtml || '<div class="muted">None found.</div>'));
    // Unplayed
    const unplayedHtml = report.unplayed.slice(0, 50).map((u) =>
      `<div class="cleanup-item"><span>${escapeHtmlSafe(u.name)}</span><span class="ci-size">${fmtSize(u.size)}</span></div>`).join('');
    wrap.insertAdjacentHTML('beforeend', section(`Unplayed in last ${report.unplayedDays} days`, report.unplayed.length,
      unplayedHtml + (report.unplayed.length > 50 ? '<div class="muted small">…and more</div>' : '')));
    // Missing durations
    const missingHtml = report.missingDuration.slice(0, 50).map((m) =>
      `<div class="cleanup-item"><span>${escapeHtmlSafe(m.name)}</span></div>`).join('');
    const missingFooter = report.missingDuration.length
      ? `<div class="cs-actions"><button id="probe-btn" class="primary">🩺 Re-probe via ffmpeg</button></div>`
      : '';
    wrap.insertAdjacentHTML('beforeend', section('Missing duration', report.missingDuration.length, missingHtml + missingFooter));

    // Wire actions
    $('del-orphans-btn')?.addEventListener('click', async () => {
      const checks = wrap.querySelectorAll('input[type="checkbox"][data-file]');
      const files = [...checks].filter((c) => c.checked).map((c) => c.dataset.file);
      if (!files.length) return;
      if (!confirm(`Delete ${files.length} orphan file${files.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
      try {
        const data = await fetchJson('/api/library/cleanup/delete-orphans', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        });
        const ok = data.results.filter((r) => r.ok).length;
        toast('🧹 Deleted', `${ok}/${data.results.length} orphans`, 'success', 2500);
        runCleanupScan();
      } catch (e) { toast('▲ Delete failed', e.message, 'error', 4000); }
    });
    $('probe-btn')?.addEventListener('click', async () => {
      try {
        const data = await fetchJson('/api/library/cleanup/probe-missing', { method: 'POST' });
        toast('🩺 Probed', `${data.result.probed}/${data.result.attempted} durations recovered`, 'success', 3000);
        runCleanupScan();
      } catch (e) { toast('▲ Probe failed', e.message, 'error', 4000); }
    });
  }
  async function runCleanupScan() {
    $('cleanup-report').innerHTML = '<div class="muted">Scanning…</div>';
    try {
      const data = await fetchJson('/api/library/cleanup/scan');
      if (data.error) throw new Error(data.error);
      renderCleanupPage(data.report);
    } catch (e) {
      $('cleanup-report').innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
    }
  }
  $('cleanup-scan')?.addEventListener('click', runCleanupScan);
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

  // ===== Brand icon picker =====
  const savedBrandIcon = localStorage.getItem('maow.brandIcon') || '✦';
  const brandMarkEl = $('brand-mark');
  const iconPickerEl = $('icon-picker');
  if (brandMarkEl) brandMarkEl.textContent = savedBrandIcon;
  iconPickerEl?.querySelectorAll('[data-icon]').forEach((btn) => {
    if (btn.dataset.icon === savedBrandIcon) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const icon = btn.dataset.icon;
      if (brandMarkEl) brandMarkEl.textContent = icon;
      localStorage.setItem('maow.brandIcon', icon);
      iconPickerEl.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('active', b === btn));
      iconPickerEl.classList.add('hidden');
    });
  });
  brandMarkEl?.addEventListener('click', (e) => {
    e.stopPropagation();
    iconPickerEl?.classList.toggle('hidden');
  });
  // Click-outside to close.
  document.addEventListener('click', (e) => {
    if (!iconPickerEl || iconPickerEl.classList.contains('hidden')) return;
    if (!iconPickerEl.contains(e.target) && e.target !== brandMarkEl) {
      iconPickerEl.classList.add('hidden');
    }
  });

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
        d.innerHTML =
          `<span class="qr-drag" title="Drag to reorder">⋮⋮</span>` +
          `<span class="qr-pos">${String(i+1).padStart(2,' ')}.</span>` +
          ` <span class="qr-name">${escapeHtmlSafe(song.name)}</span>` +
          ` <span class="qr-dur muted">[${song.formattedDuration}]</span>` +
          ` <button class="qr-remove" data-idx="${i + 1}" title="Remove from queue">✕</button>`;
        // Hover preview popover
        d.addEventListener('mouseenter', (e) => showQueuePreview(e, song));
        d.addEventListener('mouseleave', hideQueuePreview);
        // Drag-drop reordering — send queue_move (backend accepts both
        // queue_move and queue_reorder as aliases).
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
        // Per-row remove
        d.querySelector('.qr-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number(e.currentTarget.dataset.idx);
          send('queue_remove', { index: idx });
          toast('✕ Removed', `Position ${idx}`, 'info', 1500);
        });
        queueEl.appendChild(d);
      });
      // Inject a queue toolbar above the queue if not already there.
      if (!document.getElementById('queue-toolbar')) {
        const toolbar = document.createElement('div');
        toolbar.id = 'queue-toolbar';
        toolbar.className = 'queue-toolbar';
        toolbar.innerHTML = `
          <button id="queue-save-as" class="link">💾  Save as playlist</button>
          <span class="muted small" id="queue-toolbar-count"></span>`;
        queueEl.parentElement?.insertBefore(toolbar, queueEl);
        toolbar.querySelector('#queue-save-as').addEventListener('click', () => {
          const name = prompt('Save current queue as playlist — name:');
          if (!name) return;
          const userId = window.localStorage.getItem('maow.userId')
            || prompt('Your Discord user ID (for ownership of the saved playlist):');
          if (!userId) return toast('▲ Cancelled', 'User ID required.', 'error', 2500);
          window.localStorage.setItem('maow.userId', userId);
          send('queue_save_as_playlist', { name, userId });
          toast('💾 Saving', name, 'info', 2000);
        });
      }
      const tbc = document.getElementById('queue-toolbar-count');
      if (tbc) tbc.textContent = `${q.upcoming.length} song${q.upcoming.length === 1 ? '' : 's'} upcoming`;
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
    // Also feed the diagnostics page + mini-panel.
    try { feedDiagnostics(entry); } catch { /* defined below */ }
  };

  // ===== Diagnostics page + mini-panel =====
  const diagState = {
    logs: [],                 // rolling buffer of all log entries
    maxLogs: 2000,            // larger than the main console — the diag page is the source of truth
    snapshot: null,           // last `diagnostics` payload from the server
    filterCat: localStorage.getItem('maow.diagCat') || 'all',
    filterLevel: localStorage.getItem('maow.diagLevel') || null,
    search: '',
    paused: false,
    miniSeenErrorCount: Number(localStorage.getItem('maow.diagSeenErrors') || 0),
    miniOpen: false,
  };
  let diagSearchTimer = null;

  function feedDiagnostics(entry) {
    diagState.logs.push(entry);
    while (diagState.logs.length > diagState.maxLogs) diagState.logs.shift();
    // Live-append to the dedicated console if user is on the page.
    if (activePage === 'diagnostics') appendDiagRow(entry);
    // Always update the mini-panel + chip (visible across pages).
    appendMiniRow(entry);
    updateMiniChip();
    // Update nav badge if we're not on the page.
    updateNavDiagBadge();
  }

  function diagRowMatches(entry) {
    if (diagState.filterCat !== 'all' && entry.category !== diagState.filterCat) return false;
    if (diagState.filterLevel && entry.level !== diagState.filterLevel) return false;
    if (diagState.search) {
      const s = diagState.search.toLowerCase();
      const text = (entry.text || '').toLowerCase();
      const cat = (entry.category || '').toLowerCase();
      if (!text.includes(s) && !cat.includes(s)) return false;
    }
    return true;
  }

  function appendDiagRow(entry) {
    const cons = $('diag-console');
    if (!cons) return;
    const row = document.createElement('div');
    row.className = `row ${entry.level || 'info'}`;
    if (!diagRowMatches(entry)) row.classList.add('hidden');
    const ts = new Date(entry.ts || Date.now()).toLocaleTimeString();
    const cat = entry.category || 'system';
    row.innerHTML =
      `<span class="ts">${ts}</span>` +
      `<span class="cat ${escapeHtmlSafe(cat)}">${escapeHtmlSafe(cat)}</span>` +
      `<span class="msg">${escapeHtmlSafe(entry.text || '')}</span>`;
    if (entry.meta) row.title = JSON.stringify(entry.meta, null, 2);
    cons.appendChild(row);
    while (cons.children.length > diagState.maxLogs) cons.removeChild(cons.firstChild);
    if (!diagState.paused) cons.scrollTop = cons.scrollHeight;
    updateDiagMeta();
  }

  function updateDiagMeta() {
    const meta = $('diag-meta');
    if (!meta) return;
    const total = diagState.logs.length;
    const visible = Array.from($('diag-console')?.children || []).filter((r) => !r.classList.contains('hidden')).length;
    meta.textContent = diagState.filterCat === 'all' && !diagState.filterLevel && !diagState.search
      ? `${total} entries`
      : `${visible} matching · ${total} total`;
  }

  function rerenderDiagConsole() {
    const cons = $('diag-console');
    if (!cons) return;
    cons.innerHTML = '';
    diagState.logs.forEach((e) => appendDiagRow(e));
  }

  function renderBootTimeline() {
    const ol = $('boot-timeline');
    const sum = $('boot-summary');
    if (!ol) return;
    const boot = diagState.snapshot?.boot;
    if (!boot) { ol.innerHTML = '<li class="muted small">No data yet.</li>'; return; }
    ol.innerHTML = '';
    const iconFor = (s) => ({ ok: '✓', fail: '✕', running: '⏱', pending: '○', skip: '−' }[s] || '?');
    boot.forEach((step) => {
      const li = document.createElement('li');
      li.className = 'boot-step';
      li.setAttribute('data-status', step.status);
      const dur = step.durationMs != null ? `${step.durationMs}ms` : (step.status === 'running' ? '…' : '');
      const detail = step.detail ? escapeHtmlSafe(String(step.detail)) : (step.status === 'pending' ? '<span class="muted">pending</span>' : '');
      li.innerHTML =
        `<span class="b-icon">${iconFor(step.status)}</span>` +
        `<span class="b-label">${escapeHtmlSafe(step.label)}</span>` +
        `<span class="b-detail" title="${detail.replace(/"/g, '&quot;')}">${dur ? `<code>${dur}</code> · ` : ''}${detail}</span>`;
      ol.appendChild(li);
    });
    if (sum) {
      const failed = boot.filter((s) => s.status === 'fail').length;
      const okCount = boot.filter((s) => s.status === 'ok').length;
      const pending = boot.filter((s) => s.status === 'pending' || s.status === 'running').length;
      sum.innerHTML = failed
        ? `<span style="color:var(--danger)">${failed} failed</span> · ${okCount} ok · ${pending} pending`
        : pending ? `${okCount} ok · ${pending} pending` : `${okCount} steps ok`;
    }
  }

  function renderHealthDiagram() {
    const health = diagState.snapshot?.health;
    if (!health) return;
    const subText = {
      discord: () => state?.stats?.discordStatus ? `${state.stats.discordStatus}` : 'gateway',
      distube: () => `${state?.queues?.length || 0} queue${state?.queues?.length === 1 ? '' : 's'}`,
      ytdlp:   () => 'streaming',
      ffmpeg:  () => 'transcoding',
      voice:   () => `${state?.stats?.voiceConnections || 0} connection${(state?.stats?.voiceConnections || 0) === 1 ? '' : 's'}`,
      http:    () => 'control server',
      library: () => 'storage',
    };
    Object.entries(health).forEach(([sys, status]) => {
      const node = document.querySelector(`.flow-node[data-sys="${sys}"]`);
      if (!node) return;
      node.setAttribute('data-health', status);
      const sub = $(`flow-${sys}-sub`);
      if (sub) sub.textContent = status === 'down' ? '✕ errors in 5m' : status === 'degraded' ? '▲ warnings' : (subText[sys]?.() || 'ok');
    });
  }

  function renderMetrics() {
    const c = diagState.snapshot?.counters;
    if (!c) return;
    const setMetric = (key, cat) => {
      const m1 = $(`metric-${key}-m1`);
      const m5 = $(`metric-${key}-m5`);
      if (!m1) return;
      const v1 = c.m1[cat] || 0;
      const v5 = c.m5[cat] || 0;
      m1.textContent = String(v1);
      m5.textContent = `${v5} in 5m`;
      const tile = m1.closest('.metric');
      if (tile) {
        tile.classList.remove('hot', 'warm');
        if (cat === 'error' && v5 > 0) tile.classList.add('hot');
        else if (cat === 'warn' && v5 > 0) tile.classList.add('warm');
      }
    };
    setMetric('error',   'error');
    setMetric('warn',    'warn');
    setMetric('cmd',     'command');
    setMetric('play',    'play');
    setMetric('search',  'search');
    setMetric('voice',   'voice');
    setMetric('install', 'install');
    setMetric('upload',  'upload');
  }

  function renderRecentErrors() {
    const list = $('recent-errors-list');
    if (!list) return;
    const errs = diagState.snapshot?.recentErrors || {};
    const grouped = Object.entries(errs).filter(([, arr]) => arr.length > 0);
    if (!grouped.length) {
      list.innerHTML = '<div class="muted small">No errors recorded since startup. ✓</div>';
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'recent-errors-grid';
    grouped.forEach(([sys, arr]) => {
      const card = document.createElement('div');
      card.className = 'recent-errors-sys';
      const newest = arr.slice(-5).reverse();
      card.innerHTML =
        `<div class="res-head"><span>${escapeHtmlSafe(sys)}</span><span class="muted small">${arr.length} recent</span></div>` +
        newest.map((e) =>
          `<div class="res-row"><span class="ts">${new Date(e.ts).toLocaleTimeString()}</span>${escapeHtmlSafe(e.text || '')}</div>`
        ).join('');
      grid.appendChild(card);
    });
    list.innerHTML = '';
    list.appendChild(grid);
  }

  function renderDiagnosticsPage() {
    if (activePage !== 'diagnostics') return;
    renderHealthDiagram();
    renderBootTimeline();
    renderMetrics();
    renderRecentErrors();
    renderNetworkPanel();
  }

  // ===== Network / bandwidth panel =====
  const fmtBytesNet = (b) => {
    if (b == null || !Number.isFinite(b)) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  function renderNetworkPanel() {
    if (activePage !== 'diagnostics') return;
    // Active downloads + estimated combined rate.
    const running = [...(dlState?.jobs || new Map()).values()].filter((j) => j.status === 'running');
    const activeEl = $('net-active-dl');
    const activeRateEl = $('net-active-rate');
    if (activeEl) activeEl.textContent = String(running.length);
    if (activeRateEl) {
      if (!running.length) {
        activeRateEl.textContent = 'idle';
      } else {
        // Crude throughput estimate: sum of installed sizes / elapsed time per job.
        // The actual rate is whatever yt-dlp + the network achieves; this is just a
        // post-hoc view of bytes/sec since the job started.
        const songs = uploadsState?.songs || [];
        const now = Date.now();
        let totalBytes = 0, totalSec = 0;
        for (const job of running) {
          const sinceStart = Math.max(1, (now - job.startedAt) / 1000);
          totalSec = Math.max(totalSec, sinceStart);
          const jobSongs = songs.filter((s) => s.playlistId && s.playlistId === (job.playlistId || '___'));
          totalBytes += jobSongs.reduce((sum, s) => sum + (s.size || 0), 0);
        }
        const rate = totalSec > 0 ? totalBytes / totalSec : 0;
        activeRateEl.textContent = rate > 0 ? `≈ ${fmtBytesNet(rate)}/s observed` : 'starting…';
      }
    }

    // Downloaded in last hour + total (from manifest addedAt + size).
    const songs = uploadsState?.songs || [];
    const oneHourAgo = Date.now() - 3600 * 1000;
    const recent = songs.filter((s) => (s.addedAt || 0) >= oneHourAgo);
    $('net-bytes-1h') && ($('net-bytes-1h').textContent = fmtBytesNet(recent.reduce((s, x) => s + (x.size || 0), 0)));
    $('net-files-1h') && ($('net-files-1h').textContent = `${recent.length} file${recent.length === 1 ? '' : 's'}`);
    $('net-bytes-total') && ($('net-bytes-total').textContent = fmtBytesNet(songs.reduce((s, x) => s + (x.size || 0), 0)));
    $('net-files-total') && ($('net-files-total').textContent = `${songs.length} file${songs.length === 1 ? '' : 's'}`);

    // Voice bandwidth — Discord voice runs at ~256 kbps per connection (Opus).
    const voiceConns = state?.stats?.voiceConnections || 0;
    const voiceKbps = voiceConns * 256;
    $('net-voice-bw') && ($('net-voice-bw').textContent = voiceConns ? `≈ ${voiceKbps} kbps` : 'idle');
    $('net-voice-conns') && ($('net-voice-conns').textContent = `${voiceConns} connection${voiceConns === 1 ? '' : 's'}`);

    // Rate cap / concurrency — from download config snapshot.
    const cfg = uploadsState?.downloadConfig;
    if (cfg) {
      $('net-rate-cap') && ($('net-rate-cap').textContent = cfg.limitRate || 'unlimited');
      $('net-concurrency') && ($('net-concurrency').textContent = `${cfg.concurrency} concurrent`);
    }
  }

  // ===== Speedtest =====
  function renderSpeedtestResult(result) {
    const wrap = $('speedtest-result');
    if (!wrap || !result) return;
    if (result.error) {
      wrap.classList.remove('hidden');
      $('st-down').textContent = '—';
      $('st-up').textContent = '—';
      $('st-ping').textContent = '—';
      $('st-meta').textContent = `▲ ${result.error}`;
      return;
    }
    wrap.classList.remove('hidden');
    $('st-down').textContent = result.downloadMbps != null ? `${result.downloadMbps.toFixed(1)} Mbps` : '—';
    $('st-up').textContent = result.uploadMbps != null ? `${result.uploadMbps.toFixed(1)} Mbps` : '—';
    $('st-ping').textContent = result.pingMs != null ? `${Math.round(result.pingMs)} ms` : '—';
    const when = new Date(result.ts).toLocaleTimeString();
    const meta = [`Tool: ${result.tool || '?'}`, `Ran at: ${when}`];
    if (result.server) meta.push(`Server: ${result.server}`);
    if (result.isp) meta.push(`ISP: ${result.isp}`);
    $('st-meta').textContent = meta.join(' · ');
  }

  // Fetch cached result on dashboard load. Silently no-op if the route
  // isn't registered (running an older backend) — the user will see the
  // helpful error if they actively click the run button.
  fetchJson('/api/admin/speedtest').then((d) => {
    if (d.result) renderSpeedtestResult(d.result);
  }).catch(() => { /* */ });

  // Browser-side speedtest using Cloudflare's free /__down + /__up endpoints.
  // Works on every host without installing librespeed-cli or speedtest-cli.
  // Measures the *browser's* connection — for dashboards opened on the bot
  // host this is also the bot's connection; for remote dashboards it shows
  // the operator's link instead.
  async function runBrowserSpeedtest({ onProgress } = {}) {
    const noop = onProgress || (() => {});

    // 1. Latency — 6 small fetches, take the min so we discount any one
    //    slow handshake. `/__down?bytes=0` is just headers.
    noop('Measuring latency…');
    const latencies = [];
    for (let i = 0; i < 6; i++) {
      const start = performance.now();
      try {
        await fetch('https://speed.cloudflare.com/__down?bytes=0', { cache: 'no-store' });
        latencies.push(performance.now() - start);
      } catch { /* one bad sample is fine */ }
    }
    if (!latencies.length) throw new Error('Cannot reach speed.cloudflare.com');
    const pingMs = Math.min(...latencies);

    // 2. Download — start with a smaller probe to gauge speed, then scale up
    //    so slow connections don't sit waiting 60s+ for a giant fetch.
    noop('Probing download…');
    let downloadMbps;
    {
      const probeBytes = 5 * 1024 * 1024;  // 5 MB probe
      const probeStart = performance.now();
      let received = 0;
      const probeRes = await fetch(`https://speed.cloudflare.com/__down?bytes=${probeBytes}`, { cache: 'no-store' });
      const reader = probeRes.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
      }
      const probeSec = (performance.now() - probeStart) / 1000;
      const probeMbps = (received * 8) / 1e6 / probeSec;

      // Scale main test target to take ~5–10 seconds based on probe speed.
      // Min 25 MB so fast lines get a reasonable sample, max 200 MB so a
      // 1 Gbps line caps the test at ~1.6s.
      const targetBytes = Math.max(25 * 1024 * 1024, Math.min(200 * 1024 * 1024,
        Math.round((probeMbps / 8) * 1e6 * 8)));

      noop(`Downloading ${(targetBytes / 1024 / 1024).toFixed(0)} MB…`);
      const dlStart = performance.now();
      let dlReceived = 0;
      const dlRes = await fetch(`https://speed.cloudflare.com/__down?bytes=${targetBytes}`, { cache: 'no-store' });
      const dlReader = dlRes.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await dlReader.read();
        if (done) break;
        dlReceived += value.length;
        const elapsed = (performance.now() - dlStart) / 1000;
        if (elapsed > 0.25) {
          noop(`Downloading… ${((dlReceived * 8) / 1e6 / elapsed).toFixed(1)} Mbps`);
        }
      }
      const dlSec = (performance.now() - dlStart) / 1000;
      downloadMbps = (dlReceived * 8) / 1e6 / dlSec;
    }

    // 3. Upload — 10 MB POST. Cloudflare's __up endpoint accepts any body and
    //    discards it; we measure how long the upload takes.
    noop('Uploading 10 MB…');
    const upBytes = 10 * 1024 * 1024;
    const upPayload = new Uint8Array(upBytes);
    const upStart = performance.now();
    await fetch('https://speed.cloudflare.com/__up', {
      method: 'POST',
      body: upPayload,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    const upSec = (performance.now() - upStart) / 1000;
    const uploadMbps = (upBytes * 8) / 1e6 / upSec;

    // 4. ISP + Cloudflare datacenter metadata.
    let isp = null, server = null;
    try {
      const meta = await fetch('https://speed.cloudflare.com/meta').then((r) => r.json());
      isp = meta.asOrganization || meta.asn || null;
      server = meta.colo ? `Cloudflare ${meta.colo}` : null;
    } catch { /* metadata is optional */ }

    return {
      tool: 'browser (Cloudflare)',
      downloadMbps,
      uploadMbps,
      pingMs,
      server,
      isp,
    };
  }

  $('speedtest-run')?.addEventListener('click', async () => {
    const btn = $('speedtest-run');
    btn.disabled = true;
    btn.textContent = '⏱ Probing latency…';
    try {
      const result = await runBrowserSpeedtest({
        onProgress: (msg) => { btn.textContent = `⏱ ${msg}`; },
      });
      // Render locally immediately, then POST to server to cache + broadcast
      // to any other connected dashboards.
      renderSpeedtestResult({ ...result, ts: Date.now() });
      toast('⚡ Speedtest done',
        `↓${result.downloadMbps.toFixed(1)} ↑${result.uploadMbps.toFixed(1)} Mbps · ${Math.round(result.pingMs)}ms`,
        'success', 3500);
      // Fire-and-forget the cache update; don't fail the user-visible result
      // if the server rejects it for some reason.
      fetchJson('/api/admin/speedtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      }).catch(() => { /* cached locally already */ });
    } catch (e) {
      renderSpeedtestResult({ error: e.message, ts: Date.now() });
      toast('▲ Speedtest failed', e.message, 'error', 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Run speedtest';
    }
  });

  // Public IP — gated so it doesn't leak into screenshots.
  $('net-show-ip')?.addEventListener('click', async () => {
    const val = $('net-public-ip');
    const sub = $('net-public-ip-sub');
    if (!val) return;
    val.innerHTML = '<span class="muted small">Fetching…</span>';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      val.innerHTML = `<code>${escapeHtmlSafe(data.ip || '?')}</code>`;
      if (sub) sub.textContent = 'Reload the page to hide again';
    } catch (e) {
      val.innerHTML = '<span class="muted small">Could not fetch</span>';
      if (sub) sub.textContent = e.message;
    }
  });

  // Filter chip wiring
  document.querySelectorAll('#diag-filters .filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (chip.classList.contains('level-only')) {
        // Level chips are toggleable (clicking again clears the level filter).
        const newLevel = chip.dataset.level;
        if (diagState.filterLevel === newLevel) {
          diagState.filterLevel = null;
          chip.classList.remove('active');
        } else {
          diagState.filterLevel = newLevel;
          document.querySelectorAll('#diag-filters .filter-chip.level-only')
            .forEach((c) => c.classList.toggle('active', c === chip));
        }
        localStorage.setItem('maow.diagLevel', diagState.filterLevel || '');
      } else {
        document.querySelectorAll('#diag-filters .filter-chip:not(.level-only)')
          .forEach((c) => c.classList.toggle('active', c === chip));
        diagState.filterCat = chip.dataset.cat;
        localStorage.setItem('maow.diagCat', diagState.filterCat);
      }
      rerenderDiagConsole();
    });
  });

  // Initialize filter chip active state from localStorage.
  (function initDiagFilters() {
    const catChip = document.querySelector(`#diag-filters .filter-chip[data-cat="${diagState.filterCat}"]`);
    if (catChip) {
      document.querySelectorAll('#diag-filters .filter-chip:not(.level-only)').forEach((c) => c.classList.remove('active'));
      catChip.classList.add('active');
    }
    if (diagState.filterLevel) {
      const lvlChip = document.querySelector(`#diag-filters .filter-chip.level-only[data-level="${diagState.filterLevel}"]`);
      if (lvlChip) lvlChip.classList.add('active');
    }
  })();

  $('diag-search')?.addEventListener('input', (e) => {
    clearTimeout(diagSearchTimer);
    diagSearchTimer = setTimeout(() => {
      diagState.search = e.target.value;
      rerenderDiagConsole();
    }, 120);
  });

  $('diag-pause')?.addEventListener('click', () => {
    diagState.paused = !diagState.paused;
    $('diag-pause').classList.toggle('active', diagState.paused);
    $('diag-pause').textContent = diagState.paused ? '▶ Resume' : '⏸ Pause';
    if (!diagState.paused) {
      const cons = $('diag-console');
      if (cons) cons.scrollTop = cons.scrollHeight;
    }
  });

  $('diag-clear')?.addEventListener('click', () => {
    if (!confirm('Clear the diagnostics console? (The server-side log buffer is unaffected.)')) return;
    diagState.logs.length = 0;
    const cons = $('diag-console');
    if (cons) cons.innerHTML = '';
    const body = $('diag-mini-body');
    if (body) body.innerHTML = '';
    updateDiagMeta();
  });

  $('diag-export')?.addEventListener('click', () => {
    const lines = diagState.logs.map((e) => {
      const ts = new Date(e.ts || Date.now()).toISOString();
      const cat = (e.category || 'system').padEnd(8);
      const lvl = (e.level || 'info').toUpperCase().padEnd(7);
      return `${ts}  ${lvl} ${cat}  ${e.text || ''}`;
    });
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maowcore-diag-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ===== Mini-panel =====
  function appendMiniRow(entry) {
    const body = $('diag-mini-body');
    if (!body) return;
    const row = document.createElement('div');
    row.className = `row ${entry.level || 'info'}`;
    const ts = new Date(entry.ts || Date.now()).toLocaleTimeString();
    row.innerHTML = `<span class="ts">${ts}</span><span class="msg">${escapeHtmlSafe(entry.text || '')}</span>`;
    body.appendChild(row);
    while (body.children.length > 100) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
  }

  function updateMiniChip() {
    const health = diagState.snapshot?.health;
    let overall = 'ok';
    if (health) {
      const vals = Object.values(health);
      if (vals.includes('down')) overall = 'down';
      else if (vals.includes('degraded')) overall = 'degraded';
    }
    const c5 = diagState.snapshot?.counters?.m5 || {};
    const errCount = c5.error || 0;
    const w5 = c5.warn || 0;
    const label =
      (overall === 'down' || errCount > 0) ? `${errCount} error${errCount === 1 ? '' : 's'} in 5m`
      : (overall === 'degraded')           ? `${w5} warn${w5 === 1 ? '' : 'ings'} in 5m`
      : 'healthy';
    // Update BOTH the (legacy hidden) mini chip and the (new) topbar chip.
    for (const id of ['diag-mini-chip', 'topbar-diag-chip']) {
      const chip = $(id);
      if (chip) chip.setAttribute('data-health', overall);
    }
    const miniTxt = $('diag-mini-text');
    if (miniTxt) miniTxt.textContent = label;
    const topbarTxt = $('topbar-diag-text');
    if (topbarTxt) topbarTxt.textContent = label;
  }

  function updateNavDiagBadge() {
    const badge = $('nav-diag-badge');
    if (!badge) return;
    if (activePage === 'diagnostics') {
      // Reset count when on the diagnostics page.
      diagState.miniSeenErrorCount = diagState.snapshot?.counters?.m5?.error || 0;
      localStorage.setItem('maow.diagSeenErrors', String(diagState.miniSeenErrorCount));
      badge.hidden = true;
      return;
    }
    const curErrors = diagState.snapshot?.counters?.m5?.error || 0;
    const unseen = Math.max(0, curErrors - diagState.miniSeenErrorCount);
    if (unseen > 0) {
      badge.hidden = false;
      badge.textContent = unseen > 99 ? '99+' : String(unseen);
    } else {
      badge.hidden = true;
    }
  }

  // Helper: toggle the diagnostics tail panel and reposition it under whichever
  // chip was clicked (topbar chip lives top-right, hidden mini chip is at
  // bottom-right; we want the panel to anchor near the visible trigger).
  function toggleDiagPanel(anchor) {
    diagState.miniOpen = !diagState.miniOpen;
    const panel = $('diag-mini-panel');
    if (!panel) return;
    panel.hidden = !diagState.miniOpen;
    if (!diagState.miniOpen) return;
    // Position the panel under the anchor element (topbar chip, usually).
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.top = `${rect.bottom + 8}px`;
      panel.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
      panel.style.bottom = 'auto';
      panel.style.left = 'auto';
    }
  }

  $('diag-mini-chip')?.addEventListener('click', () => toggleDiagPanel($('diag-mini-chip')));
  $('topbar-diag-chip')?.addEventListener('click', () => toggleDiagPanel($('topbar-diag-chip')));
  $('diag-mini-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    diagState.miniOpen = false;
    $('diag-mini-panel').hidden = true;
  });
  $('diag-mini-open')?.addEventListener('click', (e) => {
    e.preventDefault();
    diagState.miniOpen = false;
    $('diag-mini-panel').hidden = true;
    switchPage('diagnostics');
  });

  // Hook the existing log handler to also receive entries (already happens via
  // appendLog wrap above). But also handle `diagnostics` snapshot messages.
  const origHandle = handle;
  handle = (msg) => {
    origHandle(msg);
    if (msg.type === 'diagnostics') {
      diagState.snapshot = msg.payload;
      renderDiagnosticsPage();
      updateMiniChip();
      updateNavDiagBadge();
    } else if (msg.type === 'state' && msg.diagnostics) {
      diagState.snapshot = msg.diagnostics;
      renderDiagnosticsPage();
      updateMiniChip();
      updateNavDiagBadge();
    } else if (msg.type === 'log_history') {
      // Replay history into the diag buffer so the page has context on connect.
      msg.entries.forEach((e) => {
        diagState.logs.push(e);
      });
      while (diagState.logs.length > diagState.maxLogs) diagState.logs.shift();
      if (activePage === 'diagnostics') rerenderDiagConsole();
      // Refresh mini tail with the latest 30 entries.
      const body = $('diag-mini-body');
      if (body) {
        body.innerHTML = '';
        msg.entries.slice(-30).forEach((e) => appendMiniRow(e));
      }
    } else if (msg.type === 'log_clear') {
      diagState.logs.length = 0;
      const cons = $('diag-console'); if (cons) cons.innerHTML = '';
      const body = $('diag-mini-body'); if (body) body.innerHTML = '';
    }
  };

  // Render the diagnostics page whenever the user navigates to it.
  const origSwitchPage = switchPage;
  switchPage = (name) => {
    origSwitchPage(name);
    if (name === 'diagnostics') {
      rerenderDiagConsole();
      renderDiagnosticsPage();
      updateNavDiagBadge();
    }
    if (name === 'moderation') {
      renderModerationPage();
    }
  };

  // ===== Moderation page =====
  const modState = {
    activeTab: 'bans',
    bans: [],
    bansSearch: '',
    warns: [],
    automod: null,
    audit: [],
    modlogStream: [],   // live mod-action events parsed from log entries
    modlogFilter: 'all',
  };

  function activeGuildId() {
    return currentServer()?.id || null;
  }

  function renderModerationPage() {
    // Tab activation
    document.querySelectorAll('#mod-tabs .tab').forEach((btn) => {
      const isActive = btn.dataset.tab === modState.activeTab;
      btn.classList.toggle('active', isActive);
    });
    document.querySelectorAll('#page-moderation .tab-panel').forEach((p) => {
      p.classList.toggle('hidden', p.id !== `mod-tab-${modState.activeTab}`);
    });
    // Render the active tab.
    switch (modState.activeTab) {
      case 'bans':    return renderBansTab();
      case 'kicks':   return renderKicksTab();
      case 'warns':   return renderWarnsTab();
      case 'automod': return renderAutomodTab();
      case 'modlog':  return renderModlogTab();
      case 'audit':   return renderAuditTab();
    }
  }

  document.querySelectorAll('#mod-tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      modState.activeTab = btn.dataset.tab;
      renderModerationPage();
    });
  });

  // -------- BANS --------
  async function renderBansTab() {
    const list = $('bans-list');
    const summary = $('bans-summary');
    const gId = activeGuildId();
    if (!gId) { if (list) list.innerHTML = '<div class="muted">Select a server first.</div>'; return; }
    if (!modState.bans?.length || modState._bansGuildId !== gId) {
      list.innerHTML = '<div class="muted">Loading…</div>';
      try {
        const res = await fetch(`/api/mod/bans?guildId=${encodeURIComponent(gId)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        modState.bans = data.bans || [];
        modState._bansGuildId = gId;
      } catch (e) {
        list.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
        return;
      }
    }
    const q = (modState.bansSearch || '').toLowerCase();
    const filtered = q
      ? modState.bans.filter((b) =>
          (b.tag || '').toLowerCase().includes(q) ||
          (b.userId || '').includes(q) ||
          (b.reason || '').toLowerCase().includes(q))
      : modState.bans;
    if (summary) summary.textContent = `${filtered.length} of ${modState.bans.length} bans`;
    if (!filtered.length) {
      list.innerHTML = '<div class="muted">No bans matched.</div>';
      return;
    }
    list.innerHTML = '';
    filtered.forEach((ban) => {
      const row = document.createElement('div');
      row.className = 'ban-row';
      row.innerHTML = `
        <div>
          <div class="ban-name">${escapeHtmlSafe(ban.tag || ban.username || 'unknown user')}</div>
          <div class="ban-meta">${escapeHtmlSafe(ban.userId)}</div>
          ${ban.reason ? `<div class="ban-reason">"${escapeHtmlSafe(ban.reason)}"</div>` : ''}
        </div>
        <div class="ban-actions">
          <button class="unban-btn" data-uid="${escapeHtmlSafe(ban.userId)}">↺ Unban</button>
        </div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('.unban-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.uid;
        const ban = modState.bans.find((b) => b.userId === userId);
        if (!confirm(`Unban ${ban?.tag || userId}?`)) return;
        try {
          const res = await fetch('/api/mod/unban', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: gId, userId }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          toast('↺ Unbanned', ban?.tag || userId, 'success', 2500);
          modState.bans = modState.bans.filter((b) => b.userId !== userId);
          renderBansTab();
        } catch (e) { toast('▲ Unban failed', e.message, 'error', 3500); }
      });
    });
  }

  $('bans-refresh')?.addEventListener('click', () => {
    modState._bansGuildId = null;
    renderBansTab();
  });
  $('bans-search')?.addEventListener('input', (e) => {
    modState.bansSearch = e.target.value;
    renderBansTab();
  });
  $('bans-new')?.addEventListener('click', async () => {
    const gId = activeGuildId();
    if (!gId) return toast('▲ No server', 'Select a server first.', 'error', 2000);
    const userId = prompt('User ID to ban:');
    if (!userId || !/^\d{15,25}$/.test(userId)) return toast('▲ Bad ID', 'Need a 15–25 digit Discord user ID.', 'error', 2500);
    const reason = prompt('Reason:') || 'No reason provided';
    const deleteDays = prompt('Delete recent messages (days, 0–7):', '0');
    const deleteMessageSeconds = (Math.max(0, Math.min(7, Number(deleteDays) || 0))) * 86400;
    if (!confirm(`Ban user ${userId}?\nReason: ${reason}\nDelete ${deleteDays} day(s) of messages.\n\nThis is permanent until you unban.`)) return;
    try {
      const res = await fetch('/api/mod/ban', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: gId, userId, reason, deleteMessageSeconds }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast('⊘ Banned', userId, 'success', 2500);
      modState._bansGuildId = null;
      renderBansTab();
    } catch (e) { toast('▲ Ban failed', e.message, 'error', 4000); }
  });

  // -------- KICKS / TIMEOUTS --------
  function renderKicksTab() {
    const actionEl = $('kick-action');
    const durWrap = $('kick-duration-wrap');
    if (actionEl && durWrap) {
      const updateDurVisibility = () => { durWrap.style.display = actionEl.value === 'timeout' ? '' : 'none'; };
      actionEl.removeEventListener('change', actionEl._maowHandler || (() => {}));
      actionEl._maowHandler = updateDurVisibility;
      actionEl.addEventListener('change', updateDurVisibility);
      updateDurVisibility();
    }
  }
  $('kick-go')?.addEventListener('click', async () => {
    const gId = activeGuildId();
    if (!gId) return toast('▲ No server', 'Select a server first.', 'error', 2000);
    const userId = $('kick-user')?.value.trim();
    if (!/^\d{15,25}$/.test(userId)) return toast('▲ Bad ID', 'Need a Discord user ID.', 'error', 2500);
    const action = $('kick-action')?.value;
    const reason = $('kick-reason')?.value.trim() || 'No reason provided';
    if (action === 'timeout') {
      const ms = Number($('kick-duration')?.value);
      if (!confirm(`Timeout ${userId} for ${Math.round(ms / 60000)} minutes?\nReason: ${reason}`)) return;
      try {
        const res = await fetch('/api/mod/timeout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId: gId, userId, durationMs: ms, reason }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        toast('⏱ Timed out', `${Math.round(ms / 60000)} min`, 'success', 2500);
      } catch (e) { toast('▲ Timeout failed', e.message, 'error', 4000); }
    } else {
      if (!confirm(`Kick ${userId}?\nReason: ${reason}`)) return;
      try {
        const res = await fetch('/api/mod/kick', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId: gId, userId, reason }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        toast('👢 Kicked', userId, 'success', 2500);
      } catch (e) { toast('▲ Kick failed', e.message, 'error', 4000); }
    }
  });

  // -------- WARNS --------
  async function renderWarnsTab() {
    const list = $('warns-list');
    const summary = $('warns-summary');
    const gId = activeGuildId();
    if (!gId) { list.innerHTML = '<div class="muted">Select a server first.</div>'; return; }
    list.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const res = await fetch(`/api/mod/warns?guildId=${encodeURIComponent(gId)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      modState.warns = data.users || [];
    } catch (e) {
      list.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
      return;
    }
    if (summary) summary.textContent = `${modState.warns.length} member${modState.warns.length === 1 ? '' : 's'} with warnings`;
    if (!modState.warns.length) {
      list.innerHTML = '<div class="muted">No warnings recorded.</div>';
      return;
    }
    list.innerHTML = '';
    modState.warns.forEach((u) => {
      const row = document.createElement('div');
      row.className = 'warn-row';
      const entries = u.entries.map((w) => {
        const when = new Date(w.ts).toLocaleString();
        return `<div class="warn-entry">${escapeHtmlSafe(when)} · ${escapeHtmlSafe(w.reason || '(no reason)')}</div>`;
      }).join('');
      row.innerHTML = `
        <div class="warn-head">
          <span class="warn-user">${escapeHtmlSafe(u.tag || u.userId)}</span>
          <div>
            <span class="warn-count">⚠ ${u.count} warning${u.count === 1 ? '' : 's'}</span>
            <button class="clear-btn" data-uid="${escapeHtmlSafe(u.userId)}">Clear</button>
          </div>
        </div>
        <div class="warn-entries">${entries}</div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('.clear-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.uid;
        if (!confirm(`Clear all warnings for ${userId}?`)) return;
        try {
          const res = await fetch('/api/mod/warn-clear', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: gId, userId }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          toast('✕ Cleared', userId, 'info', 2000);
          renderWarnsTab();
        } catch (e) { toast('▲ Clear failed', e.message, 'error', 3000); }
      });
    });
  }
  $('warns-refresh')?.addEventListener('click', renderWarnsTab);

  // -------- AUTOMOD --------
  async function renderAutomodTab() {
    const grid = $('automod-grid');
    const gId = activeGuildId();
    if (!gId) { grid.innerHTML = '<div class="muted">Select a server first.</div>'; return; }
    grid.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const res = await fetch(`/api/mod/automod?guildId=${encodeURIComponent(gId)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      modState.automod = data.automod;
    } catch (e) {
      grid.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
      return;
    }
    const a = modState.automod;
    const rules = [
      { key: 'enabled',      label: 'Automod enabled',  desc: 'Master switch. When off, no rules below apply.' },
      { key: 'antiSpam',     label: 'Anti-spam',        desc: 'Throttle members posting messages too quickly.' },
      { key: 'antiLinks',    label: 'Anti-links',       desc: 'Delete messages containing arbitrary URLs.' },
      { key: 'antiInvites',  label: 'Anti-invites',     desc: 'Delete Discord invite links from other servers.' },
      { key: 'antiCaps',     label: 'Anti-caps',        desc: 'Flag messages with excessive ALL-CAPS shouting.' },
      { key: 'antiMentions', label: 'Anti-mass-mention', desc: 'Block messages mentioning many users at once.' },
    ];
    grid.innerHTML = '';
    rules.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'automod-rule';
      card.innerHTML = `
        <label>
          <span>${escapeHtmlSafe(r.label)}</span>
          <input type="checkbox" data-key="${r.key}" ${a[r.key] ? 'checked' : ''} />
        </label>
        <div class="desc">${escapeHtmlSafe(r.desc)}</div>`;
      grid.appendChild(card);
    });
  }
  $('automod-save')?.addEventListener('click', async () => {
    const gId = activeGuildId();
    if (!gId) return toast('▲ No server', 'Select a server.', 'error', 2000);
    const checks = document.querySelectorAll('#automod-grid input[type="checkbox"]');
    const body = { guildId: gId, wordBlocklist: modState.automod?.wordBlocklist || [] };
    checks.forEach((c) => { body[c.dataset.key] = c.checked; });
    try {
      const res = await fetch('/api/mod/automod', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      modState.automod = data.automod;
      toast('✓ Saved', 'Automod rules updated.', 'success', 2000);
    } catch (e) { toast('▲ Save failed', e.message, 'error', 3500); }
  });

  // -------- MODLOG STREAM --------
  // We tap into the live log buffer and surface entries that look like mod
  // actions (ban / kick / timeout / warn / unban / purge) from the diagnostics
  // feed, since they already pass through control.log() with structured meta.
  async function renderModlogTab() {
    const list = $('modlog-list');
    const cfg = $('modlog-config');
    const gId = activeGuildId();
    if (!gId) { list.innerHTML = '<div class="muted">Select a server first.</div>'; return; }
    // Fetch modlog channel config so the operator can see where actions are
    // mirrored to.
    try {
      const res = await fetch(`/api/mod/modlog-config?guildId=${encodeURIComponent(gId)}`);
      const data = await res.json();
      if (cfg) cfg.textContent = data.channelId
        ? `Mirroring to #${data.channelName || data.channelId}`
        : 'No modlog channel configured (use /setup modlog).';
    } catch { /* */ }
    const filter = modState.modlogFilter;
    const entries = (diagState?.logs || []).filter((e) => {
      if (e.category !== 'command') return false;
      const action = e.meta?.action;
      if (!action) return false;
      if (filter !== 'all' && action !== filter) return false;
      // Only show entries for the active guild (or no-guild entries).
      if (e.meta?.guildId && e.meta.guildId !== gId) return false;
      return ['ban', 'unban', 'kick', 'timeout', 'warn', 'warn-clear', 'purge'].includes(action);
    });
    if (!entries.length) {
      list.innerHTML = '<div class="muted">No mod actions yet for this server.</div>';
      return;
    }
    list.innerHTML = '';
    entries.slice(-100).reverse().forEach((e) => {
      const row = document.createElement('div');
      row.className = 'modlog-row';
      row.setAttribute('data-action', e.meta.action);
      const ts = new Date(e.ts).toLocaleString();
      row.innerHTML = `
        <span class="ts">${escapeHtmlSafe(ts)}</span>
        <span class="act">${escapeHtmlSafe(e.meta.action)}</span>
        <span class="msg">${escapeHtmlSafe(e.text)}</span>`;
      list.appendChild(row);
    });
  }
  $('modlog-filter')?.addEventListener('change', (e) => {
    modState.modlogFilter = e.target.value;
    renderModlogTab();
  });
  $('modlog-export')?.addEventListener('click', () => {
    const gId = activeGuildId();
    const entries = (diagState?.logs || []).filter((e) =>
      e.category === 'command' && e.meta?.action && (!e.meta?.guildId || e.meta.guildId === gId));
    if (!entries.length) return toast('▲ Nothing to export', '', 'info', 1500);
    const lines = entries.map((e) =>
      `${new Date(e.ts).toISOString()}\t${e.meta.action}\t${e.text}\t${JSON.stringify(e.meta)}`);
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/tab-separated-values' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `maowcore-modlog-${gId || 'all'}-${new Date().toISOString().replace(/[:.]/g, '-')}.tsv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // -------- AUDIT LOG --------
  async function renderAuditTab(force) {
    const list = $('audit-list');
    const summary = $('audit-summary');
    const gId = activeGuildId();
    if (!gId) { list.innerHTML = '<div class="muted">Select a server first.</div>'; return; }
    if (!force && modState._auditGuildId === gId && modState.audit?.length) {
      return drawAudit();
    }
    list.innerHTML = '<div class="muted">Loading audit log…</div>';
    const type = $('audit-type')?.value || '';
    const qs = new URLSearchParams({ guildId: gId, limit: '50' });
    if (type) qs.set('type', type);
    try {
      const res = await fetch(`/api/mod/audit?${qs}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      modState.audit = data.entries || [];
      modState._auditGuildId = gId;
      drawAudit();
    } catch (e) {
      list.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
    }
    function drawAudit() {
      if (summary) summary.textContent = `${modState.audit.length} entries`;
      if (!modState.audit.length) {
        list.innerHTML = '<div class="muted">No entries match the current filter.</div>';
        return;
      }
      list.innerHTML = '';
      modState.audit.forEach((e) => {
        const row = document.createElement('div');
        row.className = 'audit-row';
        const ts = new Date(e.createdAt).toLocaleString();
        const who = e.executor ? `${e.executor.tag}` : '(unknown)';
        const target = e.target ? ` → ${e.target.tag || e.target.id}` : '';
        const reason = e.reason ? ` · "${e.reason}"` : '';
        row.innerHTML = `
          <span class="ts">${escapeHtmlSafe(ts)}</span>
          <span class="act">${escapeHtmlSafe(String(e.action || e.actionType))}</span>
          <span class="msg">${escapeHtmlSafe(who + target + reason)}</span>`;
        list.appendChild(row);
      });
    }
  }
  $('audit-refresh')?.addEventListener('click', () => renderAuditTab(true));
  $('audit-type')?.addEventListener('change', () => renderAuditTab(true));

  // ===== Members page =====
  const membersState = {
    members: [],
    total: 0,
    page: 1,
    perPage: 50,
    search: '',
    cacheNotice: null,
  };

  async function renderMembersPage() {
    const list = $('members-list');
    const summary = $('members-summary');
    const notice = $('members-cache-notice');
    const gId = activeGuildId();
    if (!gId) { if (list) list.innerHTML = '<div class="muted">Select a server first.</div>'; return; }
    list.innerHTML = '<div class="muted">Loading…</div>';
    const qs = new URLSearchParams({
      guildId: gId,
      page: String(membersState.page),
      perPage: String(membersState.perPage),
    });
    if (membersState.search) qs.set('search', membersState.search);
    try {
      const data = await fetchJson(`/api/admin/members?${qs}`);
      if (data.error) throw new Error(data.error);
      membersState.members = data.members || [];
      membersState.total = data.total || 0;
      membersState.cacheNotice = data.cacheNotice || null;
    } catch (e) {
      list.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
      return;
    }
    if (summary) {
      const start = (membersState.page - 1) * membersState.perPage + 1;
      const end = Math.min(start + membersState.perPage - 1, membersState.total);
      summary.textContent = membersState.total
        ? `Showing ${start}–${end} of ${membersState.total} members`
        : 'No members.';
    }
    if (notice) {
      if (membersState.cacheNotice) {
        notice.hidden = false;
        notice.textContent = membersState.cacheNotice;
      } else {
        notice.hidden = true;
      }
    }
    if (!membersState.members.length) {
      list.innerHTML = '<div class="muted">No members match.</div>';
      return;
    }
    list.innerHTML = '';
    membersState.members.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'member-row' + (m.bot ? ' bot' : '');
      const rolesHtml = (m.roles || []).map((r) => {
        const color = r.color ? `style="color:#${r.color.toString(16).padStart(6, '0')}"` : '';
        return `<span class="m-role" ${color}>${escapeHtmlSafe(r.name)}</span>`;
      }).join('');
      const voiceTag = m.voiceChannel ? ` · 🔊 ${escapeHtmlSafe(m.voiceChannel.name)}` : '';
      row.innerHTML = `
        <img src="${escapeHtmlSafe(m.avatar)}" alt="" />
        <div>
          <div class="m-name">${escapeHtmlSafe(m.displayName || m.tag)}</div>
          <div class="m-meta">${escapeHtmlSafe(m.tag)} · ${escapeHtmlSafe(m.id)}${voiceTag}</div>
          <div class="m-roles">${rolesHtml}</div>
        </div>
        <div class="m-actions">
          <button data-act="timeout" data-uid="${escapeHtmlSafe(m.id)}">⏱ Timeout</button>
          <button data-act="kick" class="m-danger" data-uid="${escapeHtmlSafe(m.id)}">👢 Kick</button>
          <button data-act="ban" class="m-danger" data-uid="${escapeHtmlSafe(m.id)}">⊘ Ban</button>
        </div>`;
      list.appendChild(row);
    });
    // Quick action handlers — defer to the Moderation page workflows by
    // prefilling and hopping over.
    list.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.uid;
        const act = btn.dataset.act;
        const member = membersState.members.find((m) => m.id === userId);
        const reason = prompt(`Reason for ${act} of ${member?.tag || userId}?`, 'No reason provided');
        if (reason == null) return;
        if (act === 'kick') {
          if (!confirm(`Kick ${member?.tag || userId}?\nReason: ${reason}`)) return;
          await fetch('/api/mod/kick', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: gId, userId, reason }) })
            .then((r) => r.json()).then((d) => {
              if (d.error) toast('▲ Kick failed', d.error, 'error', 3500);
              else toast('👢 Kicked', userId, 'success', 2500);
            });
        } else if (act === 'ban') {
          if (!confirm(`Ban ${member?.tag || userId}?\nReason: ${reason}`)) return;
          await fetch('/api/mod/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: gId, userId, reason }) })
            .then((r) => r.json()).then((d) => {
              if (d.error) toast('▲ Ban failed', d.error, 'error', 3500);
              else toast('⊘ Banned', userId, 'success', 2500);
            });
        } else if (act === 'timeout') {
          const minutes = Number(prompt('Timeout duration (minutes)?', '60'));
          if (!minutes || minutes < 1) return;
          await fetch('/api/mod/timeout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: gId, userId, durationMs: minutes * 60000, reason }) })
            .then((r) => r.json()).then((d) => {
              if (d.error) toast('▲ Timeout failed', d.error, 'error', 3500);
              else toast('⏱ Timed out', `${minutes} min`, 'success', 2500);
            });
        }
      });
    });
    // Pagination
    renderMembersPagination();
  }

  function renderMembersPagination() {
    const pag = $('members-pagination');
    if (!pag) return;
    const totalPages = Math.max(1, Math.ceil(membersState.total / membersState.perPage));
    if (totalPages <= 1) { pag.hidden = true; pag.innerHTML = ''; return; }
    pag.hidden = false;
    pag.innerHTML = '';
    const items = paginationItems(membersState.page, totalPages);
    const mk = (label, page, opts = {}) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (opts.active) b.classList.add('active');
      if (opts.disabled) b.disabled = true;
      if (!opts.disabled && page != null) {
        b.addEventListener('click', () => {
          membersState.page = page;
          renderMembersPage();
        });
      }
      return b;
    };
    pag.appendChild(mk('‹', membersState.page - 1, { disabled: membersState.page === 1 }));
    items.forEach((it) => {
      if (it === '…') {
        const s = document.createElement('span');
        s.className = 'ellipsis';
        s.textContent = '…';
        pag.appendChild(s);
      } else {
        pag.appendChild(mk(String(it), it, { active: it === membersState.page }));
      }
    });
    pag.appendChild(mk('›', membersState.page + 1, { disabled: membersState.page === totalPages }));
  }

  let membersSearchTimer = null;
  $('members-search')?.addEventListener('input', (e) => {
    clearTimeout(membersSearchTimer);
    membersSearchTimer = setTimeout(() => {
      membersState.search = e.target.value;
      membersState.page = 1;
      renderMembersPage();
    }, 200);
  });
  $('members-perpage')?.addEventListener('change', (e) => {
    membersState.perPage = Number(e.target.value);
    membersState.page = 1;
    renderMembersPage();
  });
  $('members-refresh')?.addEventListener('click', renderMembersPage);

  // ===== Channels page =====
  const channelsState = { groups: [], search: '' };

  async function renderChannelsPage() {
    const list = $('channels-list');
    const gId = activeGuildId();
    if (!gId) { if (list) list.innerHTML = '<div class="muted">Select a server first.</div>'; return; }
    list.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const data = await fetchJson(`/api/admin/channels?guildId=${encodeURIComponent(gId)}`);
      if (data.error) throw new Error(data.error);
      channelsState.groups = data.groups || [];
    } catch (e) {
      list.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
      return;
    }
    drawChannels();
  }

  function drawChannels() {
    const list = $('channels-list');
    if (!list) return;
    const q = (channelsState.search || '').toLowerCase();
    list.innerHTML = '';
    const channelSym = (type) => {
      // 0=text, 2=voice, 5=announcement, 13=stage, 15=forum
      if (type === 2 || type === 13) return '🔊';
      if (type === 15) return '🗂';
      if (type === 5) return '📢';
      return '#';
    };
    channelsState.groups.forEach((group) => {
      const filteredCh = q
        ? group.channels.filter((c) => c.name.toLowerCase().includes(q) || (c.topic || '').toLowerCase().includes(q))
        : group.channels;
      if (!filteredCh.length) return;
      const cat = document.createElement('div');
      cat.className = 'channel-cat';
      cat.innerHTML = `<div class="channel-cat-head">${escapeHtmlSafe(group.name)}</div>`;
      filteredCh.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'channel-row';
        const nsfwBadge = c.nsfw ? '<span class="ch-flag">NSFW</span>' : '';
        const slowBadge = c.slowmode > 0 ? `<span class="ch-slow">${c.slowmode}s</span>` : '';
        const topic = c.topic ? `<div class="ch-topic">${escapeHtmlSafe(c.topic)}</div>` : '';
        row.innerHTML = `
          <span class="ch-sym">${channelSym(c.type)}</span>
          <div>
            <div class="ch-name">${escapeHtmlSafe(c.name)}</div>
            ${topic}
          </div>
          ${slowBadge}
          ${nsfwBadge}
          <button class="ch-edit" data-cid="${escapeHtmlSafe(c.id)}">✎ Edit</button>`;
        cat.appendChild(row);
      });
      list.appendChild(cat);
    });
    if (!list.children.length) {
      list.innerHTML = '<div class="muted">No channels match.</div>';
    }
    list.querySelectorAll('button[data-cid]').forEach((btn) => {
      btn.addEventListener('click', () => openChannelEdit(btn.dataset.cid));
    });
  }

  async function openChannelEdit(channelId) {
    const gId = activeGuildId();
    let ch = null;
    for (const g of channelsState.groups) {
      const found = g.channels.find((c) => c.id === channelId);
      if (found) { ch = found; break; }
    }
    if (!ch) return;
    const name = prompt('Channel name:', ch.name);
    if (name == null) return;
    const topic = prompt('Channel topic (empty to clear):', ch.topic || '');
    if (topic == null) return;
    const slowStr = prompt('Slowmode (seconds, 0 = off, max 21600):', String(ch.slowmode || 0));
    if (slowStr == null) return;
    const nsfw = confirm('NSFW? OK = yes, Cancel = no.\n\n(Current: ' + (ch.nsfw ? 'YES' : 'NO') + ')');
    try {
      const res = await fetch('/api/admin/channel-edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: gId, channelId, name, topic, slowmode: Number(slowStr), nsfw }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast('✎ Channel edited', name, 'success', 2500);
      renderChannelsPage();
    } catch (e) { toast('▲ Edit failed', e.message, 'error', 3500); }
  }

  let channelsSearchTimer = null;
  $('channels-search')?.addEventListener('input', (e) => {
    clearTimeout(channelsSearchTimer);
    channelsSearchTimer = setTimeout(() => { channelsState.search = e.target.value; drawChannels(); }, 150);
  });
  $('channels-refresh')?.addEventListener('click', renderChannelsPage);

  // ===== Roles page =====
  const rolesState = { roles: [], search: '', editing: null };

  // Common Discord permissions (bitfield position → human label). Bit values
  // are stable in the API.
  const PERM_BITS = [
    { bit: 1n << 0n,  label: 'Create invite' },
    { bit: 1n << 1n,  label: 'Kick members' },
    { bit: 1n << 2n,  label: 'Ban members' },
    { bit: 1n << 3n,  label: 'Administrator' },
    { bit: 1n << 4n,  label: 'Manage channels' },
    { bit: 1n << 5n,  label: 'Manage server' },
    { bit: 1n << 6n,  label: 'Add reactions' },
    { bit: 1n << 7n,  label: 'View audit log' },
    { bit: 1n << 10n, label: 'View channel' },
    { bit: 1n << 11n, label: 'Send messages' },
    { bit: 1n << 13n, label: 'Manage messages' },
    { bit: 1n << 14n, label: 'Embed links' },
    { bit: 1n << 15n, label: 'Attach files' },
    { bit: 1n << 17n, label: 'Mention @everyone' },
    { bit: 1n << 20n, label: 'Connect (voice)' },
    { bit: 1n << 21n, label: 'Speak' },
    { bit: 1n << 22n, label: 'Mute members' },
    { bit: 1n << 23n, label: 'Deafen members' },
    { bit: 1n << 24n, label: 'Move members' },
    { bit: 1n << 28n, label: 'Manage roles' },
    { bit: 1n << 36n, label: 'Moderate members' },
  ];

  async function renderRolesPage() {
    const list = $('roles-list');
    const gId = activeGuildId();
    if (!gId) { if (list) list.innerHTML = '<div class="muted">Select a server first.</div>'; return; }
    list.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const data = await fetchJson(`/api/admin/roles?guildId=${encodeURIComponent(gId)}`);
      if (data.error) throw new Error(data.error);
      rolesState.roles = data.roles || [];
    } catch (e) {
      list.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
      return;
    }
    drawRoles();
  }

  function drawRoles() {
    const list = $('roles-list');
    if (!list) return;
    const q = (rolesState.search || '').toLowerCase();
    const roles = q ? rolesState.roles.filter((r) => r.name.toLowerCase().includes(q)) : rolesState.roles;
    if (!roles.length) {
      list.innerHTML = '<div class="muted">No roles match.</div>';
      return;
    }
    list.innerHTML = '';
    roles.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'role-row';
      const swatch = `<div class="role-swatch" style="background:${r.color ? r.hexColor : 'var(--fg-dim)'}"></div>`;
      const managed = r.managed ? '<span class="r-managed">managed</span>' : '<span></span>';
      row.innerHTML = `
        ${swatch}
        <div>
          <div class="r-name">${escapeHtmlSafe(r.name)}</div>
          <div class="r-meta">${r.memberCount} member${r.memberCount === 1 ? '' : 's'} · pos ${r.position}</div>
        </div>
        ${managed}
        <button class="r-edit" data-rid="${escapeHtmlSafe(r.id)}">✎ Edit</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll('button[data-rid]').forEach((btn) => {
      btn.addEventListener('click', () => openRoleModal(btn.dataset.rid));
    });
  }

  function openRoleModal(roleId) {
    const role = rolesState.roles.find((r) => r.id === roleId);
    if (!role) return;
    rolesState.editing = role;
    $('role-modal-title').textContent = `Edit role: ${role.name}`;
    $('role-edit-name').value = role.name;
    $('role-edit-color').value = role.hexColor !== '#000000' ? role.hexColor : '#99aab5';
    $('role-edit-hoist').checked = !!role.hoist;
    $('role-edit-mentionable').checked = !!role.mentionable;
    const permsEl = $('role-perms');
    permsEl.innerHTML = '';
    const current = BigInt(role.permissions || '0');
    PERM_BITS.forEach((p) => {
      const label = document.createElement('label');
      label.className = 'role-perm';
      const has = (current & p.bit) !== 0n;
      label.innerHTML = `<input type="checkbox" data-bit="${p.bit.toString()}" ${has ? 'checked' : ''} /> ${escapeHtmlSafe(p.label)}`;
      permsEl.appendChild(label);
    });
    $('role-modal-delete').style.display = role.managed ? 'none' : '';
    $('role-modal').classList.remove('hidden');
  }

  function closeRoleModal() {
    $('role-modal').classList.add('hidden');
    rolesState.editing = null;
  }

  $('role-modal-close')?.addEventListener('click', closeRoleModal);
  $('role-modal-cancel')?.addEventListener('click', closeRoleModal);

  $('role-modal-save')?.addEventListener('click', async () => {
    const role = rolesState.editing;
    if (!role) return;
    const gId = activeGuildId();
    let bitfield = 0n;
    document.querySelectorAll('#role-perms input[type="checkbox"]').forEach((c) => {
      if (c.checked) bitfield |= BigInt(c.dataset.bit);
    });
    const body = {
      guildId: gId,
      roleId: role.id,
      name: $('role-edit-name').value,
      color: parseInt($('role-edit-color').value.replace('#', ''), 16),
      hoist: $('role-edit-hoist').checked,
      mentionable: $('role-edit-mentionable').checked,
      permissions: bitfield.toString(),
    };
    try {
      const res = await fetch('/api/admin/role-edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast('✓ Role saved', body.name, 'success', 2500);
      closeRoleModal();
      renderRolesPage();
    } catch (e) { toast('▲ Save failed', e.message, 'error', 4000); }
  });

  $('role-modal-delete')?.addEventListener('click', async () => {
    const role = rolesState.editing;
    if (!role) return;
    if (!confirm(`Delete role "${role.name}"? This removes it from every member.`)) return;
    try {
      const res = await fetch('/api/admin/role-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: activeGuildId(), roleId: role.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast('✕ Role deleted', role.name, 'info', 2500);
      closeRoleModal();
      renderRolesPage();
    } catch (e) { toast('▲ Delete failed', e.message, 'error', 4000); }
  });

  $('roles-new')?.addEventListener('click', async () => {
    const gId = activeGuildId();
    if (!gId) return toast('▲ No server', 'Select a server.', 'error', 2000);
    const name = prompt('New role name:');
    if (!name) return;
    try {
      const res = await fetch('/api/admin/role-create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: gId, name }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast('+ Role created', name, 'success', 2500);
      renderRolesPage();
    } catch (e) { toast('▲ Create failed', e.message, 'error', 3500); }
  });

  let rolesSearchTimer = null;
  $('roles-search')?.addEventListener('input', (e) => {
    clearTimeout(rolesSearchTimer);
    rolesSearchTimer = setTimeout(() => { rolesState.search = e.target.value; drawRoles(); }, 150);
  });
  $('roles-refresh')?.addEventListener('click', renderRolesPage);

  // Hook the page switcher so new pages render on navigation.
  const origSwitchPage2 = switchPage;
  switchPage = (name) => {
    origSwitchPage2(name);
    if (name === 'members') renderMembersPage();
    else if (name === 'channels') renderChannelsPage();
    else if (name === 'roles') renderRolesPage();
    else if (name === 'welcome') renderWelcomePage();
    else if (name === 'reactions') renderReactionsPage();
    else if (name === 'insights') { try { renderHeatmap(); } catch { /* depends on state */ } }
  };

  // ===== Welcome / Farewell builder =====
  const welcomeState = { cfg: null, dirty: false };

  async function renderWelcomePage() {
    const gId = activeGuildId();
    if (!gId) return;
    try {
      const data = await fetchJson(`/api/admin/welcome?guildId=${encodeURIComponent(gId)}`);
      welcomeState.cfg = data;
      // Populate the channel picker.
      const sel = $('welcome-channel');
      if (sel) {
        sel.innerHTML = '<option value="">— off —</option>';
        (data.channels || []).forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `#${c.name}${c.parentName ? ` (${c.parentName})` : ''}`;
          if (c.id === data.welcomeChannelId) opt.selected = true;
          sel.appendChild(opt);
        });
      }
      $('welcome-message').value = data.welcomeMessage || '';
      $('welcome-farewell').value = data.farewellMessage || '';
      $('welcome-sound').value = data.welcomeSoundUrl || '';
      $('welcome-leave-sound').value = data.leaveSoundUrl || '';
      welcomeState.dirty = false;
      refreshWelcomePreview();
    } catch (e) {
      toast('▲ Load failed', e.message, 'error', 3500);
    }
  }

  function refreshWelcomePreview() {
    const sampleUser = '@NewMember';
    const sampleServer = currentServer()?.name || '{server}';
    const sub = (tpl, fallback) => (tpl || fallback).replace(/\{user\}/g, sampleUser).replace(/\{server\}/g, sampleServer);
    const joinTpl = $('welcome-message').value || '✦  Welcome to **{server}**, {user}! Glad to have you on board.';
    const leaveTpl = $('welcome-farewell').value || '◌  {user} has departed **{server}**. Until next time.';
    $('welcome-preview-join-text').textContent = sub(joinTpl, '');
    $('welcome-preview-leave-text').textContent = sub(leaveTpl, '');
  }

  ['welcome-message', 'welcome-farewell'].forEach((id) => {
    $(id)?.addEventListener('input', () => { welcomeState.dirty = true; refreshWelcomePreview(); });
  });
  ['welcome-channel', 'welcome-sound', 'welcome-leave-sound'].forEach((id) => {
    $(id)?.addEventListener('input', () => { welcomeState.dirty = true; });
    $(id)?.addEventListener('change', () => { welcomeState.dirty = true; });
  });

  $('welcome-save')?.addEventListener('click', async () => {
    const gId = activeGuildId();
    if (!gId) return toast('▲ No server', 'Select a server.', 'error', 2000);
    try {
      const body = {
        guildId: gId,
        welcomeChannelId: $('welcome-channel').value || null,
        welcomeMessage: $('welcome-message').value,
        farewellMessage: $('welcome-farewell').value,
        welcomeSoundUrl: $('welcome-sound').value,
        leaveSoundUrl: $('welcome-leave-sound').value,
      };
      const data = await fetchJson('/api/admin/welcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (data.error) throw new Error(data.error);
      welcomeState.dirty = false;
      toast('✓ Saved', 'Welcome config updated', 'success', 2500);
    } catch (e) { toast('▲ Save failed', e.message, 'error', 3500); }
  });

  $('welcome-reset')?.addEventListener('click', renderWelcomePage);

  // ===== Reaction roles editor =====
  const rrState = { entries: [], roles: [], channels: [] };

  async function renderReactionsPage() {
    const gId = activeGuildId();
    if (!gId) return;
    const list = $('rr-list');
    list.innerHTML = '<div class="muted">Loading…</div>';
    try {
      const data = await fetchJson(`/api/admin/reaction-roles?guildId=${encodeURIComponent(gId)}`);
      rrState.entries = data.entries || [];
      rrState.roles = data.roles || [];
      rrState.channels = data.channels || [];
    } catch (e) {
      list.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
      return;
    }
    // Populate create form.
    const chSel = $('rr-channel');
    if (chSel) {
      chSel.innerHTML = rrState.channels.map((c) =>
        `<option value="${escapeHtmlSafe(c.id)}">#${escapeHtmlSafe(c.name)}</option>`).join('');
    }
    const roleSel = $('rr-role');
    if (roleSel) {
      roleSel.innerHTML = rrState.roles.map((r) =>
        `<option value="${escapeHtmlSafe(r.id)}" style="color:${r.color}">${escapeHtmlSafe(r.name)}</option>`).join('');
    }
    $('rr-summary').textContent = `${rrState.entries.length} active mapping${rrState.entries.length === 1 ? '' : 's'}`;
    if (!rrState.entries.length) {
      list.innerHTML = '<div class="muted">No reaction roles configured yet. Create one above.</div>';
      return;
    }
    list.innerHTML = '';
    rrState.entries.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'rr-row' + (e.stale ? ' stale' : '');
      const color = e.roleColor || '#99aab5';
      row.innerHTML = `
        <span class="rr-emoji">${escapeHtmlSafe(e.emoji)}</span>
        <span>→</span>
        <span class="rr-role-name" style="color:${color}">${escapeHtmlSafe(e.roleName || `(deleted: ${e.roleId})`)}</span>
        <span class="rr-msg-id" title="Message ID">${escapeHtmlSafe(e.messageId)}</span>
        <button class="rr-delete" data-mid="${escapeHtmlSafe(e.messageId)}">✕ Remove</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll('.rr-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const messageId = btn.dataset.mid;
        if (!confirm('Remove this reaction role mapping?')) return;
        try {
          const data = await fetchJson('/api/admin/reaction-roles/delete', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: gId, messageId }),
          });
          if (data.error) throw new Error(data.error);
          toast('✕ Removed', 'Mapping deleted', 'info', 2000);
          renderReactionsPage();
        } catch (e) { toast('▲ Remove failed', e.message, 'error', 3500); }
      });
    });
  }

  $('rr-refresh')?.addEventListener('click', renderReactionsPage);
  $('rr-create')?.addEventListener('click', async () => {
    const gId = activeGuildId();
    if (!gId) return toast('▲ No server', 'Select a server.', 'error', 2000);
    const channelId = $('rr-channel').value;
    const roleId = $('rr-role').value;
    const emoji = $('rr-emoji').value.trim();
    const title = $('rr-title').value.trim() || 'Self-assign role';
    if (!channelId || !roleId || !emoji) {
      return toast('▲ Missing fields', 'Channel + role + emoji required.', 'error', 2500);
    }
    try {
      const data = await fetchJson('/api/admin/reaction-roles/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: gId, channelId, roleId, emoji, title }),
      });
      if (data.error) throw new Error(data.error);
      toast('+ Embed posted', `Message ${data.messageId}`, 'success', 3000);
      $('rr-emoji').value = '';
      $('rr-title').value = '';
      renderReactionsPage();
    } catch (e) { toast('▲ Create failed', e.message, 'error', 4000); }
  });

  // ===== Auto-subscribed playlists =====
  async function renderSubs() {
    const list = $('subs-list');
    if (!list) return;
    try {
      const data = await fetchJson('/api/admin/playlist-subs');
      const subs = data.subs || [];
      if (!subs.length) {
        list.innerHTML = '<div class="muted">No subscriptions yet. Click <strong>+ Subscribe</strong> to add one.</div>';
        return;
      }
      list.innerHTML = '';
      subs.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'sub-row';
        const last = s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : 'never';
        const next = s.nextSyncAt ? new Date(s.nextSyncAt).toLocaleString() : '—';
        const err = s.lastError ? `<div class="sub-err">▲ ${escapeHtmlSafe(s.lastError)}</div>` : '';
        row.innerHTML = `
          <div>
            <div class="sub-name">${escapeHtmlSafe(s.name)}</div>
            <div class="sub-meta">${escapeHtmlSafe(s.url)}</div>
            <div class="sub-stats">every ${s.intervalHours}h · ${s.format} · installed ${s.totalInstalled || 0} total · last sync ${escapeHtmlSafe(last)} · next ${escapeHtmlSafe(next)}</div>
            ${err}
          </div>
          <div class="sub-actions">
            <button data-sid="${escapeHtmlSafe(s.id)}" data-act="sync">↺ Sync now</button>
            <button data-sid="${escapeHtmlSafe(s.id)}" data-act="remove" class="danger">✕</button>
          </div>`;
        list.appendChild(row);
      });
      list.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.sid;
          const act = btn.dataset.act;
          if (act === 'sync') {
            try {
              await fetchJson('/api/admin/playlist-subs/sync', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
              });
              toast('↺ Syncing', 'Running in background', 'info', 2500);
            } catch (e) { toast('▲ Sync failed', e.message, 'error', 3000); }
          } else if (act === 'remove') {
            if (!confirm('Remove this subscription? Installed tracks are kept.')) return;
            try {
              await fetchJson('/api/admin/playlist-subs/remove', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
              });
              toast('✕ Removed', '', 'info', 1500);
              renderSubs();
            } catch (e) { toast('▲ Remove failed', e.message, 'error', 3000); }
          }
        });
      });
    } catch (e) {
      list.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
    }
  }

  $('subs-add')?.addEventListener('click', async () => {
    const url = prompt('Playlist URL to subscribe to (YouTube / SoundCloud / Bandcamp):');
    if (!url) return;
    const name = prompt('Display name:', 'Subscribed playlist');
    if (!name) return;
    const format = prompt('Format (original / mp3 / opus / flac / wav):', 'original');
    if (!format) return;
    const interval = prompt('Sync interval in hours (1–168):', '24');
    if (!interval) return;
    try {
      await fetchJson('/api/admin/playlist-subs/add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name, format, intervalHours: Number(interval) }),
      });
      toast('+ Subscribed', name, 'success', 2500);
      renderSubs();
    } catch (e) { toast('▲ Subscribe failed', e.message, 'error', 4000); }
  });

  // Auto-load when the user opens the uploads tab (which already triggers
  // renderUploads). Hook the tab click.
  document.querySelector('#library-tabs .tab[data-tab="uploads"]')?.addEventListener('click', () => {
    setTimeout(renderSubs, 100);
  });

  // ===== Listening heatmap =====
  async function renderHeatmap() {
    const gId = activeGuildId();
    const container = $('heatmap-container');
    if (!container) return;
    if (!gId) { container.innerHTML = '<div class="muted">Select a server first.</div>'; return; }
    try {
      const data = await fetchJson(`/api/admin/heatmap?guildId=${encodeURIComponent(gId)}&days=365`);
      drawHeatmap(data);
    } catch (e) {
      container.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
    }
  }

  function drawHeatmap(data) {
    const container = $('heatmap-container');
    const summary = $('heatmap-summary');
    if (!container) return;
    const dates = Object.keys(data.byDay).sort();
    if (summary) {
      summary.textContent = `${data.total} plays over the last ${data.days} days · peak ${data.peak}/day`;
    }
    // Level scale: 0 = no plays, 4 = at or above peak.
    const levelFor = (n) => {
      if (n === 0) return 0;
      const pct = n / Math.max(1, data.peak);
      if (pct >= 0.75) return 4;
      if (pct >= 0.5) return 3;
      if (pct >= 0.25) return 2;
      return 1;
    };
    // Build a grid: columns = weeks, rows = days of the week.
    // Find the Sunday on or before the first date so all columns are aligned.
    const firstDate = new Date(dates[0]);
    const startSun = new Date(firstDate);
    startSun.setDate(startSun.getDate() - startSun.getDay());
    const lastDate = new Date(dates[dates.length - 1]);
    const weeks = Math.ceil(((lastDate - startSun) / 86400000 + 1) / 7);
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'heatmap-grid';
    grid.style.gridTemplateColumns = `repeat(${weeks}, 11px)`;
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        const date = new Date(startSun);
        date.setDate(date.getDate() + w * 7 + d);
        const key = date.toISOString().slice(0, 10);
        const plays = data.byDay[key];
        if (plays === undefined) {
          cell.style.visibility = 'hidden';
        } else {
          cell.setAttribute('data-level', levelFor(plays));
          cell.title = `${key}: ${plays} play${plays === 1 ? '' : 's'}`;
        }
        cell.style.gridColumn = `${w + 1}`;
        cell.style.gridRow = `${d + 1}`;
        grid.appendChild(cell);
      }
    }
    container.appendChild(grid);
  }

  // Hook WS broadcast for sub sync completion.
  const origHandleForSubs = handle;
  handle = (msg) => {
    origHandleForSubs(msg);
    if (msg.type === 'playlist_subs') {
      if (activePage === 'library') renderSubs();
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

  // ===== Library state: search / sort / pagination =====
  const uploadsState = {
    songs: [],
    meta: { dir: '', totalBytes: 0, totalSec: 0, ytDlpAvailable: true },
    search: '',
    sort: localStorage.getItem('maow.libSort') || 'newest',
    perPage: Number(localStorage.getItem('maow.libPerPage') || 50),
    page: Number(localStorage.getItem('maow.libPage') || 1),
  };

  const fmtGB = (b) => {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };
  const fmtDurTotal = (sec) => {
    if (!sec || !Number.isFinite(sec)) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h >= 1) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const compareSongs = (a, b, mode) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    switch (mode) {
      case 'oldest': return (a.addedAt || 0) - (b.addedAt || 0);
      case 'name-asc': return nameA.localeCompare(nameB);
      case 'name-desc': return nameB.localeCompare(nameA);
      case 'size-desc': return (b.size || 0) - (a.size || 0);
      case 'size-asc': return (a.size || 0) - (b.size || 0);
      case 'dur-desc': return (b.durationSec || 0) - (a.durationSec || 0);
      case 'dur-asc': return (a.durationSec || 0) - (b.durationSec || 0);
      case 'newest':
      default: return (b.addedAt || 0) - (a.addedAt || 0);
    }
  };

  // Build a smart pagination list with leading/trailing windows and ellipsis.
  // E.g. for 20 pages, current 8: [1, …, 6, 7, 8, 9, 10, …, 20]
  const paginationItems = (current, total) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const items = new Set([1, total, current - 1, current, current + 1]);
    if (current <= 4) [2, 3, 4, 5].forEach((n) => items.add(n));
    if (current >= total - 3) [total - 4, total - 3, total - 2, total - 1].forEach((n) => items.add(n));
    const sorted = [...items].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…');
      out.push(sorted[i]);
    }
    return out;
  };

  const renderUploads = async () => {
    const out = $('uploads-list');
    if (!out) return;
    try {
      const res = await fetch('/api/library');
      const data = await res.json();
      uploadsState.songs = data.songs || [];
      uploadsState.meta = {
        dir: data.dir || '',
        totalBytes: data.totalBytes || 0,
        totalSec: data.totalSec || 0,
        ytDlpAvailable: data.ytDlpAvailable !== false,
      };
      renderUploadsView();
    } catch (e) {
      out.innerHTML = `<div class="error">▲ ${escapeHtmlSafe(e.message)}</div>`;
    }
  };

  const renderUploadsView = () => {
    const out = $('uploads-list');
    const countEl = $('uploads-count');
    const statsEl = $('uploads-stats');
    const summaryEl = $('lib-summary');
    const pagEl = $('pagination');
    const installBtn = $('install-btn');
    const installNote = $('install-note');
    if (!out) return;

    const all = uploadsState.songs;
    if (countEl) countEl.textContent = `${all.length} song${all.length === 1 ? '' : 's'}`;

    // Storage stats at top.
    if (statsEl) {
      if (!all.length) statsEl.textContent = '— empty —';
      else statsEl.textContent =
        `${all.length} song${all.length === 1 ? '' : 's'} · ${fmtGB(uploadsState.meta.totalBytes)} · ${fmtDurTotal(uploadsState.meta.totalSec)}`;
    }

    // Disable install if yt-dlp isn't present on the host.
    if (installBtn) installBtn.disabled = !uploadsState.meta.ytDlpAvailable;
    if (installNote && !uploadsState.meta.ytDlpAvailable) {
      installNote.innerHTML =
        '<strong>▲ yt-dlp not found.</strong> Install can\'t run on this host. ' +
        'On Docker this is bundled — check the runtime image.';
    }

    // Empty library.
    if (!all.length) {
      out.innerHTML = '<div class="queue-empty">— no songs yet — install from URL or drag &amp; drop above —</div>';
      if (summaryEl) summaryEl.textContent = uploadsState.meta.dir ? `stored in ${uploadsState.meta.dir}` : '—';
      if (pagEl) { pagEl.hidden = true; pagEl.innerHTML = ''; }
      return;
    }

    // Filter (case-insensitive substring on name).
    const q = uploadsState.search.trim().toLowerCase();
    let filtered = q
      ? all.filter((s) => (s.name || '').toLowerCase().includes(q))
      : all.slice();

    // Sort.
    filtered.sort((a, b) => compareSongs(a, b, uploadsState.sort));

    // Pagination.
    const perPage = uploadsState.perPage > 0 ? uploadsState.perPage : filtered.length;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (uploadsState.page > totalPages) uploadsState.page = totalPages;
    if (uploadsState.page < 1) uploadsState.page = 1;
    const start = (uploadsState.page - 1) * perPage;
    const pageSongs = filtered.slice(start, start + perPage);

    // Summary line.
    if (summaryEl) {
      const filteredBytes = filtered.reduce((sum, s) => sum + (s.size || 0), 0);
      const filteredSec = filtered.reduce((sum, s) => sum + (s.durationSec || 0), 0);
      const showingFrom = filtered.length ? start + 1 : 0;
      const showingTo = Math.min(start + perPage, filtered.length);
      const matchLabel = q ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : `${filtered.length} song${filtered.length === 1 ? '' : 's'}`;
      const dirLabel = uploadsState.meta.dir ? ` · stored in ${escapeHtmlSafe(uploadsState.meta.dir)}` : '';
      summaryEl.innerHTML =
        `Showing <strong>${showingFrom}–${showingTo}</strong> of ${matchLabel} · ${fmtGB(filteredBytes)} · ${fmtDurTotal(filteredSec)}${dirLabel}`;
    }

    // Render rows.
    if (!pageSongs.length) {
      out.innerHTML = `<div class="queue-empty">— no matches for "${escapeHtmlSafe(q)}" —</div>`;
    } else {
      out.innerHTML = '';
      pageSongs.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'upload-row';
        const warnBadge = s.losslessInLossyContainer
          ? ' <span class="u-badge-warn" title="Lossless container wrapping a lossy source — no real fidelity gain">lossy source</span>'
          : '';
        const sourceTag = s.source === 'install' ? ' · installed' : '';
        row.innerHTML = `
          <div style="min-width:0">
            <div class="u-name">${escapeHtmlSafe(s.name)}${warnBadge}</div>
            <div class="u-meta">${escapeHtmlSafe(s.ext || '')} · ${fmtBytes2(s.size || 0)}${s.durationSec ? ' · ' + fmtClock(s.durationSec) : ''}${sourceTag}</div>
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
    }

    // Pagination controls.
    if (pagEl) {
      if (totalPages <= 1) {
        pagEl.hidden = true;
        pagEl.innerHTML = '';
      } else {
        pagEl.hidden = false;
        pagEl.innerHTML = '';
        const mkBtn = (label, page, opts = {}) => {
          const b = document.createElement('button');
          b.textContent = label;
          if (opts.active) b.classList.add('active');
          if (opts.disabled) b.disabled = true;
          if (!opts.disabled && page != null) {
            b.addEventListener('click', () => {
              uploadsState.page = page;
              localStorage.setItem('maow.libPage', String(page));
              renderUploadsView();
              const tabPanel = document.getElementById('tab-uploads');
              if (tabPanel) tabPanel.scrollTop = 0;
            });
          }
          return b;
        };
        pagEl.appendChild(mkBtn('‹', uploadsState.page - 1, { disabled: uploadsState.page === 1 }));
        paginationItems(uploadsState.page, totalPages).forEach((it) => {
          if (it === '…') {
            const span = document.createElement('span');
            span.className = 'ellipsis';
            span.textContent = '…';
            pagEl.appendChild(span);
          } else {
            pagEl.appendChild(mkBtn(String(it), it, { active: it === uploadsState.page }));
          }
        });
        pagEl.appendChild(mkBtn('›', uploadsState.page + 1, { disabled: uploadsState.page === totalPages }));
      }
    }
  };

  // ===== Library controls: wire up search / sort / per-page =====
  const libSearchEl = $('lib-search');
  const libSortEl = $('lib-sort');
  const libPerPageEl = $('lib-perpage');
  if (libSortEl) {
    libSortEl.value = uploadsState.sort;
    libSortEl.addEventListener('change', () => {
      uploadsState.sort = libSortEl.value;
      uploadsState.page = 1;
      localStorage.setItem('maow.libSort', uploadsState.sort);
      localStorage.setItem('maow.libPage', '1');
      renderUploadsView();
    });
  }
  if (libPerPageEl) {
    libPerPageEl.value = String(uploadsState.perPage);
    libPerPageEl.addEventListener('change', () => {
      uploadsState.perPage = Number(libPerPageEl.value);
      uploadsState.page = 1;
      localStorage.setItem('maow.libPerPage', String(uploadsState.perPage));
      localStorage.setItem('maow.libPage', '1');
      renderUploadsView();
    });
  }
  if (libSearchEl) {
    let searchTimer = null;
    libSearchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        uploadsState.search = libSearchEl.value;
        uploadsState.page = 1;
        localStorage.setItem('maow.libPage', '1');
        renderUploadsView();
      }, 120);
    });
  }

  // ===== Install from URL =====
  const installBtn = $('install-btn');
  const installUrl = $('install-url');
  const installFormat = $('install-format');
  const installProgress = $('install-progress');
  const savedFormat = localStorage.getItem('maow.installFormat');
  if (installFormat && savedFormat) installFormat.value = savedFormat;
  if (installFormat) {
    installFormat.addEventListener('change', () =>
      localStorage.setItem('maow.installFormat', installFormat.value));
  }
  const installHint = $('install-hint');

  // Recognize playlist-style URLs so we can switch to the playlist flow.
  const isPlaylistUrl = (url) => {
    if (!url) return false;
    try {
      const u = new URL(url);
      if (u.searchParams.has('list')) return true;
      if (/\/playlist\//.test(u.pathname)) return true;
      if (/\/sets\//.test(u.pathname)) return true;   // SoundCloud sets
      if (/\/album\//.test(u.pathname)) return true;  // Bandcamp/Spotify
      return false;
    } catch { return false; }
  };

  // Live hint as the user types.
  if (installUrl && installHint) {
    installUrl.addEventListener('input', () => {
      const u = installUrl.value.trim();
      if (!u) { installHint.hidden = true; return; }
      if (!/^https?:\/\//i.test(u)) {
        installHint.hidden = false;
        installHint.classList.add('error');
        installHint.textContent = 'URL must start with http:// or https://';
        return;
      }
      installHint.classList.remove('error');
      if (isPlaylistUrl(u)) {
        installHint.hidden = false;
        installHint.innerHTML = '🎵  Detected a <strong>playlist URL</strong> — installing will queue every track in the background.';
      } else {
        installHint.hidden = true;
      }
    });
  }

  if (installBtn && installUrl) {
    const runInstall = async () => {
      const url = installUrl.value.trim();
      if (!url) { toast('▲ No URL', 'Paste a YouTube / SoundCloud / Bandcamp / direct URL.', 'error', 2500); return; }
      if (!/^https?:\/\//i.test(url)) { toast('▲ Bad URL', 'Must start with http:// or https://', 'error', 2500); return; }
      const format = installFormat ? installFormat.value : 'original';
      const playlistLike = isPlaylistUrl(url);

      installBtn.disabled = true;
      const prevText = installBtn.textContent;

      // -------- Playlist path: probe → confirm → start background job --------
      if (playlistLike) {
        installBtn.textContent = 'Probing…';
        if (installProgress) {
          installProgress.hidden = false;
          installProgress.textContent = `↓ Probing playlist ${url}…`;
        }
        try {
          const probeRes = await fetch('/api/library/probe-playlist', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });
          const probe = await probeRes.json();
          if (!probeRes.ok || probe.error) throw new Error(probe.error || `server returned ${probeRes.status}`);
          const sampleStr = probe.sample?.length
            ? '\n\n  • ' + probe.sample.join('\n  • ') + (probe.count > probe.sample.length ? `\n  • …and ${probe.count - probe.sample.length} more` : '')
            : '';
          const cfg = uploadsState.downloadConfig || { concurrency: 5, limitRate: null };
          const rateLabel = cfg.limitRate || 'unlimited rate';
          if (!confirm(
            `Install all ${probe.count} song${probe.count === 1 ? '' : 's'} from "${probe.playlistName}"?\n\n` +
            `Format: ${format} · Concurrency: ${cfg.concurrency} · ${rateLabel}` +
            sampleStr
          )) {
            installBtn.disabled = !uploadsState.meta.ytDlpAvailable;
            installBtn.textContent = prevText;
            if (installProgress) installProgress.hidden = true;
            return;
          }
          installBtn.textContent = 'Queued';
          const startRes = await fetch('/api/library/install-playlist', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, format }),
          });
          const startData = await startRes.json();
          if (!startRes.ok || startData.error) throw new Error(startData.error || `server returned ${startRes.status}`);
          if (installProgress) installProgress.textContent = `↓ Background job started (${startData.jobId}) — progress in the badge bottom-right.`;
          toast('⬇ Playlist queued', `${probe.count} songs · download in the background`, 'success', 3500);
          installUrl.value = '';
          if (installHint) installHint.hidden = true;
          setTimeout(() => { if (installProgress) installProgress.hidden = true; }, 4000);
        } catch (e) {
          if (installProgress) installProgress.textContent = `▲ Playlist install failed: ${e.message}`;
          toast('▲ Playlist install failed', e.message, 'error', 5000);
        } finally {
          installBtn.disabled = !uploadsState.meta.ytDlpAvailable;
          installBtn.textContent = prevText;
        }
        return;
      }

      // -------- Single-song path (existing behavior) --------
      installBtn.textContent = 'Installing…';
      if (installProgress) {
        installProgress.hidden = false;
        installProgress.textContent = `↓ Fetching ${url}\n  format: ${format}\n  (this can take a moment — yt-dlp is downloading and probing)…`;
      }
      try {
        const res = await fetch('/api/library/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, format }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `server returned ${res.status}`);
        const entry = data.entry || {};
        const sizeStr = entry.size ? `${(entry.size / 1024 / 1024).toFixed(1)} MB` : '?';
        if (data.alreadyInstalled) {
          if (installProgress) installProgress.textContent = `↩ Already installed: ${entry.name} (${entry.ext}, ${sizeStr})`;
          toast('↩ Already installed', entry.name || url, 'info', 3000);
        } else {
          const note = entry.losslessInLossyContainer
            ? '\n  ▲ Note: lossless container wrapping a lossy source — no real fidelity gain.'
            : '';
          if (installProgress) installProgress.textContent = `✓ Installed ${entry.name} · ${entry.ext} · ${sizeStr}${note}`;
          toast('✓ Installed', `${entry.name} · ${entry.ext} · ${sizeStr}`, 'success', 3500);
          installUrl.value = '';
          if (installHint) installHint.hidden = true;
        }
        renderUploads();
        setTimeout(() => { if (installProgress) installProgress.hidden = true; }, 6000);
      } catch (e) {
        if (installProgress) installProgress.textContent = `▲ Install failed: ${e.message}`;
        toast('▲ Install failed', e.message, 'error', 5000);
      } finally {
        installBtn.disabled = !uploadsState.meta.ytDlpAvailable;
        installBtn.textContent = prevText;
      }
    };
    installBtn.addEventListener('click', runInstall);
    installUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') runInstall(); });
  }

  // ===== Download config (concurrency + per-stream rate cap) =====
  const cfgConcurrency = $('cfg-concurrency');
  const cfgLimitRate = $('cfg-limit-rate');
  const cfgSummary = $('cfg-summary');
  const cfgSaveBtn = $('cfg-save');

  const refreshCfgSummary = () => {
    if (!cfgSummary || !cfgConcurrency || !cfgLimitRate) return;
    const c = Number(cfgConcurrency.value) || 0;
    const r = cfgLimitRate.value || 'unlimited';
    cfgSummary.innerHTML = r === 'unlimited'
      ? `≈ <strong>${c}</strong> parallel · unlimited`
      : `≈ <strong>${c}</strong> × <strong>${r}/s</strong> = up to ${c} × ${r}/s aggregate`;
  };

  const loadDownloadConfig = async () => {
    try {
      const res = await fetch('/api/library/config');
      const cfg = await res.json();
      uploadsState.downloadConfig = cfg;
      if (cfgConcurrency) cfgConcurrency.value = cfg.concurrency;
      if (cfgLimitRate) cfgLimitRate.value = cfg.limitRate || '';
      refreshCfgSummary();
    } catch { /* server not ready yet */ }
  };
  loadDownloadConfig();
  cfgConcurrency?.addEventListener('input', refreshCfgSummary);
  cfgLimitRate?.addEventListener('change', refreshCfgSummary);
  cfgSaveBtn?.addEventListener('click', async () => {
    try {
      const body = {
        concurrency: Number(cfgConcurrency.value) || 5,
        limitRate: cfgLimitRate.value || null,
      };
      const res = await fetch('/api/library/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `server returned ${res.status}`);
      uploadsState.downloadConfig = data.config;
      toast('✓ Settings saved', `${data.config.concurrency} concurrent · ${data.config.limitRate || 'unlimited'}/s`, 'success', 2500);
    } catch (e) {
      toast('▲ Save failed', e.message, 'error', 3000);
    }
  });

  // ===== Background download-jobs UI =====
  const dlState = {
    jobs: new Map(),
    panelOpen: false,
  };

  function renderDlQueue() {
    const wrap = $('dl-queue');
    const summary = $('dl-queue-summary');
    const rate = $('dl-queue-rate');
    const body = $('dl-queue-body');
    if (!wrap || !summary || !body) return;

    const running = [...dlState.jobs.values()].filter((j) => j.status === 'running' || j.status === 'cancelling');
    const recent = [...dlState.jobs.values()].filter((j) => j.status !== 'running' && j.status !== 'cancelling');

    if (!running.length && !recent.length) { wrap.hidden = true; return; }
    wrap.hidden = false;

    // Aggregate progress across running jobs.
    const total = running.reduce((s, j) => s + (j.total || 0), 0);
    const done = running.reduce((s, j) => s + (j.done || 0) + (j.skipped || 0), 0);
    summary.textContent = running.length ? `${done}/${total}` : '✓ done';
    if (rate) rate.textContent = running.length ? `· ${running.length} active` : '';

    // Re-render the panel body.
    body.innerHTML = '';
    [...running, ...recent.slice(0, 5)].forEach((job) => body.appendChild(renderJobRow(job)));
  }

  function renderJobRow(job) {
    const row = document.createElement('div');
    row.className = 'dl-job';
    row.setAttribute('data-status', job.status);
    const total = job.total || 0;
    const finished = (job.done || 0) + (job.skipped || 0) + (job.failed || 0);
    const pct = total > 0 ? Math.min(100, Math.round((finished / total) * 100)) : 0;
    const isRunning = job.status === 'running' || job.status === 'cancelling';
    const name = job.playlistName || job.url || 'Playlist';
    const cancelBtn = isRunning
      ? `<button class="dl-job-cancel" data-job="${escapeHtmlSafe(job.id)}">Cancel</button>`
      : '';
    row.innerHTML = `
      <div class="dl-job-head">
        <div class="dl-job-name" title="${escapeHtmlSafe(job.url || '')}">${escapeHtmlSafe(name)}</div>
        <div>
          <span class="dl-job-status">${escapeHtmlSafe(job.status)}</span>
          ${cancelBtn}
        </div>
      </div>
      <div class="dl-job-bar"><div class="dl-job-bar-fill" style="width:${pct}%"></div></div>
      <div class="dl-job-stats">
        <span class="stat-ok">✓ ${job.done || 0} installed</span>
        ${job.skipped ? `<span class="stat-skip">↩ ${job.skipped} skipped</span>` : ''}
        ${job.failed ? `<span class="stat-fail">✕ ${job.failed} failed</span>` : ''}
        ${total ? `<span>${finished}/${total}</span>` : ''}
      </div>
      ${isRunning && job.currentTitles?.length ? `<div class="dl-job-current">${
        job.currentTitles.slice(0, 3).map((t) => `<div class="cur-row">↓ ${escapeHtmlSafe(t)}</div>`).join('')
      }</div>` : ''}
    `;
    row.querySelector('.dl-job-cancel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelJob(job.id);
    });
    return row;
  }

  async function cancelJob(jobId) {
    try {
      await fetch(`/api/library/install-jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
      toast('⊘ Cancelling', 'Stopping the running yt-dlp processes…', 'info', 2000);
    } catch (e) { toast('▲ Cancel failed', e.message, 'error', 2500); }
  }

  $('dl-queue-chip')?.addEventListener('click', () => {
    dlState.panelOpen = !dlState.panelOpen;
    const panel = $('dl-queue-panel');
    if (panel) panel.hidden = !dlState.panelOpen;
  });
  $('dl-queue-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    dlState.panelOpen = false;
    $('dl-queue-panel').hidden = true;
  });
  $('dl-cancel-all')?.addEventListener('click', async () => {
    const running = [...dlState.jobs.values()].filter((j) => j.status === 'running');
    if (!running.length) return;
    if (!confirm(`Cancel all ${running.length} running download${running.length === 1 ? '' : 's'}?`)) return;
    for (const job of running) await cancelJob(job.id);
  });

  // Hook job updates from the existing `handle()` chain (which already covers
  // `state`, `log`, `diagnostics`, `install_jobs`).
  const origHandleForDl = handle;
  handle = (msg) => {
    origHandleForDl(msg);
    if (msg.type === 'install_jobs') {
      dlState.jobs.clear();
      (msg.jobs || []).forEach((j) => dlState.jobs.set(j.id, j));
      renderDlQueue();
    } else if (msg.type === 'install_job') {
      dlState.jobs.set(msg.job.id, msg.job);
      renderDlQueue();
      // When a job finishes, refresh the library list so newly-installed songs appear.
      if (msg.job.status === 'done' || msg.job.status === 'cancelled') {
        try { renderUploads(); } catch { /* renderUploads may not exist yet */ }
      }
    } else if (msg.type === 'speedtest') {
      renderSpeedtestResult(msg.result);
      if (msg.result?.error) {
        toast('▲ Speedtest failed', msg.result.error, 'error', 5000);
      } else if (msg.result) {
        toast('⚡ Speedtest done',
          `↓${msg.result.downloadMbps?.toFixed(1)} ↑${msg.result.uploadMbps?.toFixed(1)} Mbps`,
          'success', 3500);
      }
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
