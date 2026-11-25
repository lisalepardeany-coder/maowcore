// Sign-in screen + Login page security tools.
//
// Loaded before app.js. When the panel's login lock is on (PANEL_REQUIRE_LOGIN=1
// and Discord sign-in is set up), it checks the saved session first and shows
// a full-screen "Sign in with Discord" card instead of a broken panel. app.js
// waits on window.maowAuthReady before opening its live connection.
//
// It also adds a "Security" card to the Login page: the lock switch, signed-in
// devices (sign out one or all) and the login history from the database.
(() => {
  const KEY = 'maow.session';
  const get = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const drop = () => { try { localStorage.removeItem(KEY); } catch { /* private window */ } };

  // Coming back from Discord: keep the session before anything asks for it.
  const m = location.hash.match(/maow_session=([^&]+)/);
  if (m) { try { localStorage.setItem(KEY, decodeURIComponent(m[1])); } catch { /* */ } }

  const api = async (path, body) => {
    const headers = {};
    const s = get();
    if (s) headers['X-Maow-Session'] = s;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(path, body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok && !d.error) d.error = `HTTP ${r.status}`;
    return d;
  };
  // The dashboard token lives in app.js's instance list ("maow.instances").
  // Browsers keep that per address (http:// and https:// count as two), so a
  // new address starts without it.
  const IKEY = 'maow.instances';
  const readInstances = () => { try { return JSON.parse(localStorage.getItem(IKEY) || 'null'); } catch { return null; } };
  const sameOrigin = (u) => String(u || '').replace(/\/$/, '') === location.origin;
  const activeInstance = () => {
    const p = readInstances();
    return p?.instances?.find((i) => i.id === p.activeId) || p?.instances?.[0] || null;
  };
  const saveToken = (token) => {
    let p = readInstances();
    if (!p?.instances?.length) p = { instances: [], activeId: null };
    let inst = p.instances.find((i) => sameOrigin(i.url));
    if (!inst) { inst = { id: p.instances.length ? `local-${Date.now()}` : 'local', name: 'This bot', url: location.origin, token: '' }; p.instances.push(inst); }
    inst.token = token;
    p.activeId = inst.id;
    try { localStorage.setItem(IKEY, JSON.stringify(p)); } catch { /* private window */ }
  };

  // Every script on the page (playlists, stats, listen room, downloads…) calls
  // fetch('/api/…') on its own and only app.js added the token, so with a
  // dashboard token everything else got 401. This script loads first: it adds
  // the saved token / Discord session to this bot's own /api/ calls.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
        const inst = activeInstance();
        const token = inst && sameOrigin(inst.url) ? inst.token : '';
        const session = get();
        if (token || session) {
          const h = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
          if (token && !h.has('Authorization')) h.set('Authorization', `Bearer ${token}`);
          if (session && !h.has('X-Maow-Session')) h.set('X-Maow-Session', session);
          init = { ...init, headers: h };
        }
      }
    } catch { /* leave the call as it was */ }
    return nativeFetch(input, init);
  };
  window.maowAuthQuery = () => {   // for <audio src> and links, which can't send headers
    const inst = activeInstance();
    const token = inst && sameOrigin(inst.url) ? inst.token : '';
    const p = new URLSearchParams();
    if (get()) p.set('session', get());
    else if (token) p.set('token', token);
    return p.toString();
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ALLOWED = new Set(['member', 'moderator', 'admin', 'owner']);

  const css = `
    body.maow-locked > *:not(#maow-gate){visibility:hidden!important}
    #maow-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;
      background:radial-gradient(ellipse at top,color-mix(in srgb,var(--accent,#5865F2) 22%,var(--bg,#1e1f22)),var(--bg,#1e1f22) 70%);color:var(--fg,#f2f3f5);font-family:inherit}
    #maow-gate .mg-card{width:min(420px,100%);background:var(--bg-card,var(--bg,#2b2d31));border:1px solid var(--border,#3f4147);border-radius:16px;padding:28px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.45)}
    #maow-gate .mg-mark{font-size:40px;line-height:1;margin-bottom:10px}
    #maow-gate h1{font-size:20px;margin:0 0 6px}
    #maow-gate p{margin:0 0 18px;color:var(--fg-muted,#b5bac1);font-size:14px;line-height:1.5}
    #maow-gate .mg-btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer;background:#5865F2;color:#fff;min-height:44px}
    #maow-gate .mg-btn:hover{filter:brightness(1.1)}
    #maow-gate .mg-btn.ghost{background:transparent;color:var(--fg-muted,#b5bac1);border:1px solid var(--border,#3f4147);font-weight:500;font-size:13px;padding:8px 14px;min-height:36px}
    #maow-gate .mg-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}
    #maow-gate .mg-user{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:14px}
    #maow-gate .mg-user img{width:40px;height:40px;border-radius:50%}
    #maow-gate .mg-err{color:#f87171;font-size:13px;margin-top:12px;min-height:1em}
    #maow-gate .mg-small{font-size:12px;color:var(--fg-muted,#b5bac1);margin-top:16px}
    .maow-sec{margin-top:18px;text-align:left}
    .maow-sec h3{font-size:14px;margin:0 0 10px}
    .maow-sec .ms-block{padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-input);margin-bottom:12px}
    .maow-sec .ms-line{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent);font-size:13px}
    .maow-sec .ms-line:first-of-type{border-top:0}
    .maow-sec .ms-meta{color:var(--fg-muted);font-size:12px;word-break:break-word}
    .maow-sec button{padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--fg);cursor:pointer;font-size:12px;white-space:nowrap}
    .maow-sec button.danger{border-color:#ef4444;color:#ef4444}
    .maow-sec .ms-pill{font-size:11px;padding:2px 8px;border-radius:99px;background:color-mix(in srgb,var(--accent) 25%,transparent)}
    .maow-sec .ms-ev-login{color:#22c55e}.maow-sec .ms-ev-failed,.maow-sec .ms-ev-denied{color:#f87171}
  `;
  const addStyle = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
  addStyle();

  const signIn = async (errEl) => {
    if (errEl) errEl.textContent = '';
    const d = await api('/api/auth/discord/start', {});
    if (d.authUrl) location.href = d.authUrl;
    else if (errEl) errEl.textContent = d.error || 'Could not start sign-in.';
  };

  const showGate = (state) => {
    window.maowLocked = true;
    const paint = () => {
      document.body.classList.add('maow-locked');
      let g = document.getElementById('maow-gate');
      if (!g) { g = document.createElement('div'); g.id = 'maow-gate'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true'); document.body.appendChild(g); }
      const why = (location.hash.match(/login_error=([^&]*)/) || [])[1];
      const user = state.user;
      let inner;
      if (state.guest && user) {
        inner = `
          <div class="mg-user">${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : ''}<strong>${esc(user.tag)}</strong></div>
          <h1>Waiting to be let in</h1>
          <p>You're signed in, but the owner hasn't given you access to the panel yet. You can already join the <b>Listen room</b> to see what's playing and add songs.</p>
          <div class="mg-row"><a class="mg-btn" href="/listen" style="text-decoration:none">🎧 Open the Listen room</a></div>
          <div class="mg-row"><button class="mg-btn ghost" data-act="recheck">↻ Check again</button><button class="mg-btn ghost" data-act="out">Sign out</button></div>`;
      } else if (state.tokenMode) {
        inner = `
          <div class="mg-mark">🔒</div>
          <h1>Sign in to MaowCore</h1>
          <p>This dashboard is protected.${state.oauth ? ' Sign in with Discord, or enter the dashboard token.' : ' Enter the dashboard token to continue.'}</p>
          ${state.oauth ? '<button class="mg-btn" data-act="in">Sign in with Discord</button><div class="mg-small" style="margin:14px 0 10px">or</div>' : ''}
          <form data-act="token" class="mg-row" style="margin-top:0">
            <input type="password" name="token" autocomplete="current-password" placeholder="Dashboard token" aria-label="Dashboard token"
              style="flex:1;min-width:0;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--border,#3f4147);background:var(--bg-input,#1e1f22);color:inherit;font:inherit">
            <button class="mg-btn" type="submit">Open</button>
          </form>
          <div class="mg-small">On Pterodactyl the token is in the server's files: <b>data/control-token.txt</b> (or the Dashboard token on the Startup tab).</div>`;
      } else {
        inner = `
          <div class="mg-mark">🔒</div>
          <h1>Sign in to MaowCore</h1>
          <p>This panel is locked. Sign in with your Discord account to continue.</p>
          <button class="mg-btn" data-act="in">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5A20.3 20.3 0 0 0 .2 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.1 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3 20.2 20.2 0 0 0-3.6-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>
            Sign in with Discord
          </button>
          <div class="mg-small">Only your username and avatar are read. No email, no servers.</div>`;
      }
      g.innerHTML = `<div class="mg-card">${inner}<div class="mg-err" aria-live="polite">${state.banned ? 'This account is banned from the panel.' : why ? esc(decodeURIComponent(why)) : ''}</div></div>`;
      const err = g.querySelector('.mg-err');
      g.querySelector('[data-act="in"]')?.addEventListener('click', () => signIn(err));
      g.querySelector('form[data-act="token"]')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = e.currentTarget.token.value.trim();
        if (!token) return;
        err.textContent = '';
        const r = await api('/api/auth/token-check', { token }).catch(() => ({ error: 'Could not reach the bot.' }));
        if (r.ok) { saveToken(token); location.reload(); } else err.textContent = r.error || 'That token is not right.';
      });
      g.querySelector('[data-act="recheck"]')?.addEventListener('click', () => location.reload());
      g.querySelector('[data-act="out"]')?.addEventListener('click', async () => { await api('/api/auth/logout', {}); drop(); location.reload(); });
      if (why) history.replaceState(null, '', location.pathname);
      g.querySelector('button')?.focus();
    };
    if (document.body) paint(); else document.addEventListener('DOMContentLoaded', paint, { once: true });
  };

  // Decide whether the panel may load. Fails open (shows the panel) if the
  // server can't be asked — the server still enforces the lock on every call.
  window.maowAuthReady = (async () => {
    let health;
    try { health = await (await fetch('/api/health')).json(); } catch { return true; }
    if (!health.requireLogin) {
      // Token-protected, no login lock: a saved token that works, or any
      // Discord sign-in (the server accepts either), opens the panel.
      if (!health.authRequired) return true;
      const inst = activeInstance();
      if (inst && !sameOrigin(inst.url)) return true;          // managing another bot from here
      if (inst?.token) {
        // Can't ask (network)? Open anyway: the server still checks every call.
        const r = await api('/api/auth/token-check', { token: inst.token }).catch(() => ({ unreachable: true }));
        if (r.ok || r.unreachable) return true;
      }
      const me = get() ? await api('/api/auth/me').catch(() => ({})) : {};
      if (me.user) return true;
      if (get()) drop();
      showGate({ tokenMode: true, oauth: !!health.oauthConfigured, banned: !!me.banned });
      return false;
    }
    const me = await api('/api/auth/me').catch(() => ({}));
    if (me.user && ALLOWED.has(me.rank)) return true;
    if (!me.user && get()) drop();   // expired / signed out elsewhere
    showGate({ user: me.user, guest: !!me.user && me.rank === 'guest', banned: !!me.banned });
    return false;
  })();

  // ===== Login page: Security card =====
  const when = (ts) => (ts ? new Date(ts).toLocaleString() : '—');
  const device = (ua) => {
    const s = String(ua || '');
    const b = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser';
    const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS' : /Mac OS/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : '';
    return os ? `${b} on ${os}` : b;
  };
  const EV = { login: 'Signed in', logout: 'Signed out', logout_all: 'Signed out everywhere', revoked: 'Signed out a device', denied: 'Blocked', failed: 'Failed sign-in' };

  const renderSecurity = async () => {
    const card = document.querySelector('#page-login .login-card');
    if (!card) return;
    let box = document.getElementById('maow-security');
    if (!box) { box = document.createElement('div'); box.id = 'maow-security'; box.className = 'maow-sec'; card.appendChild(box); }
    const me = await api('/api/auth/me').catch(() => ({}));
    if (!me.configured || !me.user) {
      box.innerHTML = me.configured ? '' : `<div class="ms-block small muted">${me.loginWanted ? '🔒 The login lock is switched on, but it only starts working once the client secret above is saved.' : ''}</div>`;
      if (!box.textContent.trim()) box.innerHTML = '';
      return;
    }
    const isOwner = me.rank === 'owner';
    const isAdmin = isOwner || me.rank === 'admin';
    const [sess, logs] = await Promise.all([api('/api/auth/sessions'), api(`/api/auth/logins?limit=20${isAdmin ? '&all=1' : ''}`)]);
    const lock = isOwner ? `
      <div class="ms-block">
        <h3>🔒 Login lock</h3>
        <div class="ms-line"><span>${me.requireLogin ? '<b>On</b>: only signed-in members can use the panel.' : '<b>Off</b>: anyone who can open this page can use it.'}</span>
        <button data-lock="${me.requireLogin ? '0' : '1'}" class="${me.requireLogin ? 'danger' : ''}">${me.requireLogin ? 'Turn off' : 'Turn on'}</button></div>
      </div>` : '';
    const devices = (sess.sessions || []).map((s) => `
      <div class="ms-line"><div><div>${esc(device(s.userAgent))} ${s.current ? '<span class="ms-pill">this device</span>' : ''}</div>
      <div class="ms-meta">Last active ${esc(when(s.lastSeenAt))} · ${esc(s.ip || '')}</div></div>
      ${s.current ? '' : `<button data-revoke="${esc(s.id)}">Sign out</button>`}</div>`).join('') || '<div class="ms-meta">No devices.</div>';
    const history = (logs.events || []).map((e) => `
      <div class="ms-line"><div><div class="ms-ev-${esc(e.event)}">${esc(EV[e.event] || e.event)}${logs.all && e.tag ? ` · ${esc(e.tag)}` : ''}</div>
      <div class="ms-meta">${esc(when(e.ts))} · ${esc(device(e.userAgent))}${e.detail && e.event !== 'login' ? ` · ${esc(e.detail)}` : ''}</div></div></div>`).join('') || '<div class="ms-meta">Nothing yet.</div>';
    box.innerHTML = `${lock}
      <div class="ms-block"><h3>💻 Signed-in devices</h3>${devices}
        <div style="margin-top:10px"><button class="danger" data-all>Sign out everywhere</button></div></div>
      <div class="ms-block"><h3>📜 Login history${logs.all ? ' (everyone)' : ''}</h3>${history}</div>`;
    box.querySelector('[data-lock]')?.addEventListener('click', async (e) => {
      const on = e.currentTarget.dataset.lock === '1';
      if (!on && !confirm('Turn the login lock off? Anyone who can open the panel could use it again.')) return;
      const r = await api('/api/auth/lock', { on });
      if (r.error) alert(r.error);
      renderSecurity();
    });
    box.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
      await api('/api/auth/sessions/revoke', { id: b.dataset.revoke });
      renderSecurity();
    }));
    box.querySelector('[data-all]')?.addEventListener('click', async () => {
      if (!confirm('Sign out on every device, including this one?')) return;
      await api('/api/auth/logout-all', {});
      drop();
      location.reload();
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.getElementById('page-login');
    if (!page) return;
    const check = () => { if (!page.classList.contains('hidden')) renderSecurity(); };
    new MutationObserver(check).observe(page, { attributes: true, attributeFilter: ['class'] });
    check();
  });
  window.maowSecurity = { refresh: renderSecurity };
  window.maowGate = { show: showGate };   // preview the sign-in screen (debugging)
})();
