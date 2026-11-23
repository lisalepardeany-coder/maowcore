// Playlist downloads: song picker + downloads panel (server: lib/download-queue.js).
//
// - Pasting a playlist / album / Spotify link into "Install from URL" opens a
//   picker with every song (checkboxes, search, select all/none) instead of a
//   yes/no pop-up. Single songs still install the old way.
// - A "Downloads" button (bottom right) opens the panel: each download with
//   its progress, every song's status (and why it failed), and Pause /
//   Resume / Retry failed / Cancel / Remove. Downloads continue after a bot
//   restart and wait out YouTube's rate limit by themselves.
// Loaded after panel-extras.js, whose fetch wrapper adds the sign-in.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = async (path, body) => {
    const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };
  const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const SOURCE = { youtube: '▶ YouTube', spotify: '● Spotify', soundcloud: '☁ SoundCloud', bandcamp: '♪ Bandcamp', other: '🔗 Link' };

  // ---------------------------------------------------------------- styles
  const css = document.createElement('style');
  css.textContent = `
    #dl-queue{display:none!important}
    .mdl-modal{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55)}
    .mdl-card{width:min(640px,100%);max-height:min(88vh,900px);display:flex;flex-direction:column;background:var(--bg-card,var(--bg-elev,#2b2d31));color:var(--fg,#f2f3f5);border:1px solid var(--border,#3f4147);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.45);overflow:hidden}
    .mdl-head{padding:16px 18px 10px;border-bottom:1px solid var(--border,#3f4147)}
    .mdl-head h3{margin:0 0 4px;font-size:17px;overflow-wrap:anywhere}
    .mdl-sub{font-size:12.5px;color:var(--fg-muted,#b5bac1)}
    .mdl-tools{display:flex;flex-wrap:wrap;gap:8px;padding:10px 18px;align-items:center;border-bottom:1px solid var(--border,#3f4147)}
    .mdl-tools input[type=search]{flex:1 1 180px;min-width:0;padding:8px 10px;border-radius:8px;border:1px solid var(--border,#3f4147);background:var(--bg-input,#1e1f22);color:inherit;font:inherit}
    .mdl-tools select{padding:8px;border-radius:8px;border:1px solid var(--border,#3f4147);background:var(--bg-input,#1e1f22);color:inherit;font:inherit;max-width:100%}
    .mdl-btn{border:1px solid var(--border,#3f4147);background:var(--bg-input,#1e1f22);color:inherit;border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;min-height:34px}
    .mdl-btn.primary{background:var(--accent,#5865F2);border-color:transparent;color:#fff;font-weight:600}
    .mdl-btn.danger{color:var(--danger,#f23f43)}
    .mdl-btn:disabled{opacity:.5;cursor:default}
    .mdl-list{overflow:auto;flex:1;padding:4px 8px}
    .mdl-song{display:flex;gap:10px;align-items:center;padding:7px 10px;border-radius:8px;cursor:pointer;font-size:13.5px}
    .mdl-song:hover{background:var(--bg-input,rgba(255,255,255,.04))}
    .mdl-song input{accent-color:var(--accent,#5865F2);width:17px;height:17px;flex:none}
    .mdl-song .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mdl-song .d{color:var(--fg-muted,#b5bac1);font-size:12px;flex:none}
    .mdl-foot{display:flex;gap:8px;justify-content:flex-end;align-items:center;padding:12px 18px;border-top:1px solid var(--border,#3f4147);flex-wrap:wrap}
    .mdl-foot .mdl-count{margin-right:auto;font-size:13px;color:var(--fg-muted,#b5bac1)}
    .mdl-msg{padding:28px 18px;text-align:center;color:var(--fg-muted,#b5bac1);font-size:14px;overflow-wrap:anywhere}
    .mdl-msg.err{color:var(--danger,#f23f43)}
    #mdl-fab{position:fixed;right:16px;bottom:84px;z-index:8500;display:none;align-items:center;gap:8px;border:0;border-radius:999px;padding:10px 16px;background:var(--accent,#5865F2);color:#fff;font:inherit;font-weight:600;font-size:14px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35)}
    #mdl-fab.show{display:inline-flex}
    #mdl-fab .n{background:rgba(255,255,255,.25);border-radius:999px;padding:1px 8px;font-size:12px}
    #mdl-panel{position:fixed;right:16px;bottom:136px;z-index:8600;width:min(460px,calc(100vw - 32px));max-height:min(70vh,700px);display:none;flex-direction:column;background:var(--bg-card,var(--bg-elev,#2b2d31));color:var(--fg,#f2f3f5);border:1px solid var(--border,#3f4147);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.45);overflow:hidden}
    #mdl-panel.open{display:flex}
    #mdl-panel .ph{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border,#3f4147);font-weight:600}
    #mdl-panel .ph .x{margin-left:auto}
    #mdl-panel .pb{overflow:auto;padding:10px;display:flex;flex-direction:column;gap:10px}
    .mdl-wait{font-size:12.5px;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,var(--warning,#f0b232) 15%,transparent);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .mdl-job{border:1px solid var(--border,#3f4147);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:7px}
    .mdl-job .jt{display:flex;gap:8px;align-items:baseline}
    .mdl-job .jn{flex:1;min-width:0;font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mdl-chip{font-size:11.5px;padding:2px 8px;border-radius:999px;background:var(--bg-input,#1e1f22);white-space:nowrap;flex:none}
    .mdl-chip[data-s=running]{color:var(--accent,#5865F2)} .mdl-chip[data-s=done]{color:var(--success,#23a55a)}
    .mdl-chip[data-s=waiting],.mdl-chip[data-s=paused]{color:var(--warning,#f0b232)} .mdl-chip[data-s=cancelled]{color:var(--fg-muted,#b5bac1)}
    .mdl-bar{height:6px;border-radius:6px;background:var(--bg-input,#1e1f22);overflow:hidden}
    .mdl-bar i{display:block;height:100%;background:var(--accent,#5865F2);transition:width .4s}
    .mdl-stats{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--fg-muted,#b5bac1)}
    .mdl-stats .ok{color:var(--success,#23a55a)} .mdl-stats .bad{color:var(--danger,#f23f43)}
    .mdl-acts{display:flex;flex-wrap:wrap;gap:6px}
    .mdl-acts .mdl-btn{padding:5px 10px;min-height:30px;font-size:12.5px}
    .mdl-items{display:flex;flex-direction:column;gap:2px;max-height:260px;overflow:auto;border-top:1px dashed var(--border,#3f4147);padding-top:6px}
    .mdl-item{display:flex;gap:8px;font-size:12.5px;align-items:flex-start}
    .mdl-item .ic{width:16px;flex:none;text-align:center}
    .mdl-item .tt{flex:1;min-width:0;overflow-wrap:anywhere}
    .mdl-item .er{display:block;color:var(--danger,#f23f43);font-size:11.5px}
    .mdl-item[data-s=excluded]{opacity:.45}
    .mdl-empty{padding:20px;text-align:center;color:var(--fg-muted,#b5bac1);font-size:13px}
    @media (max-width:640px){
      #mdl-fab{right:12px;bottom:76px}
      #mdl-panel{right:8px;left:8px;width:auto;bottom:128px;max-height:65vh}
      .mdl-modal{padding:0;align-items:flex-end}
      .mdl-card{border-radius:14px 14px 0 0;max-height:92vh}
    }`;
  document.head.appendChild(css);

  // ---------------------------------------------------------------- picker
  const isCollection = (url) => {
    try {
      const u = new URL(url);
      if (/open\.spotify\.com$/i.test(u.hostname)) return true; // any Spotify link: songs come from YouTube
      if (u.searchParams.has('list')) return true;
      return /\/(playlist|sets|album)(\/|$)/.test(u.pathname);
    } catch { return false; }
  };

  const openPicker = async (url, format) => {
    const modal = document.createElement('div');
    modal.className = 'mdl-modal';
    modal.innerHTML = `<div class="mdl-card" role="dialog" aria-modal="true" aria-label="Choose songs">
      <div class="mdl-head"><h3>Reading the playlist…</h3><div class="mdl-sub">${esc(url)}</div></div>
      <div class="mdl-msg">Getting the song list. Big playlists take a few seconds.</div></div>`;
    document.body.appendChild(modal);
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    let probe;
    try { probe = await api('/api/library/probe-playlist', { url }); }
    catch (e) {
      modal.querySelector('.mdl-card').innerHTML = `<div class="mdl-head"><h3>Couldn't read that link</h3></div>
        <div class="mdl-msg err">${esc(e.message).replace(/\n/g, '<br>')}</div>
        <div class="mdl-foot"><button class="mdl-btn" data-a="close">Close</button></div>`;
      modal.querySelector('[data-a=close]').onclick = close;
      return;
    }

    const chosen = new Set(probe.entries.map((e) => e.i));
    const formatSel = $('install-format');
    const formats = formatSel ? [...formatSel.options].map((o) => `<option value="${esc(o.value)}"${o.value === format ? ' selected' : ''}>${esc(o.textContent)}</option>`).join('') : '<option value="original">Original</option>';
    const card = modal.querySelector('.mdl-card');
    card.innerHTML = `
      <div class="mdl-head"><h3>${esc(probe.name)}</h3>
        <div class="mdl-sub">${esc(SOURCE[probe.source] || probe.source)} · ${probe.count} song${probe.count === 1 ? '' : 's'}${probe.source === 'spotify' ? ' · each song is found and downloaded from YouTube' : ''}</div></div>
      <div class="mdl-tools">
        <input type="search" placeholder="Search songs…" aria-label="Search songs">
        <button class="mdl-btn" data-a="all">All</button><button class="mdl-btn" data-a="none">None</button>
        <select aria-label="Format">${formats}</select>
      </div>
      <div class="mdl-list"></div>
      <div class="mdl-foot"><span class="mdl-count"></span>
        <button class="mdl-btn" data-a="close">Cancel</button><button class="mdl-btn primary" data-a="go">Download</button></div>`;
    const listEl = card.querySelector('.mdl-list');
    const search = card.querySelector('input[type=search]');
    const countEl = card.querySelector('.mdl-count');
    const goBtn = card.querySelector('[data-a=go]');
    const visible = () => {
      const q = search.value.trim().toLowerCase();
      return probe.entries.filter((e) => !q || e.title.toLowerCase().includes(q));
    };
    const renderCount = () => {
      countEl.textContent = `${chosen.size} of ${probe.count} selected`;
      goBtn.textContent = `Download ${chosen.size} song${chosen.size === 1 ? '' : 's'}`;
      goBtn.disabled = !chosen.size;
    };
    const renderList = () => {
      const rows = visible();
      listEl.innerHTML = rows.length ? rows.map((e) => `<label class="mdl-song"><input type="checkbox" data-i="${e.i}"${chosen.has(e.i) ? ' checked' : ''}><span class="t">${esc(e.title)}</span><span class="d">${fmtDur(e.duration)}</span></label>`).join('')
        : '<div class="mdl-empty">No songs match.</div>';
    };
    listEl.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.i);
      if (e.target.checked) chosen.add(i); else chosen.delete(i);
      renderCount();
    });
    search.addEventListener('input', renderList);
    card.querySelector('[data-a=all]').onclick = () => { visible().forEach((e) => chosen.add(e.i)); renderList(); renderCount(); };
    card.querySelector('[data-a=none]').onclick = () => { visible().forEach((e) => chosen.delete(e.i)); renderList(); renderCount(); };
    card.querySelector('[data-a=close]').onclick = close;
    goBtn.onclick = async () => {
      goBtn.disabled = true; goBtn.textContent = 'Starting…';
      try {
        const all = chosen.size === probe.count;
        await api('/api/library/install-playlist', { url, format: card.querySelector('select').value, ...(all ? {} : { pick: [...chosen] }) });
        close();
        const urlBox = $('install-url'); if (urlBox) urlBox.value = '';
        openPanel();
        refresh();
      } catch (e) {
        goBtn.disabled = false; renderCount();
        countEl.innerHTML = `<span style="color:var(--danger,#f23f43)">${esc(e.message)}</span>`;
      }
    };
    renderList(); renderCount();
    search.focus({ preventScroll: true });
  };

  // Take over the Install button for playlist-like links (capture phase, before app.js's handler).
  const hook = () => {
    const btn = $('install-btn'); const box = $('install-url');
    if (!btn || !box || btn.dataset.mdl) return;
    btn.dataset.mdl = '1';
    const maybe = (e) => {
      const url = box.value.trim();
      if (!/^https?:\/\//i.test(url) || !isCollection(url)) return; // single songs: the old flow
      e.preventDefault(); e.stopImmediatePropagation();
      openPicker(url, $('install-format')?.value || 'original');
    };
    btn.addEventListener('click', maybe, true);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') maybe(e); }, true);
    const c = $('cfg-concurrency');
    if (c) { c.max = '3'; c.title = 'YouTube blocks servers that download too much at once: 1–3, 2 is safest.'; }
  };

  // ---------------------------------------------------------------- panel
  const fab = document.createElement('button');
  fab.id = 'mdl-fab'; fab.type = 'button';
  const panel = document.createElement('div');
  panel.id = 'mdl-panel';
  panel.innerHTML = '<div class="ph">⬇ Downloads <button class="mdl-btn x" type="button" aria-label="Close">✕</button></div><div class="pb"></div>';
  document.body.append(fab, panel);
  const body = panel.querySelector('.pb');
  const openDetails = new Set();
  const details = new Map(); // jobId -> items
  let jobs = [];

  const openPanel = () => { panel.classList.add('open'); refresh(); };
  fab.onclick = () => { panel.classList.toggle('open'); if (panel.classList.contains('open')) refresh(); };
  panel.querySelector('.x').onclick = () => panel.classList.remove('open');

  const ICON = { pending: '·', downloading: '⬇', done: '✓', skipped: '↩', failed: '✕', excluded: '–', cancelled: '⊘' };
  const LABEL = { queued: 'queued', running: 'downloading', waiting: 'waiting for YouTube', paused: 'paused', done: 'done', cancelled: 'cancelled' };

  const jobHtml = (j) => {
    const c = j.counts || {};
    const finished = (c.done || 0) + (c.skipped || 0) + (c.failed || 0) + (c.cancelled || 0);
    const pct = c.total ? Math.round((finished / c.total) * 100) : 0;
    const active = ['queued', 'running', 'waiting'].includes(j.status);
    const acts = [];
    if (active) acts.push('<button class="mdl-btn" data-act="pause">Pause</button>');
    if (j.status === 'paused') acts.push('<button class="mdl-btn primary" data-act="resume">Resume</button>');
    if (c.failed || (c.cancelled && !active)) acts.push(`<button class="mdl-btn" data-act="retry">Retry ${(c.failed || 0) + (j.status === 'cancelled' ? c.cancelled || 0 : 0)} failed</button>`);
    if (active || j.status === 'paused') acts.push('<button class="mdl-btn danger" data-act="cancel">Cancel</button>');
    else acts.push('<button class="mdl-btn" data-act="remove">Remove</button>');
    acts.push(`<button class="mdl-btn" data-act="songs">${openDetails.has(j.id) ? 'Hide songs' : 'Songs'}</button>`);
    const items = openDetails.has(j.id) ? (details.get(j.id) || null) : null;
    const itemsHtml = openDetails.has(j.id) ? `<div class="mdl-items">${items ? items.map((it) => `<div class="mdl-item" data-s="${it.status}"><span class="ic">${ICON[it.status] || '·'}</span><span class="tt">${esc(it.title)}${it.error ? `<span class="er">${esc(it.error)}</span>` : ''}</span></div>`).join('') : '<div class="mdl-empty">Loading…</div>'}</div>` : '';
    return `<div class="mdl-job" data-id="${esc(j.id)}">
      <div class="jt"><span class="jn" title="${esc(j.url)}">${esc(j.name || j.url)}</span><span class="mdl-chip" data-s="${esc(j.status)}">${esc(LABEL[j.status] || j.status)}</span></div>
      <div class="mdl-bar"><i style="width:${pct}%"></i></div>
      <div class="mdl-stats"><span>${finished}/${c.total || 0}</span>${c.done ? `<span class="ok">✓ ${c.done} new</span>` : ''}${c.skipped ? `<span>↩ ${c.skipped} already had</span>` : ''}${c.failed ? `<span class="bad">✕ ${c.failed} failed</span>` : ''}<span>${esc(SOURCE[j.source] || '')} · ${esc(j.format)}</span></div>
      ${j.status === 'running' && j.currentTitles?.length ? `<div class="mdl-stats">⬇ ${esc(j.currentTitles.slice(0, 2).join(' · '))}</div>` : ''}
      <div class="mdl-acts">${acts.join('')}</div>${itemsHtml}</div>`;
  };

  const render = () => {
    const active = jobs.filter((j) => ['queued', 'running', 'waiting', 'paused'].includes(j.status));
    fab.classList.toggle('show', jobs.length > 0);
    fab.innerHTML = `⬇ Downloads${active.length ? ` <span class="n">${active.length}</span>` : ''}`;
    const waiting = jobs.find((j) => j.status === 'waiting');
    body.innerHTML = (waiting ? `<div class="mdl-wait">⏸ YouTube rate-limited this server. Downloads continue by themselves at ${time(waiting.resumeAt)}. <button class="mdl-btn" data-act="continue">Try now</button></div>` : '')
      + (jobs.length ? jobs.map(jobHtml).join('') : '<div class="mdl-empty">No downloads yet. Paste a playlist link in "Install from URL".</div>');
  };

  const loadDetails = async (id) => {
    try { const d = await api(`/api/library/install-jobs/${encodeURIComponent(id)}`); details.set(id, d.job.items); } catch { /* gone */ }
  };

  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const d = await api('/api/library/install-jobs');
      jobs = d.jobs || [];
      await Promise.all([...openDetails].filter((id) => jobs.some((j) => j.id === id)).map(loadDetails));
      render();
    } catch { /* not signed in yet / bot restarting */ }
    finally { refreshing = false; }
  };

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'continue') { b.disabled = true; await api('/api/library/downloads/continue-now', {}).catch(() => {}); return refresh(); }
    const id = b.closest('.mdl-job')?.dataset.id;
    if (!id) return;
    if (act === 'songs') {
      if (openDetails.has(id)) openDetails.delete(id); else { openDetails.add(id); render(); await loadDetails(id); }
      return render();
    }
    if (act === 'cancel' && !confirm('Cancel this download? Songs already downloaded stay in your library.')) return;
    b.disabled = true;
    try { await api(`/api/library/install-jobs/${encodeURIComponent(id)}/${act}`, {}); }
    catch (err) { alert(err.message); }
    if (act === 'remove') { openDetails.delete(id); details.delete(id); }
    refresh();
  });

  // Poll: often while something is happening or the panel is open, rarely otherwise.
  const tick = () => {
    const busy = panel.classList.contains('open') || jobs.some((j) => ['queued', 'running', 'waiting'].includes(j.status));
    if (!document.hidden) refresh();
    setTimeout(tick, busy ? 2500 : 15000);
  };

  const boot = () => { hook(); tick(); };
  (window.maowAuthReady && typeof window.maowAuthReady.then === 'function' ? window.maowAuthReady : Promise.resolve()).then(boot, boot);
  // the Library page may be drawn later: hook the Install button when it appears
  new MutationObserver(() => hook()).observe(document.body, { childList: true, subtree: true });
})();
