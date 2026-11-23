// Panel additions from the questionnaire (v3.4): song-change pop-ups, light /
// dark switch, jumpscare frequency, quiet hours + scheduled Gentle mode,
// status posts channel. Loaded after panel-revamp.js.
(() => {
  const $ = (id) => document.getElementById(id);
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const P = () => window.maowPanel || {};
  const toast = (title, body = '', level = 'info', ms = 2500) => P().toast?.(title, body, level, ms);
  const api = async (path, body) => {
    const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };
  const palette = (window.maowPaletteExtra = window.maowPaletteExtra || []);
  let quiet = { enabled: false };
  let quietNow = false;

  // ===== Quiet hours (server keeps them; the panel follows) =====
  const loadQuiet = async () => {
    try { const d = await api('/api/owner-prefs'); quiet = d.quiet; quietNow = d.quietNow; } catch { /* signed out / older bot */ }
    applyQuietGentle();
  };
  // Gentle mode switches itself on during quiet hours (if chosen) and back
  // off afterwards — but only if it was the schedule that turned it on.
  const applyQuietGentle = () => {
    const html = document.documentElement;
    const want = quietNow && quiet.gentle;
    if (want && !html.classList.contains('maow-gentle')) {
      html.classList.add('maow-gentle'); ls.set('maow.gentle.bySchedule', '1');
      try { window.maowPz?.refreshGentle?.(); } catch { /* */ }
    } else if (!want && ls.get('maow.gentle.bySchedule') === '1') {
      ls.set('maow.gentle.bySchedule', '0');
      if (ls.get('maow.gentle') !== '1') { html.classList.remove('maow-gentle'); try { window.maowPz?.refreshGentle?.(); } catch { /* */ } }
    }
  };
  setInterval(loadQuiet, 60000);
  loadQuiet();

  // ===== Song-change pop-ups =====
  const lastSong = new Map();
  let first = true;
  addEventListener('maow:state', (e) => {
    const qs = e.detail?.queues;
    if (!Array.isArray(qs)) return;
    for (const q of qs) {
      const url = q.currentSong?.url || null;
      const prev = lastSong.get(q.guildId);
      lastSong.set(q.guildId, url);
      if (first || !url || url === prev) continue;
      if (ls.get('maow.songToasts') === '0' || quietNow) continue;
      toast(`♫ Now playing`, `${q.currentSong.name}${q.currentSong.user ? ` · ${q.currentSong.user}` : ''}`, 'info', 4000);
    }
    first = false;
  });

  // ===== Light / dark switch =====
  const isLight = (id) => {
    const t = window.maowThemePack?.get?.(id);
    if (t) return !!t.light;
    return false;   // built-in themes are dark
  };
  const lightDefault = () => {
    const cat = window.maowThemePack?.catalog || [];
    return ['paper', 'daylight', 'pastelcloud', 'dollhouse', 'fogtown'].find((id) => cat.some((t) => t.id === id) && isLight(id))
      || cat.find((t) => isLight(t.id))?.id || 'discord';
  };
  const toggleLight = () => {
    const cur = document.body.dataset.theme;
    if (isLight(cur)) {
      ls.set('maow.theme.light', cur);
      window.maowApplyTheme?.(ls.get('maow.theme.dark') || 'discord');
    } else {
      ls.set('maow.theme.dark', cur);
      window.maowApplyTheme?.(ls.get('maow.theme.light') || lightDefault());
    }
    paintLightBtn();
  };
  const lightBtn = el('<button class="icon-btn" id="mp-light" title="Light / dark" aria-label="Switch light / dark">🌗</button>');
  const paintLightBtn = () => { lightBtn.textContent = isLight(document.body.dataset.theme) ? '🌙' : '☀️'; lightBtn.title = isLight(document.body.dataset.theme) ? 'Switch to dark' : 'Switch to light'; };
  lightBtn.addEventListener('click', toggleLight);
  $('palette-trigger')?.before(lightBtn);
  new MutationObserver(paintLightBtn).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  setTimeout(paintLightBtn, 300);
  palette.push({ glyph: '🌗', label: 'Switch light / dark', meta: 'view', keywords: 'theme day night', action: toggleLight });

  // ===== Settings → Panel card additions =====
  const addSettings = () => {
    const card = $('mr-settings-panel');
    if (!card || $('mp-settings')) return;
    const box = el(`<div id="mp-settings">
      <div class="mr-form" style="margin-top:10px">
        <label style="flex-direction:row;align-items:center;gap:8px;font-size:13px;color:var(--fg)"><input type="checkbox" id="mp-toasts" /> ♫ Pop-up when the song changes</label>
      </div>
      <div class="mr-form" style="margin-top:10px">
        <label>Jumpscares (horror themes, when Scares are on)
          <select id="mp-freq"><option value="rare">Rare</option><option value="normal">Normal</option><option value="often">Often</option></select></label>
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft,var(--border))">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px">🌙 Quiet hours <span class="muted small" id="mp-quiet-now"></span></div>
        <div class="mr-form">
          <label style="flex-direction:row;align-items:center;gap:8px;color:var(--fg)"><input type="checkbox" id="mp-q-on" /> On</label>
          <label>From<input type="time" id="mp-q-start" /></label>
          <label>Until<input type="time" id="mp-q-end" /></label>
        </div>
        <div class="mr-form" style="margin-top:8px">
          <label style="flex-direction:row;align-items:center;gap:8px;color:var(--fg)"><input type="checkbox" id="mp-q-hold" /> Hold bot DMs until it's over (one summary after)</label>
          <label style="flex-direction:row;align-items:center;gap:8px;color:var(--fg)"><input type="checkbox" id="mp-q-gentle" /> Gentle mode on during quiet hours</label>
        </div>
        <div class="muted small" style="margin-top:6px">Reminders still arrive during quiet hours. Song pop-ups pause.</div>
      </div></div>`);
    card.appendChild(box);
    $('mp-toasts').checked = ls.get('maow.songToasts') !== '0';
    $('mp-toasts').addEventListener('change', (e) => ls.set('maow.songToasts', e.target.checked ? '1' : '0'));
    $('mp-freq').value = ls.get('maow.pz.freq') || 'often';
    $('mp-freq').addEventListener('change', (e) => { ls.set('maow.pz.freq', e.target.value); toast('Jumpscares', `Set to ${e.target.value}.`); });
    const paintQuiet = () => {
      $('mp-q-on').checked = !!quiet.enabled;
      $('mp-q-start').value = quiet.start || '23:00';
      $('mp-q-end').value = quiet.end || '08:00';
      $('mp-q-hold').checked = quiet.holdAlerts !== false;
      $('mp-q-gentle').checked = quiet.gentle !== false;
      $('mp-quiet-now').textContent = quietNow ? '— on right now' : '';
    };
    paintQuiet();
    const saveQuiet = async () => {
      try {
        const d = await api('/api/owner-prefs', { quiet: { enabled: $('mp-q-on').checked, start: $('mp-q-start').value, end: $('mp-q-end').value, holdAlerts: $('mp-q-hold').checked, gentle: $('mp-q-gentle').checked } });
        quiet = d.quiet; quietNow = d.quietNow; paintQuiet(); applyQuietGentle();
        toast('🌙 Quiet hours saved', quiet.enabled ? `${quiet.start}–${quiet.end}` : 'Off');
      } catch (e) { toast('▲ Quiet hours', e.message, 'error', 4000); }
    };
    ['mp-q-on', 'mp-q-start', 'mp-q-end', 'mp-q-hold', 'mp-q-gentle'].forEach((id) => $(id).addEventListener('change', saveQuiet));
    loadQuiet().then(paintQuiet);
  };

  // ===== Control room → Status posts =====
  const addStatusCard = () => {
    const control = $('page-control');
    if (!control || $('mp-status')) return;
    const card = el(`<div class="card" id="mp-status"><div class="card-head"><h3>📣 Status posts</h3></div>
      <div class="mr-help">Post in a Discord channel when something goes down or comes back (same as the status page).</div>
      <div class="mr-form" style="margin-top:10px">
        <label style="min-width:240px">Channel<select id="mp-st-ch"><option value="">Off</option></select></label>
        <label style="flex-direction:row;align-items:center;gap:8px;color:var(--fg)"><input type="checkbox" id="mp-st-dm" /> Also DM me</label>
        <button class="mr-btn" id="mp-st-test">Send a test post</button>
      </div></div>`);
    ($('mr-health') || control.querySelector('.page-head'))?.after(card);
    const load = async () => {
      try {
        const d = await api('/api/status-channel');
        const sel = $('mp-st-ch');
        sel.innerHTML = '<option value="">Off</option>' + d.channels.map((c) => `<option value="${esc(c.id)}">${esc(c.guild)} · ${esc(c.name)}</option>`).join('');
        sel.value = d.channelId || '';
        $('mp-st-dm').checked = !!d.dmAlerts;
      } catch (e) { card.querySelector('.mr-help').textContent = e.message; }
    };
    const save = (test) => api('/api/status-channel', { channelId: $('mp-st-ch').value || null, dmAlerts: $('mp-st-dm').checked, test })
      .then(() => toast(test ? '📣 Test sent' : '✓ Saved', test ? 'Check the channel.' : ''))
      .catch((e) => toast('▲ Status posts', e.message, 'error'));
    $('mp-st-ch').addEventListener('change', () => save(false));
    $('mp-st-dm').addEventListener('change', () => save(false));
    $('mp-st-test').addEventListener('click', () => { if (!$('mp-st-ch').value) return toast('Pick a channel first'); save(true); });
    load();
  };

  // =====================================================================
  // Batch 2: Playlists & Radio page, song radio, mood mixes, Home widgets
  // =====================================================================
  const gid = () => P().guildId?.() || null;
  const MOODS = [['chill', '🌙 Chill'], ['spooky', '🎃 Spooky'], ['hype', '⚡ Hype'], ['focus', '🎯 Focus'], ['happy', '☀️ Happy'], ['sad', '🌧 Sad'], ['cozy', '🍵 Cozy'], ['space', '🚀 Space']];
  const playMood = (mood) => api('/api/mood/play', { mood, guildId: gid() })
    .then((r) => toast(`🎛 ${r.label} mix`, `Queued ${r.count} songs.`, 'success', 3000))
    .catch((e) => toast('▲ Mood mix', e.message, 'error', 4000));
  const songRadio = () => api('/api/similar', { guildId: gid() })
    .then((r) => toast('📻 More like this', `Added ${r.added} songs like ${r.seed}.`, 'success', 3500))
    .catch((e) => toast('▲ Song radio', e.message, 'error', 4000));
  const playStation = (s) => api('/api/radio/play', { url: s.url, name: s.name || s.title, guildId: gid() })
    .then(() => toast('📻 Tuning in', s.name || s.title, 'success'))
    .catch((e) => toast('▲ Radio', e.message, 'error', 4000));
  palette.push({ glyph: '📻', label: 'Song radio: more like this', meta: 'music', keywords: 'similar related', action: songRadio });
  MOODS.forEach(([m, label]) => palette.push({ glyph: '🎛', label: `Mood mix: ${label.replace(/^\S+ /, '')}`, meta: 'music', keywords: `mood ${m}`, action: () => playMood(m) }));

  const main = document.querySelector('.main');
  if (main && !$('page-playlists')) {
    main.appendChild(el(`<section class="page hidden" id="page-playlists">
      <div class="page-head"><div><h2>♫ Playlists &amp; Radio</h2><div class="muted small">Your saved playlists, mood mixes, song radio and internet radio.</div></div></div>
      <div class="card"><div class="card-head"><h3>💾 Your playlists</h3><button class="mr-btn" id="mp-pl-save">Save current queue…</button></div>
        <div class="mr-list" id="mp-pl-list"><div class="mr-empty">Loading…</div></div>
        <div class="muted small" style="margin-top:6px">Also works in Discord: /save, /load, /myplaylists. Spotify playlist links can be played with /play.</div></div>
      <div class="card"><div class="card-head"><h3>🎛 Mood mix &amp; song radio</h3></div>
        <div class="mr-form" id="mp-moods"></div>
        <div class="mr-form" style="margin-top:10px"><button class="mr-btn primary" id="mp-similar">📻 More like the current song</button></div></div>
      <div class="card"><div class="card-head"><h3>📡 Internet radio</h3></div>
        <div class="mr-form" id="mp-presets"></div>
        <form class="mr-form" id="mp-radio-form" style="margin-top:10px" autocomplete="off">
          <label style="flex:1;min-width:200px">Search thousands of stations<input id="mp-radio-q" placeholder="jazz, lofi, BBC, Germany…" /></label>
          <button class="mr-btn primary" type="submit">Search</button></form>
        <div class="mr-list" id="mp-radio-results" style="margin-top:8px"></div></div>
    </section>`));
    MOODS.forEach(([m, label]) => { const b = el(`<button class="mr-btn">${label}</button>`); b.onclick = () => playMood(m); $('mp-moods').appendChild(b); });
    $('mp-similar').onclick = songRadio;
    $('mp-pl-save').onclick = async () => {
      const name = prompt('Save the current queue as a playlist called:');
      if (!name) return;
      try { const r = await api('/api/playlists/save', { name, guildId: gid() }); toast('💾 Saved', `${name} · ${r.count} songs`, 'success'); renderPlaylists(); }
      catch (e) { toast('▲ Save', e.message, 'error', 4000); }
    };
    $('mp-radio-form').onsubmit = async (e) => {
      e.preventDefault();
      const box = $('mp-radio-results');
      box.innerHTML = '<div class="mr-empty">Searching…</div>';
      try {
        const d = await api(`/api/radio/search?q=${encodeURIComponent($('mp-radio-q').value)}`);
        box.innerHTML = d.stations.length ? '' : '<div class="mr-empty">No stations found.</div>';
        d.stations.forEach((s) => {
          const row = el(`<div class="mr-row"><div class="mr-grow">${esc(s.name)}<div class="mr-sub">${esc([s.country, s.tags].filter(Boolean).join(' · '))}</div></div><button class="mr-btn">▶ Play</button></div>`);
          row.querySelector('button').onclick = () => playStation(s);
          box.appendChild(row);
        });
      } catch (err) { box.innerHTML = `<div class="mr-empty">${esc(err.message)}</div>`; }
    };
  }
  const renderPlaylists = async (target = $('mp-pl-list'), compact = false) => {
    if (!target) return;
    try {
      const d = await api(`/api/playlists${gid() ? `?guildId=${gid()}` : ''}`);
      const list = compact ? d.playlists.slice(0, 5) : d.playlists;
      target.innerHTML = list.length ? '' : '<div class="mr-empty">No saved playlists yet. Save the queue to make one.</div>';
      list.forEach((pl) => {
        const row = el(`<div class="mr-row"><div class="mr-grow">${esc(pl.name)}<div class="mr-sub">${pl.count} songs</div></div><button class="mr-btn" data-a="play">▶</button>${compact ? '' : '<button class="mr-btn danger" data-a="del">✕</button>'}</div>`);
        row.querySelector('[data-a="play"]').onclick = () => api('/api/playlists/play', { name: pl.name, guildId: gid() })
          .then((r) => toast('▶ Playing', `${pl.name} · ${r.count} songs`, 'success')).catch((e) => toast('▲', e.message, 'error', 4000));
        row.querySelector('[data-a="del"]')?.addEventListener('click', async () => {
          if (!confirm(`Delete the playlist "${pl.name}"?`)) return;
          await api('/api/playlists/delete', { name: pl.name, guildId: gid() }).catch((e) => toast('▲', e.message, 'error'));
          renderPlaylists();
        });
        target.appendChild(row);
      });
    } catch (e) { target.innerHTML = `<div class="mr-empty">${esc(e.message)}</div>`; }
  };
  const renderPresets = async (target, compact) => {
    if (!target) return;
    try {
      const d = await api('/api/radio/presets');
      target.innerHTML = '';
      d.presets.slice(0, compact ? 6 : 50).forEach((s) => { const b = el(`<button class="mr-btn" title="${esc(s.title)}">📻 ${esc(s.name)}</button>`); b.onclick = () => playStation(s); target.appendChild(b); });
    } catch { /* signed out */ }
  };
  new MutationObserver(() => {
    const pg = $('page-playlists');
    if (pg && !pg.classList.contains('hidden') && !pg.__shown) { pg.__shown = true; renderPlaylists(); renderPresets($('mp-presets')); }
    if (pg?.classList.contains('hidden')) pg.__shown = false;
  }).observe(main || document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

  // ----- Home widgets -----
  const W = window.maowHomeWidgets;
  if (W && !$('mpw-today')) {
    const today = W.add('today', 'Today', '📊 Today', null, { show: true });
    today.appendChild(el('<div id="mpw-today" class="mr-list"><div class="mr-empty">Loading…</div></div>'));
    const rem = W.add('reminders', 'Next reminders', '⏰ Next reminders', null, { show: true });
    rem.appendChild(el('<div id="mpw-rem" class="mr-list"></div>'));
    const mood = W.add('mood', 'Mood DJ', '🎛 Mood DJ', null, { show: true });
    const moodBox = el('<div class="mr-form" id="mpw-mood"></div>');
    mood.appendChild(moodBox);
    MOODS.forEach(([m, label]) => { const b = el(`<button class="mr-btn">${label}</button>`); b.onclick = () => playMood(m); moodBox.appendChild(b); });
    const radio = W.add('radio', 'Quick radio', '📻 Quick radio', null, { show: true });
    radio.appendChild(el('<div class="mr-form" id="mpw-radio"></div>'));
    const pls = W.add('playlists', 'Saved playlists', '💾 Playlists', null, { show: true });
    pls.appendChild(el('<div class="mr-list" id="mpw-pl"></div>'));
    const fmtH = (sec) => { const h = Math.floor(sec / 3600); const m = Math.round((sec % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
    const refreshWidgets = async () => {
      try {
        const s = await api(`/api/stats?range=today${gid() ? `&guildId=${gid()}` : ''}`);
        $('mpw-today').innerHTML = `<div class="mr-row"><div class="mr-grow">Songs played</div><b>${s.total || 0}</b></div>
          <div class="mr-row"><div class="mr-grow">Listening time</div><b>${fmtH(s.totalListeningSec || 0)}</b></div>
          <div class="mr-row"><div class="mr-grow">Top song</div><span class="mr-sub">${esc(s.topSongs?.[0]?.name || '—')}</span></div>`;
      } catch { /* */ }
      try {
        const r = await api('/api/reminders');
        const next = r.reminders.slice(0, 3);
        $('mpw-rem').innerHTML = next.length ? next.map((x) => `<div class="mr-row"><div class="mr-grow">${esc(x.what)}<div class="mr-sub">${new Date(x.fireAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}${x.repeat ? ' · 🔁' : ''}</div></div></div>`).join('')
          : '<div class="mr-empty">Nothing coming up.</div>';
        const add = el('<div class="mr-row"><button class="mr-btn">+ Add a reminder</button></div>');
        add.querySelector('button').addEventListener('click', () => document.querySelector('.nav-item[data-page="reminders"]')?.click());
        $('mpw-rem').appendChild(add);
      } catch { /* */ }
      renderPlaylists($('mpw-pl'), true);
    };
    renderPresets($('mpw-radio'), true);
    refreshWidgets();
    setInterval(() => { if (!document.hidden && document.body.dataset.mrPage === 'home') refreshWidgets(); }, 120000);
  }

  // =====================================================================
  // Batch 3: theme per server + theme by time of day
  // =====================================================================
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const jset = (k, v) => ls.set(k, JSON.stringify(v));
  let applying = false;
  const sched = () => ({ on: false, day: 'paper', night: 'discord', dayAt: '07:00', nightAt: '20:00', ...jget('maow.themeSchedule', {}) });
  const isDayNow = (s) => {
    const n = new Date(); const m = n.getHours() * 60 + n.getMinutes();
    const t = (x) => { const [h, mm] = String(x).split(':').map(Number); return h * 60 + mm; };
    const a = t(s.dayAt); const b = t(s.nightAt);
    return a < b ? m >= a && m < b : m >= a || m < b;
  };
  const wantedTheme = () => {
    const s = sched();
    if (s.on) return isDayNow(s) ? s.day : s.night;
    const byGuild = jget('maow.themeByGuild', {});
    const g = gid();
    if (g && byGuild[g]) return byGuild[g];
    return ls.get('maow.theme.global') || null;
  };
  const applyWanted = () => {
    const t = wantedTheme();
    if (!t || t === document.body.dataset.theme) return;
    applying = true;
    try { window.maowApplyTheme?.(t); } finally { setTimeout(() => { applying = false; }, 50); }
  };
  // Remember real theme picks (not hover previews, not our own switches).
  new MutationObserver(() => {
    if (applying) return;
    const t = document.body.dataset.theme;
    if (t !== ls.get('maow.theme')) return;   // a preview, not a pick
    if (sched().on) return;
    const byGuild = jget('maow.themeByGuild', {});
    const g = gid();
    if (g && byGuild[g]) { byGuild[g] = t; jset('maow.themeByGuild', byGuild); } else ls.set('maow.theme.global', t);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  if (!ls.get('maow.theme.global')) ls.set('maow.theme.global', ls.get('maow.theme') || 'discord');
  $('server-select')?.addEventListener('change', () => setTimeout(() => { applyWanted(); paintThemeOpts(); }, 50));
  setInterval(applyWanted, 60000);
  setTimeout(applyWanted, 400);

  const themeOptions = () => (window.maowThemePack?.catalog || []).map((t) => `<option value="${esc(t.id)}">${esc(t.cat)} · ${esc(t.name)}</option>`).join('');
  let paintThemeOpts = () => {};
  const addThemeSettings = () => {
    const card = $('mr-settings-panel');
    if (!card || $('mp-themes')) return;
    const box = el(`<div id="mp-themes" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft,var(--border))">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px">🎨 Automatic themes</div>
      <label style="flex-direction:row;align-items:center;gap:8px;color:var(--fg);display:flex;font-size:13px"><input type="checkbox" id="mp-t-guild" /> <span>Use the current theme only for <b id="mp-t-gname">this server</b></span></label>
      <label style="flex-direction:row;align-items:center;gap:8px;color:var(--fg);display:flex;font-size:13px;margin-top:8px"><input type="checkbox" id="mp-t-sched" /> Change theme with the time of day</label>
      <div class="mr-form" id="mp-t-sched-box" style="margin-top:6px">
        <label>Day theme<select id="mp-t-day">${themeOptions()}</select></label>
        <label>from<input type="time" id="mp-t-dayat" /></label>
        <label>Night theme<select id="mp-t-night">${themeOptions()}</select></label>
        <label>from<input type="time" id="mp-t-nightat" /></label>
      </div>
      <div class="muted small" style="margin-top:6px">The time-of-day schedule wins over per-server themes while it's on.</div></div>`);
    card.appendChild(box);
    paintThemeOpts = () => {
      const s = sched();
      const byGuild = jget('maow.themeByGuild', {});
      const g = gid();
      const opt = $('server-select')?.selectedOptions?.[0];
      $('mp-t-gname').textContent = opt?.textContent || 'this server';
      $('mp-t-guild').checked = !!(g && byGuild[g]);
      $('mp-t-guild').disabled = !g || s.on;
      $('mp-t-sched').checked = s.on;
      $('mp-t-sched-box').style.opacity = s.on ? '1' : '.55';
      $('mp-t-day').value = s.day; $('mp-t-night').value = s.night;
      $('mp-t-dayat').value = s.dayAt; $('mp-t-nightat').value = s.nightAt;
    };
    $('mp-t-guild').addEventListener('change', (e) => {
      const byGuild = jget('maow.themeByGuild', {});
      const g = gid();
      if (!g) return;
      if (e.target.checked) byGuild[g] = document.body.dataset.theme; else delete byGuild[g];
      jset('maow.themeByGuild', byGuild);
      if (!e.target.checked) applyWanted();
      toast('🎨 Server theme', e.target.checked ? 'This server now keeps its own theme.' : 'Back to your normal theme.');
    });
    const saveSched = () => {
      jset('maow.themeSchedule', { on: $('mp-t-sched').checked, day: $('mp-t-day').value, night: $('mp-t-night').value, dayAt: $('mp-t-dayat').value || '07:00', nightAt: $('mp-t-nightat').value || '20:00' });
      paintThemeOpts(); applyWanted();
    };
    ['mp-t-sched', 'mp-t-day', 'mp-t-night', 'mp-t-dayat', 'mp-t-nightat'].forEach((id) => $(id).addEventListener('change', saveSched));
    paintThemeOpts();
  };

  // =====================================================================
  // Batch 4: Moderation page — mod log, warn rules, notes
  // =====================================================================
  const ACTION_ICON = { ban: '🔨', unban: '↺', kick: '👢', softban: '🧹', timeout: '⏱', warn: '⚠️', purge: '🧽', lock: '🔒', unlock: '🔓', slowmode: '🐢', raid: '🚨', filter: '🛡', spam: '📣', note: '📝', appeal: '📝', ticket: '🎫' };
  const addModCards = () => {
    const page = $('page-moderation');
    if (!page || $('mp-modlog')) return;
    const box = el(`<div>
      <div class="card" id="mp-modlog"><div class="card-head"><h3>📜 Mod log</h3>
        <select id="mp-ml-filter"><option value="">Everything</option>${Object.keys(ACTION_ICON).map((a) => `<option value="${a}">${a}</option>`).join('')}</select></div>
        <div class="mr-list" id="mp-ml-list"><div class="mr-empty">Loading…</div></div></div>
      <div class="card" id="mp-warnrules"><div class="card-head"><h3>⏱ Warn points → automatic timeout</h3></div>
        <div class="mr-form"><label style="flex-direction:row;align-items:center;gap:8px;color:var(--fg)"><input type="checkbox" id="mp-wr-on" /> On</label>
          <label style="flex:1;min-width:220px">Rules<input id="mp-wr-text" placeholder="3=10m, 5=1h, 7=1d" /></label>
          <button class="mr-btn primary" id="mp-wr-save">Save</button></div>
        <div class="mr-help" style="margin-top:6px">When a member reaches that many warnings (/warn, or automod with auto-warn on), they're timed out for that long.</div></div>
      <div class="card" id="mp-notes"><div class="card-head"><h3>📝 Mod notes</h3></div><div class="mr-list" id="mp-notes-list"></div>
        <div class="mr-help">Add notes in Discord with /note add. Only moderators can see them.</div></div></div>`);
    page.querySelector('.page-head')?.after(box);
    const loadLog = async () => {
      const list = $('mp-ml-list');
      try {
        const d = await api(`/api/mod/log?limit=60${gid() ? `&guildId=${gid()}` : ''}${$('mp-ml-filter').value ? `&action=${$('mp-ml-filter').value}` : ''}`);
        list.innerHTML = d.entries.length ? '' : '<div class="mr-empty">Nothing logged yet.</div>';
        d.entries.forEach((e) => list.appendChild(el(`<div class="mr-row"><span style="font-size:16px">${ACTION_ICON[e.action] || '•'}</span>
          <div class="mr-grow"><b>${esc(e.action)}</b>${e.target ? ` · ${esc(e.target)}` : ''}${e.reason ? ` — ${esc(e.reason)}` : ''}
          <div class="mr-sub">${new Date(e.ts).toLocaleString()} · by ${esc(e.moderator || '—')}</div></div></div>`)));
      } catch (err) { list.innerHTML = `<div class="mr-empty">${esc(err.message)}</div>`; }
    };
    const loadRules = async () => {
      try { const r = await api(`/api/mod/warn-rules${gid() ? `?guildId=${gid()}` : ''}`); $('mp-wr-on').checked = r.enabled; $('mp-wr-text').value = r.text; } catch { /* no rights */ }
    };
    const loadNotes = async () => {
      const box2 = $('mp-notes-list');
      try {
        const d = await api(`/api/mod/notes${gid() ? `?guildId=${gid()}` : ''}`);
        box2.innerHTML = d.notes.length ? '' : '<div class="mr-empty">No notes yet.</div>';
        d.notes.forEach((u) => box2.appendChild(el(`<div class="mr-row"><div class="mr-grow"><b>${esc(u.name)}</b> <span class="mr-sub">${u.notes.length} note${u.notes.length === 1 ? '' : 's'}</span>
          ${u.notes.slice(-3).map((n) => `<div class="mr-sub">• ${esc(n.text)} — ${esc(n.by)}, ${new Date(n.ts).toLocaleDateString()}</div>`).join('')}</div></div>`)));
      } catch (err) { box2.innerHTML = `<div class="mr-empty">${esc(err.message)}</div>`; }
    };
    $('mp-ml-filter').addEventListener('change', loadLog);
    $('mp-wr-save').addEventListener('click', () => api('/api/mod/warn-rules', { guildId: gid(), enabled: $('mp-wr-on').checked, text: $('mp-wr-text').value })
      .then((r) => { $('mp-wr-text').value = r.text; toast('⏱ Warn rules saved', r.enabled ? r.text : 'Off'); })
      .catch((e) => toast('▲ Warn rules', e.message, 'error', 4000)));
    new MutationObserver(() => { if (!page.classList.contains('hidden') && !page.__mp) { page.__mp = true; loadLog(); loadRules(); loadNotes(); } if (page.classList.contains('hidden')) page.__mp = false; })
      .observe(page, { attributes: true, attributeFilter: ['class'] });
  };
  addModCards();

  // =====================================================================
  // Batch 6: checklists, calendar, routines (Reminders page + Home widget)
  // =====================================================================
  const STEP_LABEL = (s) => ({ theme: `🎨 ${s.id}`, gentle: `🌙 gentle ${s.on ? 'on' : 'off'}`, mood: `🎛 ${s.mood}`, radio: `📻 ${s.station}`, ambience: `🌫 ${s.preset}`, volume: `🔊 ${s.value}%`, stop: '⏹ stop', checklist: `☑️ ${s.match || 'checklist'}` }[s.type] || s.type);
  const setGentleLocal = (on) => {
    document.documentElement.classList.toggle('maow-gentle', on);
    ls.set('maow.gentle', on ? '1' : '0');
    try { window.maowPz?.refreshGentle?.(); } catch { /* */ }
    document.querySelectorAll('[data-mr-gentle]').forEach((c) => { c.checked = on; });
  };
  const runRoutine = async (r) => {
    try {
      const res = await api('/api/routines/run', { id: r.id, guildId: gid() });
      for (const s of res.panel || []) {
        if (s.type === 'theme') { applying = true; window.maowApplyTheme?.(s.id); setTimeout(() => { applying = false; }, 50); }
        if (s.type === 'gentle') setGentleLocal(!!s.on);
      }
      toast(`${r.emoji} ${r.name}`, [...(res.done || []), ...(res.panel || []).map(STEP_LABEL)].join(' · ') + (res.skipped?.length ? `\nSkipped: ${res.skipped.join(', ')}` : ''), 'success', 5000);
    } catch (e) { toast(`▲ ${r.name}`, e.message, 'error', 4500); }
  };
  let routinesCache = [];
  const loadRoutines = async () => { try { routinesCache = (await api('/api/routines')).routines; } catch { routinesCache = []; } return routinesCache; };
  setTimeout(async () => {
    (await loadRoutines()).forEach((r) => palette.push({ glyph: r.emoji, label: `Routine: ${r.name}`, meta: 'routine', keywords: 'routine one press', action: () => runRoutine(r) }));
  }, 800);

  const addRemindersExtras = () => {
    const page = $('page-reminders');
    if (!page || $('mp-checklists')) return;
    const box = el(`<div>
      <div class="card" id="mp-routines"><div class="card-head"><h3>⚡ Routines</h3><button class="mr-btn" id="mp-rt-new">+ New routine</button></div>
        <div class="mr-form" id="mp-rt-buttons"></div>
        <div class="mr-list" id="mp-rt-list" style="margin-top:8px"></div>
        <div id="mp-rt-edit" hidden style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-soft,var(--border))">
          <div class="mr-form"><label>Name<input id="mp-rt-name" maxlength="30" /></label><label>Emoji<input id="mp-rt-emoji" maxlength="8" style="width:70px" /></label></div>
          <div class="mr-list" id="mp-rt-steps" style="margin-top:8px"></div>
          <div class="mr-form" style="margin-top:8px">
            <label>Add a step<select id="mp-rt-type">
              <option value="theme">🎨 Switch theme</option><option value="gentle">🌙 Gentle mode on/off</option><option value="mood">🎛 Mood mix</option>
              <option value="radio">📻 Radio station</option><option value="ambience">🌫 Ambience</option><option value="volume">🔊 Volume</option>
              <option value="stop">⏹ Stop music</option><option value="checklist">☑️ Send a checklist</option></select></label>
            <label>Value<select id="mp-rt-val"></select></label>
            <button class="mr-btn" id="mp-rt-add">Add</button>
          </div>
          <div class="mr-form" style="margin-top:10px"><button class="mr-btn primary" id="mp-rt-save">Save routine</button><button class="mr-btn" id="mp-rt-cancel">Cancel</button><button class="mr-btn danger" id="mp-rt-del" hidden>Delete</button></div>
        </div>
        <div class="mr-help" style="margin-top:6px">Also in Discord: <code>/routine run</code>. Theme and Gentle steps happen in the panel.</div></div>
      <div class="card" id="mp-checklists"><div class="card-head"><h3>☑️ Checklists</h3></div>
        <div id="mp-cl-list"></div>
        <form class="mr-form" id="mp-cl-form" style="margin-top:10px" autocomplete="off">
          <label>Name<input id="mp-cl-name" maxlength="40" placeholder="Morning meds" required /></label>
          <label style="flex:1;min-width:200px">Items (comma-separated)<input id="mp-cl-items" placeholder="Vitamin D, Water, Breakfast" required /></label>
          <label>Daily DM at<input type="time" id="mp-cl-at" /></label>
          <button class="mr-btn primary" type="submit">Add checklist</button></form>
        <div class="mr-help" style="margin-top:6px">With a time, I DM it to you every day with tick buttons, and nudge once if it isn't done 2 h later. Also: <code>/checklist</code>.</div></div>
      <div class="card" id="mp-calendar"><div class="card-head"><h3>📅 Calendar</h3><div class="mr-form"><button class="mr-btn" id="mp-cal-prev">◀</button><b id="mp-cal-title"></b><button class="mr-btn" id="mp-cal-next">▶</button></div></div>
        <div id="mp-cal-grid" class="mp-cal"></div><div class="mr-list" id="mp-cal-day" style="margin-top:8px"></div></div></div>`);
    page.appendChild(box);

    // ----- Routines -----
    let editing = null;
    const valuesFor = async (type) => {
      if (type === 'theme') return (window.maowThemePack?.catalog || []).map((t) => [t.id, `${t.cat} · ${t.name}`]);
      if (type === 'gentle') return [['on', 'On'], ['off', 'Off']];
      if (type === 'mood') return MOODS.map(([m, l]) => [m, l]);
      if (type === 'ambience') return [['fan', '🌀 Office fan'], ['hum', '🚀 Ship hum'], ['rain', '🌧 Rain'], ['static', '📼 Tape static'], ['server', '🖥 Server room'], ['wind', '🌫 Wind'], ['drip', '💧 Cave drips']];
      if (type === 'volume') return [20, 35, 50, 60, 80, 100].map((v) => [String(v), `${v}%`]);
      if (type === 'radio') { try { return (await api('/api/radio/presets')).presets.map((s) => [s.name, s.title]); } catch { return []; } }
      if (type === 'checklist') { try { return [['', 'First checklist'], ...(await api('/api/checklists')).lists.map((l) => [l.name, l.name])]; } catch { return [['', 'First checklist']]; } }
      return [['', '—']];
    };
    const fillValues = async () => { const v = await valuesFor($('mp-rt-type').value); $('mp-rt-val').innerHTML = v.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join(''); $('mp-rt-val').disabled = $('mp-rt-type').value === 'stop'; };
    const paintSteps = () => {
      const list = $('mp-rt-steps');
      list.innerHTML = editing.steps.length ? '' : '<div class="mr-empty">No steps yet.</div>';
      editing.steps.forEach((s, i) => {
        const row = el(`<div class="mr-row"><div class="mr-grow">${i + 1}. ${esc(STEP_LABEL(s))}</div><button class="mr-btn" data-a="up">▲</button><button class="mr-btn danger" data-a="rm">✕</button></div>`);
        row.querySelector('[data-a="rm"]').onclick = () => { editing.steps.splice(i, 1); paintSteps(); };
        row.querySelector('[data-a="up"]').onclick = () => { if (i) { [editing.steps[i - 1], editing.steps[i]] = [editing.steps[i], editing.steps[i - 1]]; paintSteps(); } };
        list.appendChild(row);
      });
    };
    const openEdit = (r) => {
      editing = r ? JSON.parse(JSON.stringify(r)) : { name: '', emoji: '⚡', steps: [] };
      $('mp-rt-edit').hidden = false; $('mp-rt-del').hidden = !r;
      $('mp-rt-name').value = editing.name; $('mp-rt-emoji').value = editing.emoji;
      paintSteps(); fillValues();
    };
    const renderRoutines = async () => {
      const all = await loadRoutines();
      $('mp-rt-buttons').innerHTML = '';
      all.forEach((r) => { const b = el(`<button class="mr-btn primary">${esc(r.emoji)} ${esc(r.name)}</button>`); b.onclick = () => runRoutine(r); $('mp-rt-buttons').appendChild(b); });
      $('mp-rt-list').innerHTML = '';
      all.forEach((r) => {
        const row = el(`<div class="mr-row"><div class="mr-grow">${esc(r.emoji)} <b>${esc(r.name)}</b><div class="mr-sub">${r.steps.map((s) => esc(STEP_LABEL(s))).join(' → ')}</div></div><button class="mr-btn">Edit</button></div>`);
        row.querySelector('button').onclick = () => openEdit(r);
        $('mp-rt-list').appendChild(row);
      });
    };
    $('mp-rt-new').onclick = () => openEdit(null);
    $('mp-rt-cancel').onclick = () => { $('mp-rt-edit').hidden = true; };
    $('mp-rt-type').onchange = fillValues;
    $('mp-rt-add').onclick = () => {
      const t = $('mp-rt-type').value; const v = $('mp-rt-val').value;
      const step = { theme: { type: t, id: v }, gentle: { type: t, on: v === 'on' }, mood: { type: t, mood: v }, radio: { type: t, station: v }, ambience: { type: t, preset: v }, volume: { type: t, value: Number(v) }, stop: { type: t }, checklist: { type: t, match: v } }[t];
      if (editing.steps.length >= 12) return toast('Up to 12 steps');
      editing.steps.push(step); paintSteps();
    };
    $('mp-rt-save').onclick = async () => {
      editing.name = $('mp-rt-name').value; editing.emoji = $('mp-rt-emoji').value || '⚡';
      try { await api('/api/routines/save', { routine: editing }); $('mp-rt-edit').hidden = true; renderRoutines(); toast('⚡ Routine saved', editing.name, 'success'); }
      catch (e) { toast('▲ Routine', e.message, 'error', 4000); }
    };
    $('mp-rt-del').onclick = async () => {
      if (!editing?.id || !confirm(`Delete the routine "${editing.name}"?`)) return;
      await api('/api/routines/delete', { id: editing.id }).catch((e) => toast('▲', e.message, 'error'));
      $('mp-rt-edit').hidden = true; renderRoutines();
    };

    // ----- Checklists -----
    let checklists = [];
    const renderChecklists = async () => {
      const boxc = $('mp-cl-list');
      try { checklists = (await api('/api/checklists')).lists; } catch (e) { boxc.innerHTML = `<div class="mr-empty">${esc(e.message)}</div>`; return; }
      boxc.innerHTML = checklists.length ? '' : '<div class="mr-empty">No checklists yet.</div>';
      checklists.forEach((l) => {
        const done = new Set(l.today);
        const card = el(`<div class="mr-pcard" style="margin-bottom:8px"><div class="mr-p-head"><div class="mr-grow"><b>${esc(l.profile?.emoji || '☑️')} ${esc(l.name)}</b>
          <div class="mr-sub">${done.size}/${l.items.length} today${l.at ? ` · daily ${l.at}` : ''}${l.streak ? ` · 🔥 ${l.streak}-day streak` : ''}${l.profile ? ` · ${esc(l.profile.name)}` : ''}</div></div>
          <button class="mr-btn danger" data-a="del">✕</button></div>
          <div class="mr-form">${l.items.map((it, i) => `<label style="flex-direction:row;align-items:center;gap:6px;color:var(--fg)"><input type="checkbox" data-i="${i}" ${done.has(i) ? 'checked' : ''}/> ${esc(it)}</label>`).join('')}</div></div>`);
        card.querySelectorAll('input[data-i]').forEach((cb) => cb.addEventListener('change', async () => {
          try { await api('/api/checklists/toggle', { id: l.id, idx: Number(cb.dataset.i) }); renderChecklists(); } catch (e) { toast('▲', e.message, 'error'); }
        }));
        card.querySelector('[data-a="del"]').onclick = async () => { if (!confirm(`Delete the checklist "${l.name}"?`)) return; await api('/api/checklists/delete', { id: l.id }).catch(() => {}); renderChecklists(); };
        boxc.appendChild(card);
      });
      paintCalendar();
    };
    $('mp-cl-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/api/checklists/save', { name: $('mp-cl-name').value, items: $('mp-cl-items').value, at: $('mp-cl-at').value || null, profileId: ls.get('maow.profile.active') || null });
        $('mp-cl-name').value = ''; $('mp-cl-items').value = ''; $('mp-cl-at').value = '';
        toast('☑️ Checklist added'); renderChecklists();
      } catch (err) { toast('▲ Checklist', err.message, 'error', 4000); }
    };

    // ----- Calendar -----
    let calMonth = new Date(); calMonth.setDate(1);
    let reminders = window.__mrReminders || [];
    const occurrences = (r, y, m) => {
      // All times this reminder fires in month m of year y (repeats expanded).
      const out = []; const start = new Date(y, m, 1).getTime(); const end = new Date(y, m + 1, 1).getTime();
      let t = r.fireAt; let guard = 0;
      const step = (x) => { const d = new Date(x); if (r.repeat === 'hourly') return x + 3600e3; if (r.repeat === 'weekly') { d.setDate(d.getDate() + 7); return d.getTime(); } d.setDate(d.getDate() + 1); if (r.repeat === 'weekdays') while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return d.getTime(); };
      if (!r.repeat) return t >= start && t < end ? [t] : [];
      if (r.repeat === 'hourly') return t < end ? [Math.max(t, start)] : [];   // one marker per day is enough
      while (t < end && guard++ < 500) { if (t >= start) out.push(t); t = step(t); }
      return out;
    };
    const paintCalendar = () => {
      const y = calMonth.getFullYear(); const m = calMonth.getMonth();
      $('mp-cal-title').textContent = calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
      const byDay = {};
      const add = (d, item) => { (byDay[d] = byDay[d] || []).push(item); };
      reminders.forEach((r) => occurrences(r, y, m).forEach((t) => add(new Date(t).getDate(), { icon: '⏰', text: r.what, time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), who: r.profile })));
      const days = new Date(y, m + 1, 0).getDate();
      checklists.filter((l) => l.at).forEach((l) => { for (let d = 1; d <= days; d++) add(d, { icon: '☑️', text: l.name, time: l.at, who: l.profile }); });
      const first = (new Date(y, m, 1).getDay() + 6) % 7;   // Monday first
      const today = new Date();
      let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="mp-cal-h">${d}</div>`).join('');
      for (let i = 0; i < first; i++) html += '<div></div>';
      for (let d = 1; d <= days; d++) {
        const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
        const items = byDay[d] || [];
        const rem = items.filter((x) => x.icon === '⏰').length;
        html += `<button class="mp-cal-d${isToday ? ' today' : ''}" data-d="${d}"><span>${d}</span>${rem ? `<i>${rem > 3 ? '●●●+' : '●'.repeat(rem)}</i>` : ''}</button>`;
      }
      $('mp-cal-grid').innerHTML = html;
      $('mp-cal-grid').querySelectorAll('[data-d]').forEach((b) => b.onclick = () => {
        const items = (byDay[b.dataset.d] || []).sort((a, c) => a.time.localeCompare(c.time));
        $('mp-cal-day').innerHTML = `<div class="mr-sub" style="margin-bottom:4px">${new Date(y, m, Number(b.dataset.d)).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>`
          + (items.length ? items.map((x) => `<div class="mr-row"><span>${x.icon}</span><div class="mr-grow">${esc(x.text)}${x.who ? ` <span class="mr-tag">${esc(x.who.emoji || '🎭')} ${esc(x.who.name)}</span>` : ''}</div><span class="mr-sub">${esc(x.time)}</span></div>`).join('') : '<div class="mr-empty">Nothing that day.</div>');
      });
    };
    $('mp-cal-prev').onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); paintCalendar(); };
    $('mp-cal-next').onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); paintCalendar(); };
    window.addEventListener('mr:reminders', (e) => { reminders = e.detail || []; paintCalendar(); });

    new MutationObserver(() => {
      if (!page.classList.contains('hidden') && !page.__mp6) { page.__mp6 = true; renderRoutines(); renderChecklists(); }
      if (page.classList.contains('hidden')) page.__mp6 = false;
    }).observe(page, { attributes: true, attributeFilter: ['class'] });
  };
  addRemindersExtras();

  // Home widget: one-press routines.
  if (window.maowHomeWidgets && !$('mpw-rt')) {
    const w = window.maowHomeWidgets.add('routines', 'Routines', '⚡ Routines', null, { show: true });
    const boxw = el('<div class="mr-form" id="mpw-rt"></div>');
    w.appendChild(boxw);
    loadRoutines().then((all) => all.forEach((r) => { const b = el(`<button class="mr-btn">${esc(r.emoji)} ${esc(r.name)}</button>`); b.onclick = () => runRoutine(r); boxw.appendChild(b); }));
  }

  addSettings();
  addStatusCard();
  addThemeSettings();
  // panel-revamp.js builds the Settings card; retry once in case it runs later.
  setTimeout(() => { addSettings(); addStatusCard(); addThemeSettings(); }, 500);
  window.maowPlus = { toggleLight, loadQuiet };
})();
