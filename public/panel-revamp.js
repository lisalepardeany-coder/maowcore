// Panel revamp (v3.3): grouped accordion menu, search box, Gentle mode, quick
// actions bar, theme hover previews, profiles (headmates), reminders page,
// listen room page, phone remote + bottom tabs, health alerts + backup tidy.
// Loaded after app.js / panel-extras.js; talks to app.js via window.maowPanel.
(() => {
  const $ = (id) => document.getElementById(id);
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch { /* */ } },
    json: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = () => window.maowPanel || {};
  const toast = (title, body = '', level = 'info', ms = 2500) => (P().toast ? P().toast(title, body, level, ms) : console.log(title, body));
  const api = async (path, body) => {
    const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const fmtClock = (s) => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
  const go = (page) => document.querySelector(`.nav-item[data-page="${page}"]`)?.click();
  const palette = (window.maowPaletteExtra = window.maowPaletteExtra || []);
  const page = () => document.querySelector('.main .page:not(.hidden)')?.id?.replace('page-', '') || 'home';

  // =====================================================================
  // New page sections (menu items already exist in dashboard.html)
  // =====================================================================
  const main = document.querySelector('.main');
  const addPage = (id, title, sub, inner) => {
    if ($(`page-${id}`)) return $(`page-${id}`);
    const s = el(`<section class="page hidden" id="page-${id}"><div class="page-head"><div><h2>${title}</h2><div class="muted small">${sub}</div></div></div>${inner}</section>`);
    main?.appendChild(s);
    return s;
  };
  addPage('profiles', '🎭 Profiles', 'Separate panel setups under your account — for headmates, moods, or anything else.', `
    <div class="card"><div class="card-head"><h3>Your profiles</h3><button class="mr-btn primary" id="mr-p-new">+ New profile</button></div>
      <div class="mr-help" style="margin-bottom:10px">Each profile remembers its own theme, sounds, comfort settings, Home layout and favourite songs. Switching saves the one you're leaving first. <b>Fronting</b> is only shown here in the panel, never posted to Discord.</div>
      <div class="mr-grid" id="mr-p-list"><div class="mr-empty">Loading…</div></div></div>
    <div class="card" id="mr-p-edit" hidden><div class="card-head"><h3 id="mr-p-edit-title">New profile</h3></div>
      <form class="mr-form" id="mr-p-form" autocomplete="off">
        <input type="hidden" id="mr-p-id" />
        <label>Name<input id="mr-p-name" maxlength="40" required placeholder="e.g. Hazel" /></label>
        <label>Emoji<input id="mr-p-emoji" maxlength="8" style="width:70px" placeholder="🩶" /></label>
        <label>Pronouns<input id="mr-p-pronouns" maxlength="30" style="width:120px" placeholder="optional" /></label>
        <label>Colour<input id="mr-p-color" type="color" value="#5865f2" style="width:54px;padding:2px" /></label>
        <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="mr-p-copy" checked /> Start from my current setup</label>
        <button class="mr-btn primary" type="submit">Save</button>
        <button class="mr-btn" type="button" id="mr-p-cancel">Cancel</button>
      </form></div>
    <div class="card"><div class="card-head"><h3 id="mr-p-favs-title">♥ Favourites</h3></div><div class="mr-list" id="mr-p-favs"></div></div>`);
  addPage('reminders', '⏰ Reminders', 'One-off or repeating. They arrive as a Discord DM with Snooze buttons. You can also use /remind and /reminders.', `
    <div class="card"><div class="card-head"><h3>New reminder</h3></div>
      <form class="mr-form" id="mr-r-form" autocomplete="off">
        <label style="flex:1;min-width:200px">What<input id="mr-r-what" maxlength="500" required placeholder="Take meds 💊" /></label>
        <label>When<input id="mr-r-when" required placeholder="30min · 9:00 · tomorrow 9am" style="width:190px" /></label>
        <label>Repeat<select id="mr-r-repeat"><option value="">Once</option><option value="hourly">Every hour</option><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Every week</option></select></label>
        <button class="mr-btn primary" type="submit">Add</button>
      </form>
      <div class="mr-help" style="margin-top:8px">Quick picks: <button class="mr-btn" data-q="10min">10 min</button> <button class="mr-btn" data-q="1h">1 h</button> <button class="mr-btn" data-q="tomorrow 9:00">Tomorrow 9:00</button></div></div>
    <div class="card"><div class="card-head"><h3>Upcoming</h3><div class="mr-form"><label class="small muted" style="flex-direction:row;gap:6px"><input type="checkbox" id="mr-r-mine" /> only this profile</label><label class="small muted" id="mr-r-all-wrap" hidden style="flex-direction:row;gap:6px"><input type="checkbox" id="mr-r-all" /> everyone's</label></div></div><div class="mr-list" id="mr-r-list"></div></div>`);
  addPage('listen', '🎧 Listen room', 'A simple page friends can open to see what\'s playing and add songs.', `
    <div class="card"><div class="card-head"><h3>Share</h3></div>
      <div class="mr-linkbox"><code id="mr-l-link">${location.origin}/listen</code><button class="mr-btn" id="mr-l-copy">📋 Copy</button><a class="mr-btn" id="mr-l-open" href="/listen" target="_blank" rel="noopener">Open ↗</a></div>
      <div class="mr-help" style="margin-top:8px" id="mr-l-help"></div></div>
    <div class="card"><div class="card-head"><h3>Preview</h3></div><iframe class="mr-listen-frame" id="mr-l-frame" title="Listen room preview" loading="lazy" src="/listen?embed=1"></iframe></div>`);
  // (Link and preview are in the HTML itself: loading="lazy" keeps the preview
  // from loading until the page is opened, and nothing depends on renderListen
  // having run.)

  // =====================================================================
  // 1. Menu: accordion groups, active group, version
  // =====================================================================
  // Classic look by default; the slim layout is opt-in (Settings → Panel).
  const slim = ls.get('maow.slim') === '1';
  document.body.classList.toggle('mr-slim', slim);
  const groups = [...document.querySelectorAll('.nav-group')];
  const saveCollapsed = () => ls.set('maow.navCollapsed', JSON.stringify(groups.filter((g) => g.classList.contains('collapsed')).map((g) => g.dataset.group)));
  if (!ls.get('maow.navClassic')) {
    // The short-lived slim version collapsed most groups on first visit;
    // undo that once so the classic menu opens the way it used to.
    if (ls.get('maow.navRevamp')) { groups.forEach((g) => g.classList.remove('collapsed')); saveCollapsed(); }
    ls.set('maow.navClassic', '1');
  }
  if (slim) {
    groups.forEach((g) => g.querySelector('.nav-group-head')?.addEventListener('click', () => {
      // app.js already toggled this one; close the others (accordion).
      if (!g.classList.contains('collapsed')) groups.forEach((o) => { if (o !== g) o.classList.add('collapsed'); });
      saveCollapsed();
    }));
  }
  fetch('/api/health').then((r) => r.json()).then((h) => { const v = $('panel-version'); if (v && h.version) v.textContent = `MaowCore v${h.version}`; }).catch(() => {});

  // =====================================================================
  // 2. Top bar: search box, quick bar, profile chip, gentle badge
  // =====================================================================
  const controls = document.querySelector('.topbar-controls');
  const search = el('<button class="mr-search" id="mr-search" title="Search pages and actions (Ctrl+K)">🔍 <span>Search…</span><kbd>Ctrl K</kbd></button>');
  search.addEventListener('click', () => window.maowOpenPalette?.());
  controls?.insertBefore(search, controls.firstChild);
  const quick = el('<div id="mr-quick" role="toolbar" aria-label="Quick actions"></div>');
  document.querySelector('.topbar-spacer')?.before(quick);
  const profileChip = el('<button id="mr-profile" title="Switch profile" hidden><span class="mr-p-dot"></span><span class="mr-p-name"></span></button>');
  $('topbar-login')?.before(profileChip);

  const menu = (anchor, items) => {
    document.querySelector('.mr-menu')?.remove();
    const m = el('<div class="mr-menu" role="menu"></div>');
    for (const it of items) {
      if (it === '-') { m.appendChild(el('<hr>')); continue; }
      if (it.head) { m.appendChild(el(`<div class="mr-m-head">${esc(it.head)}</div>`)); continue; }
      const b = el(`<button role="menuitem" class="${it.on ? 'on' : ''}">${it.icon ? `<span>${esc(it.icon)}</span>` : ''}<span>${esc(it.label)}</span></button>`);
      b.addEventListener('click', () => { m.remove(); it.run(); });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = `${r.bottom + 6}px`;
    m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
    setTimeout(() => document.addEventListener('click', function close(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', close, true); } }, true), 0);
  };

  // =====================================================================
  // 3. Gentle mode
  // =====================================================================
  const gentleOn = () => document.documentElement.classList.contains('maow-gentle');
  const setGentle = (on, quiet) => {
    document.documentElement.classList.toggle('maow-gentle', on);
    ls.set('maow.gentle', on ? '1' : '0');
    try { window.maowPz?.refreshGentle?.(); } catch { /* theme engine not loaded */ }
    try { if (on) speechSynthesis?.cancel(); } catch { /* */ }
    renderQuick();
    if (!quiet) toast(on ? '🌙 Gentle mode on' : 'Gentle mode off', on ? 'No scares, flashing, sudden sounds or voices.' : 'Your normal theme settings are back.', 'info', 2500);
    document.querySelectorAll('[data-mr-gentle]').forEach((c) => { c.checked = on; });
  };
  if (ls.get('maow.gentle') === '1') setGentle(true, true);
  palette.push({ glyph: '🌙', label: 'Toggle Gentle mode', meta: 'comfort', keywords: 'calm quiet no scares flashing', action: () => setGentle(!gentleOn()) });

  // =====================================================================
  // 4. Quick actions bar
  // =====================================================================
  const q = () => P().queue?.();
  const send = (a, x) => P().send?.(a, x);
  const vol = (d) => { const qq = q(); if (!qq) return toast('Nothing playing'); send('volume', { value: Math.max(0, Math.min(150, (qq.volume || 50) + d)) }); };
  const QA = {
    toggle:   { icon: '⏯', label: 'Play / pause', run: () => { const qq = q(); if (qq) send(qq.paused ? 'resume' : 'pause'); else toast('Nothing playing'); } },
    skip:     { icon: '⏭', label: 'Skip', run: () => send('skip') },
    stop:     { icon: '⏹', label: 'Stop', run: () => send('stop') },
    shuffle:  { icon: '🔀', label: 'Shuffle', run: () => send('shuffle') },
    loop:     { icon: '🔁', label: 'Loop mode', run: () => { const qq = q(); if (qq) send('loop', { value: (qq.repeatMode + 1) % 3 }); } },
    voldown:  { icon: '🔉', label: 'Volume −10', run: () => vol(-10) },
    volup:    { icon: '🔊', label: 'Volume +10', run: () => vol(10) },
    pauseall: { icon: '🤫', label: 'Pause everything', run: () => { send('pause'); try { speechSynthesis.cancel(); } catch { /* */ } if (!gentleOn()) setGentle(true); } },
    gentle:   { icon: '🌙', label: 'Gentle mode', pressed: gentleOn, run: () => setGentle(!gentleOn()) },
    fav:      { icon: '♥', label: 'Favourite this song (profile)', run: () => favCurrent() },
    ambience: { icon: '🌫', label: 'Theme sound in voice', run: () => playAmbience() },
    remind:   { icon: '⏰', label: 'Reminders', run: () => go('reminders') },
    search:   { icon: '🔍', label: 'Search', run: () => window.maowOpenPalette?.() },
  };
  const DEFAULT_QUICK = ['toggle', 'skip', 'voldown', 'volup', 'gentle'];
  const quickIds = () => ls.json('maow.quick', DEFAULT_QUICK).filter((k) => QA[k]).slice(0, 6);
  function renderQuick() {
    if (!quick) return;
    quick.innerHTML = '';
    for (const k of quickIds()) {
      const a = QA[k];
      const b = el(`<button title="${esc(a.label)}" aria-label="${esc(a.label)}" ${a.pressed ? `aria-pressed="${a.pressed()}"` : ''}>${a.icon}</button>`);
      b.addEventListener('click', a.run);
      quick.appendChild(b);
    }
    const edit = el('<button class="mr-q-edit" title="Choose quick actions" aria-label="Choose quick actions">⋯</button>');
    edit.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = quickIds();
      menu(edit, [{ head: 'Quick bar (up to 6)' }, ...Object.entries(QA).map(([k, a]) => ({
        icon: cur.includes(k) ? '✓' : ' ', label: a.label, on: cur.includes(k),
        run: () => {
          let next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
          if (next.length > 6) { toast('Up to 6', 'Remove one first.'); next = cur; }
          ls.set('maow.quick', JSON.stringify(next)); renderQuick();
        },
      })), '-', { icon: '↺', label: 'Reset to default', run: () => { ls.del('maow.quick'); renderQuick(); } }]);
    });
    quick.appendChild(edit);
  }
  renderQuick();
  Object.entries(QA).forEach(([k, a]) => { if (!['search', 'gentle'].includes(k)) palette.push({ glyph: a.icon, label: a.label, meta: 'quick', action: a.run }); });

  // =====================================================================
  // 5. Theme hover previews (Settings theme cards)
  // =====================================================================
  let previewTimer = null; let previewFrom = null;
  const badge = () => $('mr-preview-badge') || document.body.appendChild(el('<div id="mr-preview-badge" hidden></div>'));
  const endPreview = () => {
    clearTimeout(previewTimer);
    if (previewFrom) { document.body.setAttribute('data-theme', previewFrom); previewFrom = null; }
    badge().hidden = true;
  };
  document.addEventListener('mouseover', (e) => {
    const sw = e.target.closest?.('.theme-swatch');
    if (!sw || sw.dataset.theme === (previewFrom || document.body.dataset.theme)) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (!previewFrom) previewFrom = document.body.dataset.theme;
      document.body.setAttribute('data-theme', sw.dataset.theme);
      const b = badge();
      b.textContent = `👁 Previewing ${sw.querySelector('.swatch-label')?.textContent || sw.dataset.theme} — click to keep`;
      b.hidden = false;
    }, 450);
  });
  document.addEventListener('mouseout', (e) => {
    const sw = e.target.closest?.('.theme-swatch');
    if (sw && !sw.contains(e.relatedTarget)) endPreview();
  });
  document.addEventListener('click', (e) => { if (e.target.closest?.('.theme-swatch')) { previewFrom = null; clearTimeout(previewTimer); badge().hidden = true; } }, true);
  // Every theme is searchable in Ctrl+K.
  setTimeout(() => {
    const pack = window.maowThemePack;
    (pack?.catalog || []).forEach((t) => palette.push({
      glyph: '🎨', label: `Theme: ${t.name || t.label || t.id}`, meta: 'theme', keywords: `${t.id} ${t.cat || ''}`,
      action: () => window.maowApplyTheme?.(t.id),
    }));
  }, 500);

  // =====================================================================
  // 6. Voice ambience for the current theme
  // =====================================================================
  async function playAmbience() {
    const id = document.body.dataset.theme;
    const pack = window.maowThemePack;
    const cat = pack?.get?.(id)?.cat || (pack?.catalog || []).find((t) => t.id === id)?.cat || '';
    try {
      const r = await api('/api/ambience/play', { theme: id, category: cat, guildId: P().guildId?.() });
      toast('🌫 Ambience playing', `${r.label} in ${r.channel}. Stop it with /ambience stop or ⏹.`, 'success', 4000);
    } catch (err) { toast('▲ Ambience', err.message, 'error', 4500); }
  }

  // =====================================================================
  // 7. Profiles
  // =====================================================================
  const SKIP_KEY = /session|instance|token|^maow\.profile\.|^maow\.navRevamp$/i;
  const snapshot = () => {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('maow.') && !SKIP_KEY.test(k)) out[k] = localStorage.getItem(k);
      }
    } catch { /* */ }
    return out;
  };
  const restore = (prefs) => {
    const keep = {};
    try {
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('maow.') && SKIP_KEY.test(k)) keep[k] = localStorage.getItem(k); }
      const drop = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('maow.') && !SKIP_KEY.test(k)) drop.push(k); }
      drop.forEach((k) => localStorage.removeItem(k));
      Object.entries(prefs || {}).forEach(([k, v]) => { if (k.startsWith('maow.') && !SKIP_KEY.test(k)) localStorage.setItem(k, v); });
      Object.entries(keep).forEach(([k, v]) => localStorage.setItem(k, v));
    } catch { /* */ }
  };
  let profiles = []; let profilesLoaded = false;
  const activeId = () => ls.get('maow.profile.active');
  const active = () => profiles.find((p) => p.id === activeId()) || null;
  const loadProfiles = async () => {
    try { const d = await api('/api/profiles'); profiles = d.profiles || []; profilesLoaded = true; } catch { profiles = []; }
    if (activeId() && !active()) ls.del('maow.profile.active');
    renderChip();
    return profiles;
  };
  const saveActive = async () => {
    const a = active();
    if (a) await api('/api/profiles/save', { ...a, prefs: snapshot() }).catch(() => {});
  };
  const switchTo = async (id) => {
    const target = profiles.find((p) => p.id === id);
    if (!target) return;
    await saveActive();
    restore(target.prefs);
    ls.set('maow.profile.active', id);
    toast(`${target.emoji || '🎭'} ${target.name}`, 'Switching…', 'info', 1200);
    setTimeout(() => location.reload(), 300);
  };
  const setFront = async (id) => {
    try { await api('/api/profiles/front', { id }); await loadProfiles(); renderProfiles(); } catch (e) { toast('▲ Profiles', e.message, 'error'); }
  };
  function renderChip() {
    const a = active();
    profileChip.hidden = !profiles.length;
    if (!profiles.length) return;
    profileChip.classList.toggle('fronting', !!a?.fronting);
    profileChip.querySelector('.mr-p-dot').textContent = a?.emoji || '🎭';
    profileChip.querySelector('.mr-p-dot').style.background = a?.color ? `${a.color}55` : 'var(--accent-soft)';
    profileChip.querySelector('.mr-p-name').textContent = a ? a.name : 'No profile';
    profileChip.title = a ? `${a.name}${a.pronouns ? ` (${a.pronouns})` : ''}${a.fronting ? ' · fronting' : ''} — click to switch` : 'Pick a profile';
  }
  profileChip.addEventListener('click', (e) => {
    e.stopPropagation();
    const a = active();
    menu(profileChip, [{ head: 'Switch profile' }, ...profiles.map((p) => ({
      icon: p.emoji || '🎭', label: `${p.name}${p.fronting ? '  · front' : ''}`, on: p.id === a?.id, run: () => (p.id === a?.id ? null : switchTo(p.id)),
    })), '-', ...(a ? [{ icon: a.fronting ? '◌' : '★', label: a.fronting ? 'Not fronting' : `Mark ${a.name} as fronting`, run: () => setFront(a.fronting ? null : a.id) }] : []),
    { icon: '⚙', label: 'Manage profiles', run: () => go('profiles') }]);
  });
  function renderProfiles() {
    const list = $('mr-p-list');
    if (!list) return;
    const a = active();
    list.innerHTML = profiles.length ? '' : '<div class="mr-empty">No profiles yet. Make one for each headmate (or mood) — each keeps its own theme and settings.</div>';
    for (const p of profiles) {
      const card = el(`<div class="mr-pcard ${p.id === a?.id ? 'active' : ''}">
        <div class="mr-p-head"><div class="mr-p-avatar" style="background:${esc(p.color || '#5865f2')}44">${esc(p.emoji || '🎭')}</div>
          <div class="mr-grow"><b>${esc(p.name)}</b>${p.pronouns ? ` <span class="muted small">(${esc(p.pronouns)})</span>` : ''}
          <div>${p.id === a?.id ? '<span class="mr-tag">active here</span> ' : ''}${p.fronting ? '<span class="mr-tag">★ fronting</span>' : ''}</div></div></div>
        <div class="muted small">${(p.favorites || []).length} favourite${(p.favorites || []).length === 1 ? '' : 's'} · theme: ${esc(p.prefs?.['maow.theme'] || 'default')}</div>
        <div class="mr-p-actions">
          ${p.id === a?.id ? '' : '<button class="mr-btn primary" data-a="switch">Switch</button>'}
          <button class="mr-btn" data-a="front">${p.fronting ? 'Not fronting' : '★ Fronting'}</button>
          <button class="mr-btn" data-a="edit">Edit</button>
          <button class="mr-btn danger" data-a="del">Delete</button></div></div>`);
      card.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
        const act = b.dataset.a;
        if (act === 'switch') switchTo(p.id);
        if (act === 'front') setFront(p.fronting ? null : p.id);
        if (act === 'edit') openEdit(p);
        if (act === 'del') {
          if (!confirm(`Delete the profile "${p.name}"? Its saved settings and favourites go too.`)) return;
          try { await api('/api/profiles/delete', { id: p.id }); if (activeId() === p.id) ls.del('maow.profile.active'); await loadProfiles(); renderProfiles(); } catch (e) { toast('▲', e.message, 'error'); }
        }
      }));
      list.appendChild(card);
    }
    renderFavs();
  }
  function renderFavs() {
    const box = $('mr-p-favs');
    if (!box) return;
    const a = active();
    $('mr-p-favs-title').textContent = a ? `♥ ${a.name}'s favourites` : '♥ Favourites';
    if (!a) { box.innerHTML = '<div class="mr-empty">Switch to a profile to keep favourite songs for it. Add the playing song with the ♥ quick action.</div>'; return; }
    const favs = a.favorites || [];
    box.innerHTML = favs.length ? '' : '<div class="mr-empty">No favourites yet. While a song plays, press ♥ in the quick bar (add it via ⋯ if it\'s not there).</div>';
    favs.forEach((f, i) => {
      const row = el(`<div class="mr-row"><div class="mr-grow">${esc(f.name)}<div class="mr-sub">${esc(f.url)}</div></div>
        <button class="mr-btn" data-a="play">▶ Play</button><button class="mr-btn danger" data-a="rm">✕</button></div>`);
      row.querySelector('[data-a="play"]').addEventListener('click', () => { send('play', { query: f.url }); toast('▶ Queued', f.name, 'success'); });
      row.querySelector('[data-a="rm"]').addEventListener('click', async () => {
        a.favorites = favs.filter((_, j) => j !== i);
        await api('/api/profiles/save', { ...a, prefs: snapshot() }).catch((e) => toast('▲', e.message, 'error'));
        renderFavs();
      });
      box.appendChild(row);
    });
  }
  async function favCurrent() {
    const song = q()?.currentSong;
    if (!song) return toast('Nothing playing');
    if (!profilesLoaded) await loadProfiles();
    const a = active();
    if (!a) { toast('Pick a profile first', 'Favourites are kept per profile.', 'info', 3000); return go('profiles'); }
    if ((a.favorites || []).some((f) => f.url === song.url)) return toast('♥ Already a favourite', song.name);
    a.favorites = [...(a.favorites || []), { name: song.name, url: song.url }];
    try { await api('/api/profiles/save', { ...a, prefs: snapshot() }); toast(`♥ Saved for ${a.name}`, song.name, 'success'); renderFavs(); }
    catch (e) { toast('▲', e.message, 'error'); }
  }
  const openEdit = (p) => {
    $('mr-p-edit').hidden = false;
    $('mr-p-edit-title').textContent = p ? `Edit ${p.name}` : 'New profile';
    $('mr-p-id').value = p?.id || '';
    $('mr-p-name').value = p?.name || '';
    $('mr-p-emoji').value = p?.emoji || '';
    $('mr-p-pronouns').value = p?.pronouns || '';
    $('mr-p-color').value = p?.color || '#5865f2';
    $('mr-p-copy').parentElement.hidden = !!p;
    $('mr-p-name').focus();
  };
  $('mr-p-new')?.addEventListener('click', () => openEdit(null));
  $('mr-p-cancel')?.addEventListener('click', () => { $('mr-p-edit').hidden = true; });
  $('mr-p-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('mr-p-id').value || undefined;
    const existing = profiles.find((p) => p.id === id);
    try {
      const r = await api('/api/profiles/save', {
        id, name: $('mr-p-name').value, emoji: $('mr-p-emoji').value, pronouns: $('mr-p-pronouns').value, color: $('mr-p-color').value,
        prefs: existing ? (existing.id === activeId() ? snapshot() : existing.prefs) : ($('mr-p-copy').checked ? snapshot() : {}),
        favorites: existing?.favorites,
      });
      $('mr-p-edit').hidden = true;
      if (!activeId() && !existing) ls.set('maow.profile.active', r.profile.id);
      await loadProfiles(); renderProfiles();
      toast('✓ Saved', r.profile.name, 'success');
    } catch (err) { toast('▲ Could not save', err.message, 'error', 4000); }
  });
  // Keep the active profile's saved settings fresh (theme changes etc.).
  // (sendBeacon can't carry the sign-in header, so this saves on a timer and
  // whenever the tab is hidden instead.)
  setInterval(() => { if (active() && !document.hidden) saveActive(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && active()) saveActive(); });
  palette.push({ glyph: '🎭', label: 'Switch profile…', meta: 'profiles', keywords: 'headmate front alter', action: () => (profiles.length ? profileChip.click() : go('profiles')) });

  // =====================================================================
  // 8. Reminders page
  // =====================================================================
  const REPEAT = { hourly: 'every hour', daily: 'every day', weekdays: 'weekdays', weekly: 'every week' };
  async function renderReminders() {
    const box = $('mr-r-list');
    if (!box) return;
    try {
      const d = await api(`/api/reminders${$('mr-r-all')?.checked ? '?all=1' : ''}`);
      const onlyMine = $('mr-r-mine')?.checked && ls.get('maow.profile.active');
      const shown = onlyMine ? d.reminders.filter((r) => r.profile?.id === ls.get('maow.profile.active')) : d.reminders;
      window.__mrReminders = d.reminders;
      window.dispatchEvent(new CustomEvent('mr:reminders', { detail: d.reminders }));
      box.innerHTML = shown.length ? '' : '<div class="mr-empty">Nothing coming up.</div>';
      for (const r of shown) {
        const who = r.profile ? `<span class="mr-tag">${esc(r.profile.emoji || '🎭')} ${esc(r.profile.name)}</span> ` : '';
        const row = el(`<div class="mr-row"><div class="mr-grow">${who}${esc(r.what)}<div class="mr-sub">${new Date(r.fireAt).toLocaleString()}${r.repeat ? ` · 🔁 ${REPEAT[r.repeat]}` : ''}${d.all ? ` · ${esc(r.userName)}` : ''}${r.channelId ? ' · in a channel' : ' · DM'}</div></div><button class="mr-btn danger">Cancel</button></div>`);
        row.querySelector('button').addEventListener('click', async () => { await api('/api/reminders/cancel', { id: r.id }).catch((e) => toast('▲', e.message, 'error')); renderReminders(); });
        box.appendChild(row);
      }
    } catch (e) { box.innerHTML = `<div class="mr-empty">${esc(e.message)}</div>`; }
  }
  $('mr-r-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/reminders/add', { what: $('mr-r-what').value, when: $('mr-r-when').value, repeat: $('mr-r-repeat').value || null, profileId: ls.get('maow.profile.active') || null });
      toast('⏰ Reminder set', new Date(r.reminder.fireAt).toLocaleString(), 'success');
      $('mr-r-what').value = ''; $('mr-r-when').value = '';
      renderReminders();
    } catch (err) { toast('▲ Reminder', err.message, 'error', 4000); }
  });
  document.querySelectorAll('#page-reminders [data-q]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); $('mr-r-when').value = b.dataset.q; $('mr-r-what').focus(); }));
  $('mr-r-all')?.addEventListener('change', renderReminders);
  $('mr-r-mine')?.addEventListener('change', renderReminders);
  window.maowRenderReminders = renderReminders;

  // =====================================================================
  // 9. Listen room page
  // =====================================================================
  function renderListen() {
    const link = `${location.origin}/listen`;
    $('mr-l-link').textContent = link;
    $('mr-l-open').href = link;
    const local = /^(127\.|localhost|\[::1\])/.test(location.hostname);
    $('mr-l-help').innerHTML = `Friends sign in with Discord and land here as <b>guests</b>: they can see the queue and add songs (one every 15 s), nothing else.`
      + (local ? '<br>⚠ Right now the panel only runs on this PC (127.0.0.1), so friends can\'t reach the link yet. It works on your own devices, or once the panel is put online (for example with a Cloudflare tunnel — ask me and I\'ll set it up).' : '');
    const f = $('mr-l-frame');
    if (f && !f.src) f.src = '/listen?embed=1';
  }
  $('mr-l-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText($('mr-l-link').textContent); toast('📋 Copied', ''); } catch { toast('▲ Copy failed', '', 'error'); } });

  // =====================================================================
  // 10. Settings, Control room & Backup additions
  // =====================================================================
  const settings = $('page-settings');
  if (settings) {
    const card = el(`<div class="card" id="mr-settings-panel"><div class="card-head"><h3>Panel</h3><span class="mr-gentle-badge">🌙 gentle</span></div>
      <div class="mr-form">
        <label style="flex-direction:row;align-items:center;gap:8px;font-size:13px;color:var(--fg)"><input type="checkbox" data-mr-gentle /> 🌙 Gentle mode <span class="muted small">— no scares, flashing, sudden sounds or voices (for bad days)</span></label>
      </div>
      <div class="mr-form" style="margin-top:8px">
        <label style="flex-direction:row;align-items:center;gap:8px;font-size:13px;color:var(--fg)"><input type="checkbox" id="mr-slim-toggle" /> Slim layout <span class="muted small">— smaller menu and cards, quick bar and search box in the top bar</span></label>
      </div>
      <div class="mr-form" style="margin-top:10px" id="mr-lang-slot" hidden><label>Language</label></div>
      <div class="mr-form" style="margin-top:10px"><button class="mr-btn" id="mr-amb-btn">🌫 Play this theme's sound in voice</button><button class="mr-btn" id="mr-amb-stop">⏹ Stop ambience</button></div></div>`);
    settings.querySelector('.page-head')?.after(card);
    // Slim layout moves the language picker out of the top bar into here.
    const lang = $('dash-lang');
    if (lang && slim) { lang.style.maxWidth = '120px'; card.querySelector('#mr-lang-slot').hidden = false; card.querySelector('#mr-lang-slot label').appendChild(lang); }
    const slimBox = card.querySelector('#mr-slim-toggle');
    slimBox.checked = slim;
    slimBox.addEventListener('change', () => { ls.set('maow.slim', slimBox.checked ? '1' : '0'); location.reload(); });
    card.querySelector('[data-mr-gentle]').checked = gentleOn();
    card.querySelector('[data-mr-gentle]').addEventListener('change', (e) => setGentle(e.target.checked));
    $('mr-amb-btn').addEventListener('click', playAmbience);
    $('mr-amb-stop').addEventListener('click', () => api('/api/ambience/stop', { guildId: P().guildId?.() }).then(() => toast('⏹ Ambience stopped')).catch((e) => toast('▲', e.message, 'error')));
  }
  const control = $('page-control');
  if (control) {
    const card = el(`<div class="card" id="mr-health"><div class="card-head"><h3>🩺 Health alerts</h3><span class="muted small" id="mr-h-state"></span></div>
      <div class="mr-help">I DM you when the bot crashes, music keeps failing, or Discord is unreachable for 2+ minutes. At most one message per problem every 30 minutes.</div>
      <div class="mr-form" style="margin-top:10px"><button class="mr-btn" id="mr-h-toggle"></button><button class="mr-btn" id="mr-h-test">Send a test DM</button></div>
      <div class="mr-list" id="mr-h-recent" style="margin-top:10px"></div></div>`);
    control.querySelector('.page-head')?.after(card);
    const renderHealth = async () => {
      try {
        const d = await api('/api/health-alerts');
        $('mr-h-state').textContent = d.enabled ? 'on' : 'off';
        $('mr-h-toggle').textContent = d.enabled ? 'Turn off' : 'Turn on';
        $('mr-h-toggle').onclick = async () => { await api('/api/health-alerts/set', { on: !d.enabled }).catch((e) => toast('▲', e.message, 'error')); renderHealth(); };
        $('mr-h-recent').innerHTML = d.recent.length ? d.recent.slice(0, 8).map((a) => `<div class="mr-row"><div class="mr-grow">${esc(a.title)}<div class="mr-sub">${new Date(a.ts).toLocaleString()}</div></div></div>`).join('') : '<div class="mr-empty">No problems since the bot started. 🎉</div>';
      } catch (e) { $('mr-h-state').textContent = e.message; }
    };
    $('mr-h-test').addEventListener('click', async () => { try { const r = await api('/api/health-alerts/test', {}); toast(r.ok ? '✓ Sent — check your DMs' : '▲ Not sent', r.error || '', r.ok ? 'success' : 'error', 4000); } catch (e) { toast('▲', e.message, 'error'); } });
    // YouTube cookies: fixes "Sign in to confirm you're not a bot".
    const yt = el(`<div class="card" id="mr-ytc"><div class="card-head"><h3>🍪 YouTube cookies</h3><span class="muted small" id="mr-ytc-state"></span></div>
      <div class="mr-help">If music fails with <b>"Sign in to confirm you're not a bot"</b>, give the bot YouTube cookies from your browser.
        <ol style="margin:6px 0 0;padding-left:20px">
          <li>Best: use a <b>spare Google account</b> — YouTube can flag accounts used by bots.</li>
          <li>Sign in on youtube.com, then export cookies with a browser extension like <i>"Get cookies.txt LOCALLY"</i> (Netscape format).</li>
          <li>Pick that file below. Only YouTube/Google cookies are kept; they stay in the bot's <code>data</code> folder and are never shown here.</li>
        </ol></div>
      <div class="mr-form" style="margin-top:10px">
        <label class="mr-btn" style="flex-direction:row;cursor:pointer">📄 Choose cookies.txt<input type="file" id="mr-ytc-file" accept=".txt,text/plain" hidden /></label>
        <button class="mr-btn" id="mr-ytc-test">Test YouTube</button>
        <button class="mr-btn danger" id="mr-ytc-del" hidden>Remove cookies</button></div>
      <div class="mr-help" id="mr-ytc-msg" style="margin-top:8px"></div></div>`);
    card.after(yt);
    const ytMsg = (t, bad) => { const m = $('mr-ytc-msg'); m.innerHTML = t; m.style.color = bad ? '#f87171' : ''; };
    const renderYt = async () => {
      try {
        const d = await api('/api/youtube-cookies');
        $('mr-ytc-state').textContent = d.present ? (d.valid ? `on · ${d.count} cookies${d.signedIn ? ' · signed in' : ' · not signed in'} · ${new Date(d.updatedAt).toLocaleDateString()}` : 'needs new cookies') : 'off';
        $('mr-ytc-del').hidden = !d.present;
        if (d.present && !d.valid) ytMsg(`▲ ${esc(d.problem)}`, true);
      } catch (e) { $('mr-ytc-state').textContent = e.message; }
    };
    $('mr-ytc-file').addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 512 * 1024) return ytMsg('▲ That file is too big for a cookies.txt.', true);
      try {
        const r = await api('/api/youtube-cookies/save', { text: await f.text() });
        ytMsg(`✓ Saved ${r.count} cookies${r.signedIn ? ' (signed in)' : ' — <b>not signed in</b>, so they may not get past the bot check'}. Playback uses them right away.`
          + (r.supervised ? ' <button class="mr-btn" id="mr-ytc-restart">Restart bot now</button> so search uses them too.' : ' Restart the bot so search uses them too.'));
        $('mr-ytc-restart')?.addEventListener('click', async () => {
          if (!confirm('Restart the bot now? Music stops for a few seconds.')) return;
          await api('/api/control/restart', {}).catch(() => {});
          ytMsg('↻ Restarting… refresh the page in ~15 seconds.');
        });
        renderYt();
      } catch (err) { ytMsg(`▲ ${esc(err.message)}`, true); }
    });
    $('mr-ytc-test').addEventListener('click', async () => {
      ytMsg('Asking YouTube…');
      try {
        const r = await api('/api/youtube-cookies/test', {});
        ytMsg(r.ok ? `✓ YouTube works${r.usedCookies ? ' (with your cookies)' : ' (no cookies needed right now)'}: “${esc(r.title)}”`
          : `▲ ${esc(r.error)}${r.botCheck && !r.usedCookies ? ' Upload cookies above to fix it.' : r.botCheck ? ' Try exporting fresh cookies (sign in first).' : ''}`, !r.ok);
      } catch (e) { ytMsg(`▲ ${esc(e.message)}`, true); }
    });
    $('mr-ytc-del').addEventListener('click', async () => {
      if (!confirm('Remove the YouTube cookies from the bot?')) return;
      await api('/api/youtube-cookies/remove', {}).catch(() => {});
      ytMsg('Removed.'); renderYt();
    });
    control.__mrRender = () => { renderHealth(); renderYt(); };
  }
  const backup = $('page-backup');
  if (backup) {
    const card = el(`<div class="card"><div class="card-head"><h3>🧹 Backup cleanup</h3></div>
      <div class="mr-help">Runs by itself every day: the newest 5 backups stay as they are, older ones are compressed, and anything past 14 backups or 30 days old is removed.</div>
      <div class="mr-form" style="margin-top:10px"><button class="mr-btn" id="mr-tidy">Clean up now</button></div></div>`);
    backup.querySelector('.page-head')?.after(card);
    $('mr-tidy').addEventListener('click', async () => {
      try { const r = await api('/api/backup/tidy', {}); toast('🧹 Done', `${r.compressed} compressed, ${r.deleted} removed, ${(r.savedBytes / 1048576).toFixed(1)} MB freed`, 'success', 4000); }
      catch (e) { toast('▲', e.message, 'error'); }
    });
  }

  // =====================================================================
  // 11. Phone: bottom tabs + big remote on Home
  // =====================================================================
  const tabs = el(`<nav id="mr-tabs" aria-label="Main">
    <button data-t="home"><span>⌂</span>Home</button><button data-t="search"><span>🔍</span>Search</button>
    <button data-t="listen"><span>🎧</span>Listen</button><button data-t="reminders"><span>⏰</span>Remind</button><button data-t="menu"><span>☰</span>Menu</button></nav>`);
  document.body.appendChild(tabs);
  tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.t;
    if (t === 'menu') return document.body.classList.toggle('mr-nav-open');
    document.body.classList.remove('mr-nav-open');
    if (t === 'search') return window.maowOpenPalette?.();
    go(t);
  }));
  document.addEventListener('click', (e) => {
    if (e.target.closest('.sidebar .nav-item')) document.body.classList.remove('mr-nav-open');
    else if (document.body.classList.contains('mr-nav-open') && !e.target.closest('.sidebar, #mr-tabs, #sidebar-toggle')) document.body.classList.remove('mr-nav-open');
  });
  $('sidebar-toggle')?.addEventListener('click', (e) => {
    if (window.matchMedia('(max-width: 768px)').matches) { e.stopImmediatePropagation(); document.body.classList.toggle('mr-nav-open'); }
  }, true);

  const remote = el(`<div id="mr-remote" aria-label="Remote">
    <img class="rm-art" alt="" /><div class="rm-title">Nothing playing</div><div class="rm-sub">Start music with /play in Discord</div>
    <div class="rm-bar"><i></i></div>
    <div class="rm-btns"><button data-r="loop" aria-label="Loop">🔁</button><button data-r="toggle" class="big" aria-label="Play or pause">⏯</button><button data-r="skip" aria-label="Skip">⏭</button><button data-r="stop" aria-label="Stop">⏹</button></div>
    <div class="rm-vol"><span>🔈</span><input type="range" min="0" max="150" aria-label="Volume" /><span class="rm-vol-n">—</span></div>
    <form class="rm-play"><input placeholder="Play a song or paste a link" aria-label="Play a song" autocomplete="off" /><button aria-label="Play">▶</button></form>
    <div class="rm-next"></div></div>`);
  $('page-home')?.prepend(remote);
  remote.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => QA[b.dataset.r].run()));
  remote.querySelector('.rm-play').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const query = input.value.trim();
    if (!query) return;
    send('play', { query });
    toast('▶ Sent', query, 'success', 1800);
    input.value = '';
  });
  let volDrag = false; let volT = null;
  const volInput = remote.querySelector('input');
  volInput.addEventListener('input', () => {
    volDrag = true; remote.querySelector('.rm-vol-n').textContent = volInput.value;
    clearTimeout(volT); volT = setTimeout(() => { send('volume', { value: Number(volInput.value) }); volDrag = false; }, 250);
  });
  const renderRemote = () => {
    const qq = q();
    const s = qq?.currentSong;
    const art = remote.querySelector('.rm-art');
    if (s?.thumbnail) { art.src = s.thumbnail; art.style.display = ''; } else art.style.display = 'none';
    remote.querySelector('.rm-title').textContent = s ? s.name : 'Nothing playing';
    remote.querySelector('.rm-sub').textContent = s ? `${fmtClock(s.currentTime)} / ${s.formattedDuration || fmtClock(s.duration)} · ${s.user || ''}` : 'Start music with /play in Discord';
    remote.querySelector('.rm-bar i').style.width = s?.duration ? `${Math.min(100, (s.currentTime / s.duration) * 100)}%` : '0';
    remote.querySelector('[data-r="toggle"]').textContent = qq?.paused ? '▶' : '⏸';
    if (!volDrag && qq) { volInput.value = qq.volume; remote.querySelector('.rm-vol-n').textContent = qq.volume; }
    remote.querySelector('.rm-next').innerHTML = (qq?.upcoming || []).slice(0, 5).map((u, i) => `<div>${i === 0 ? 'Up next · ' : ''}${esc(u.name)}</div>`).join('');
  };
  window.addEventListener('maow:state', () => { if (window.matchMedia('(max-width: 768px)').matches && page() === 'home') renderRemote(); });

  // =====================================================================
  // Page changes: highlight group, render new pages
  // =====================================================================
  let lastPage = null;
  const onPage = () => {
    const p = page();
    if (p === lastPage) return;
    lastPage = p;
    document.body.dataset.mrPage = p;
    groups.forEach((g) => g.classList.toggle('has-active', !!g.querySelector(`.nav-item[data-page="${p}"]`)));
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === p));
    if (p === 'profiles') loadProfiles().then(renderProfiles);
    if (p === 'reminders') {
      renderReminders();
      fetch('/api/auth/me').then((r) => r.json()).then((m) => { $('mr-r-all-wrap').hidden = !['owner', 'admin'].includes(m.rank) && m.requireLogin; }).catch(() => {});
    }
    if (p === 'listen') renderListen();
    if (p === 'control') $('page-control')?.__mrRender?.();
    if (p === 'home') renderRemote();
  };
  if (main) new MutationObserver(onPage).observe(main, { attributes: true, subtree: true, attributeFilter: ['class'] });
  onPage();
  loadProfiles();
})();
