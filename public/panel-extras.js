// Home widgets, synced lyrics, comfort options, soundboard and the control room.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
  const api = async (path, body, headers) => {
    const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: headers || { 'Content-Type': 'application/json' }, body: headers ? body : JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };
  const note = (t, bad) => { if (typeof window.toast === 'function') window.toast(bad ? 'Problem' : 'Done', t, bad ? 'error' : 'success', 3000); else console.log(t); };

  // Send the sign-in session with every panel request (only matters with login on).
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const session = (() => { try { return localStorage.getItem('maow.session'); } catch { return null; } })();
    if (session && (url.startsWith('/') || url.startsWith(location.origin))) {
      const headers = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers));
      if (!headers.has('X-Maow-Session')) headers.set('X-Maow-Session', session);
      return realFetch(input, { ...init, headers });
    }
    return realFetch(input, init);
  };

  // ===== Home widgets =====
  const home = $('page-home');
  const widgets = {};
  const mark = (node, id, name, full) => {
    if (!node) return;
    node.dataset.w = id;
    node.dataset.wname = name;
    if (full) node.classList.add('w-full');
    widgets[id] = node;
  };
  const row = home.querySelector('.row-2');
  const [queueCard, activityCard] = row ? [...row.children] : [];
  mark(home.querySelector('.now-playing'), 'np', 'Now playing', true);
  mark(home.querySelector('.stats-strip'), 'stats', 'Stats', true);
  if (row) { row.after(queueCard, activityCard); row.remove(); }
  mark(queueCard, 'queue', 'Up next');
  mark(activityCard, 'activity', 'Activity');

  const card = (id, name, title, sub) => {
    const c = el('div', 'card');
    const head = el('div', 'card-head');
    head.append(el('h3', null, title));
    if (sub) head.append(el('div', 'muted small', sub));
    c.append(head);
    home.append(c);
    mark(c, id, name);
    return c;
  };
  const lyricsCard = card('lyrics', 'Synced lyrics', 'Synced lyrics');
  const lyricBox = el('div', null);
  lyricBox.id = 'w-lyrics-box';
  lyricBox.append(el('div', 'muted', 'Lyrics appear here when a song plays.'));
  lyricsCard.append(lyricBox);
  const statusCard = card('status', 'Status', 'Status');
  const statusBox = el('div');
  statusCard.append(statusBox);

  const tools = el('div', 'home-tools');
  const arrangeBtn = el('button', 'tool-btn', '✎ Arrange');
  const focusBtn = el('button', 'tool-btn', '🎯 Focus');
  tools.append(focusBtn, arrangeBtn);
  home.prepend(tools);

  let layout = load('maow.home.layout', { order: [], hidden: [] });
  const applyLayout = () => {
    const known = Object.keys(widgets);
    const order = [...layout.order.filter((id) => widgets[id]), ...known.filter((id) => !layout.order.includes(id))];
    let prev = tools;
    for (const id of order) { prev.after(widgets[id]); prev = widgets[id]; widgets[id].classList.toggle('w-hidden', layout.hidden.includes(id)); }
    layout.order = order;
  };
  const commit = () => { save('maow.home.layout', layout); applyLayout(); };
  const move = (id, by) => {
    const i = layout.order.indexOf(id); const j = i + by;
    if (j < 0 || j >= layout.order.length) return;
    [layout.order[i], layout.order[j]] = [layout.order[j], layout.order[i]];
    commit();
  };
  const attach = (id, node) => {
    const bar = el('div', 'w-tools');
    bar.append(el('span', 'w-name', `⠿ ${node.dataset.wname}`));
    const up = el('button', 'tool-btn', '▲'); up.title = 'Move up'; up.onclick = () => move(id, -1);
    const down = el('button', 'tool-btn', '▼'); down.title = 'Move down'; down.onclick = () => move(id, 1);
    const eye = el('button', 'tool-btn', '👁'); eye.title = 'Hide or show';
    eye.onclick = () => {
      layout.hidden = layout.hidden.includes(id) ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id];
      commit();
    };
    bar.append(up, down, eye);
    node.prepend(bar);
    node.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/w', id); e.dataTransfer.effectAllowed = 'move'; });
    node.addEventListener('dragover', (e) => { if (document.body.classList.contains('arranging')) e.preventDefault(); });
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/w');
      if (!from || from === id) return;
      layout.order = layout.order.filter((x) => x !== from);
      layout.order.splice(layout.order.indexOf(id), 0, from);
      commit();
    });
  };
  for (const [id, node] of Object.entries(widgets)) attach(id, node);
  // Other scripts can add Home cards that are arrangeable too. New ones start
  // hidden unless `show` is true, so the Home page doesn't suddenly get busy.
  window.maowHomeWidgets = {
    add: (id, name, title, sub, { show = false } = {}) => {
      if (widgets[id]) return widgets[id];
      const c = card(id, name, title, sub);
      attach(id, c);
      if (!layout.order.includes(id) && !show && !layout.hidden.includes(id) && !(load('maow.home.known', [])).includes(id)) layout.hidden.push(id);
      save('maow.home.known', [...new Set([...load('maow.home.known', []), id])]);
      if (document.body.classList.contains('arranging')) c.draggable = true;
      commit();
      return c;
    },
  };
  const setArranging = (on) => {
    document.body.classList.toggle('arranging', on);
    arrangeBtn.textContent = on ? '✓ Done' : '✎ Arrange';
    for (const n of Object.values(widgets)) n.draggable = on;
  };
  arrangeBtn.onclick = () => setArranging(!document.body.classList.contains('arranging'));
  applyLayout();

  // ===== Synced lyrics =====
  let lyricUrl = null; let lines = []; let lastLine = -1; let time = 0; let timeAt = 0; let paused = true;
  const showLyrics = (d) => {
    lyricBox.replaceChildren();
    lines = d.lines || [];
    lastLine = -1;
    if (!d.found) { lyricBox.append(el('div', 'muted', d.idle ? 'Lyrics appear here when a song plays.' : d.error ? `Lyrics are unavailable: ${d.error}` : 'No lyrics found for this song.')); return; }
    lyricBox.append(el('div', 'muted small', `${d.track} · ${d.artist}${lines.length ? '' : ' · no timing available'}`));
    if (lines.length) lines.forEach((l, i) => { const row2 = el('div', 'ly-line', l.text || '♪'); row2.dataset.i = i; lyricBox.append(row2); });
    else lyricBox.append(el('div', 'ly-plain', d.plain || ''));
  };
  const tickLyrics = () => {
    if (!lines.length) return;
    const now = time + (paused ? 0 : (Date.now() - timeAt) / 1000);
    let i = -1;
    for (let k = 0; k < lines.length && lines[k].t <= now; k++) i = k;
    if (i === lastLine) return;
    lyricBox.querySelector('.ly-line.on')?.classList.remove('on');
    lastLine = i;
    const on = i >= 0 ? lyricBox.querySelector(`.ly-line[data-i="${i}"]`) : null;
    if (on) { on.classList.add('on'); lyricBox.scrollTop = on.offsetTop - lyricBox.offsetTop - lyricBox.clientHeight / 2; }
  };
  setInterval(tickLyrics, 250);

  // ===== Mini status =====
  const LABELS = { operational: ['Operational', 'ms-ok'], degraded: ['Degraded', 'ms-warn'], custom: ['Custom', 'ms-warn'], maintenance: ['Maintenance', 'ms-maint'], offline: ['Offline', 'ms-bad'] };
  const refreshStatus = async () => {
    try {
      const d = await api('/api/status/public');
      statusBox.replaceChildren(...d.services.map((s) => {
        const r = el('div', 'ms-row');
        const [label, cls] = LABELS[s.status] || LABELS.operational;
        r.append(el('span', null, s.name), el('span', cls, s.label || label));
        return r;
      }));
    } catch { /* tries again next time */ }
  };
  refreshStatus();
  setInterval(refreshStatus, 60000);

  // ===== Comfort options =====
  const DEFAULTS = { extras: true, big: false, simple: false, palette: true };
  const comfort = { ...DEFAULTS, ...load('maow.comfort', {}) };
  let hiddenPages = load('maow.hiddenPages', []);
  const applyComfort = () => {
    document.body.classList.toggle('cf-big', comfort.extras && comfort.big);
    document.body.classList.toggle('cf-simple', comfort.extras && comfort.simple);
    focusBtn.style.display = comfort.extras ? '' : 'none';
    if (!comfort.extras) setFocus(false);
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('cf-hidden', hiddenPages.includes(n.dataset.page)));
  };
  const focusExit = el('button', 'tool-btn', '✕ Exit focus');
  focusExit.id = 'focus-exit';
  document.body.append(focusExit);
  function setFocus(on) {
    document.body.classList.toggle('cf-focus', on);
    if (on) document.querySelector('.nav-item[data-page="home"]')?.click();
  }
  focusBtn.onclick = () => setFocus(true);
  focusExit.onclick = () => setFocus(false);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setFocus(false);
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f' && comfort.extras) { e.preventDefault(); setFocus(!document.body.classList.contains('cf-focus')); }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k' && !(comfort.extras && comfort.palette)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  const settings = $('page-settings');
  if (settings) {
    const c = el('div', 'card');
    const head = el('div', 'card-head');
    head.append(el('h3', null, 'Comfort'), el('div', 'muted small', 'Saved on this device'));
    c.append(head);
    const opt = (key, title, sub) => {
      const l = el('label', 'cf-row');
      const box = el('input'); box.type = 'checkbox'; box.checked = comfort[key];
      box.onchange = () => { comfort[key] = box.checked; save('maow.comfort', comfort); applyComfort(); };
      const t = el('div'); t.append(el('div', null, title), el('div', 'muted small', sub));
      l.append(box, t); c.append(l);
    };
    opt('extras', 'ADHD-friendly extras', 'Master switch for the options below and Focus Mode.');
    opt('big', 'Big buttons', 'Larger buttons, text and menu items.');
    opt('simple', 'Fewer menus', 'Sidebar shows only Home, Status, Library, Soundboard and Settings.');
    opt('palette', 'Ctrl+K search', 'Search every page and action from anywhere.');
    c.append(el('div', 'muted small', 'Focus Mode: the 🎯 button on Home, or Ctrl+Shift+F. Press Esc to leave.'));
    const h2 = el('h3', null, 'Hide pages'); h2.style.marginTop = '14px';
    c.append(h2, el('div', 'muted small', 'Hidden pages leave the sidebar. They still work from Ctrl+K search.'));
    const grid = el('div', 'cf-pages');
    document.querySelectorAll('.nav-item').forEach((n) => {
      const page = n.dataset.page;
      if (page === 'home' || page === 'settings') return;
      const l = el('label');
      const box = el('input'); box.type = 'checkbox'; box.checked = !hiddenPages.includes(page);
      box.onchange = () => {
        hiddenPages = box.checked ? hiddenPages.filter((x) => x !== page) : [...hiddenPages, page];
        save('maow.hiddenPages', hiddenPages); applyComfort();
      };
      l.append(box, el('span', null, n.querySelector('.nav-label')?.textContent.trim() || page));
      grid.append(l);
    });
    c.append(grid);
    settings.querySelector('.card')?.after(c);
  }
  applyComfort();

  // ===== Soundboard =====
  let guildId = null;
  const sbGrid = $('sb-grid');
  const refreshSounds = async () => {
    if (!sbGrid) return;
    const { sounds } = await api('/api/sounds');
    sbGrid.replaceChildren();
    if (!sounds.length) sbGrid.append(el('div', 'muted', 'No sounds yet. Upload one above.'));
    for (const file of sounds) {
      const pad = el('div', 'sb-pad');
      const play = el('button', 'sb-play', file.replace(/\.[^.]+$/, ''));
      play.onclick = () => api('/api/sounds/play', { file, guildId }).then(() => note(`Playing ${file}`)).catch((e) => note(e.message, true));
      const del = el('button', 'sb-del', '✕');
      del.title = `Delete ${file}`;
      del.onclick = () => { if (confirm(`Delete ${file}? This can't be undone.`)) api('/api/sounds/delete', { file }).then(refreshSounds).catch((e) => note(e.message, true)); };
      pad.append(play, del); sbGrid.append(pad);
    }
  };
  $('sb-upload')?.addEventListener('change', async (e) => {
    for (const f of e.target.files) {
      try { await api('/api/sounds/upload', f, { 'X-Filename': encodeURIComponent(f.name), 'Content-Type': 'application/octet-stream' }); }
      catch (err) { note(`${f.name}: ${err.message}`, true); }
    }
    e.target.value = '';
    refreshSounds();
  });

  // ===== Control room =====
  const cpu = []; const ram = [];
  const drawGraph = (id, data, max, label) => {
    const svg = $(id); if (!svg) return;
    const n = data.length;
    svg.querySelector('polyline').setAttribute('points', data.map((v, i) => `${(i / Math.max(1, n - 1)) * 300},${70 - Math.min(1, v / max) * 66}`).join(' '));
    $(`${id}-val`).textContent = label;
  };
  const refreshControl = async () => {
    if (!$('cr-info')) return;
    const d = await api('/api/control/info');
    $('cr-info').textContent = `Version ${d.version} · Node ${d.node} · process ${d.pid} · up ${Math.round(d.uptimeSec / 60)} min · ${d.supervised ? 'auto-restart on' : 'auto-restart off'} · login ${d.requireLogin ? 'required' : 'not required'}`;
    $('cr-restart').disabled = !d.supervised;
    $('cr-update').disabled = d.update.running;
    $('cr-update').textContent = d.update.running ? '⏳ Updating…' : '⬆ Update bot';
    const log = $('cr-log');
    log.hidden = !d.update.log.length;
    log.textContent = d.update.log.join('\n');
    const { entries } = await api('/api/panel-audit');
    const tbody = $('cr-audit-body');
    tbody.replaceChildren(...entries.slice(0, 60).map((a) => {
      const tr = el('tr');
      tr.append(el('td', null, new Date(a.ts).toLocaleString()), el('td', null, a.who), el('td', null, a.action));
      return tr;
    }));
    if (!entries.length) { const tr = el('tr'); tr.append(el('td', 'muted', 'No changes logged yet.')); tbody.append(tr); }
  };
  $('cr-restart')?.addEventListener('click', () => {
    if (!confirm('Restart the bot? Any music playing will stop.')) return;
    api('/api/control/restart', {}).then(() => note('Restarting. The panel reconnects by itself.')).catch((e) => note(e.message, true));
  });
  $('cr-update')?.addEventListener('click', () => {
    if (!confirm('Update packages and yt-dlp, run the tests, then restart? Music will stop at the end. If tests fail, the old packages go back.')) return;
    api('/api/control/update', {}).then(refreshControl).catch((e) => note(e.message, true));
  });
  $('cr-backups')?.addEventListener('click', () => document.querySelector('.nav-item[data-page="backup"]')?.click());

  document.addEventListener('click', (e) => {
    const page = e.target.closest?.('.nav-item')?.dataset.page;
    if (page === 'soundboard') refreshSounds().catch((err) => note(err.message, true));
    if (page === 'control') refreshControl().catch((err) => note(err.message, true));
  });
  setInterval(() => {
    if ($('page-control') && !$('page-control').classList.contains('hidden')) refreshControl().catch(() => {});
  }, 5000);

  // ===== Live data =====
  addEventListener('maow:state', (e) => {
    const m = e.detail;
    if (m.type !== 'state') return;
    const q = (m.queues || [])[0];
    guildId = q?.guildId || null;
    const song = q?.currentSong;
    if ((song?.url || null) !== lyricUrl) {
      lyricUrl = song?.url || null;
      if (lyricUrl) api(`/api/lyrics/synced?guildId=${encodeURIComponent(q.guildId)}`).then(showLyrics).catch((err) => showLyrics({ found: false, error: err.message }));
      else showLyrics({ found: false, idle: true });
    }
    time = song?.currentTime || 0; timeAt = Date.now(); paused = !!q?.paused || !song;
    const sys = m.stats?.system; const proc = m.stats?.process;
    if (sys && proc) {
      cpu.push(sys.cpuPct || 0); ram.push(proc.rss / 1048576);
      if (cpu.length > 90) { cpu.shift(); ram.shift(); }
      drawGraph('cr-cpu', cpu, 100, `${Math.round(sys.cpuPct || 0)}%`);
      drawGraph('cr-ram', ram, Math.max(256, ...ram) * 1.2, `${Math.round(proc.rss / 1048576)} MB`);
    }
  });
})();
