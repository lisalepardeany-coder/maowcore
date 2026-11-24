// Slim layout for every theme (+ the Neon Sunset theme). Loaded last.
//
// In every theme (neon.css colours it with the theme's own palette):
//  - the 32-link sidebar becomes 6 hubs (a slim rail; a bottom bar on phones),
//  - each hub's pages show as a tab strip above the page,
//  - long page descriptions fold into an ⓘ tooltip.
// The original nav links stay in the page (hidden) and do the actual page
// switching, so every page keeps working exactly as before.
(() => {
  const HUBS = [
    { id: 'home', icon: '⌂', label: 'Home', pages: ['home', 'diagnostics', 'fleet'] },
    { id: 'music', icon: '♫', label: 'Music', pages: ['library', 'playlists', 'listen', 'soundboard', 'insights', 'wrapped'] },
    { id: 'server', icon: '⌬', label: 'Server', pages: ['server', 'members', 'channels', 'roles', 'welcome', 'reactions', 'moderation'] },
    { id: 'crew', icon: '♥', label: 'Crew', pages: ['social', 'economy', 'game-night', 'posts', 'profiles', 'reminders'] },
    { id: 'auto', icon: '⚡', label: 'Auto', pages: ['automation', 'custom-cmds', 'templates', 'backup', 'cleanup', 'control'] },
    { id: 'system', icon: '⚙', label: 'System', pages: ['settings', 'ranks', 'login', 'dev'] },
  ];
  // Shorter tab names than the old sidebar labels.
  const SHORT = { diagnostics: 'Status', playlists: 'Playlists', 'custom-cmds': 'Commands', templates: 'Template', reactions: 'Reaction roles', 'game-night': 'Game night', control: 'Control', backup: 'Backup', server: 'Overview', dev: 'Developer' };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } },
  };
  const navItem = (page) => document.querySelector(`.sidebar .nav-item[data-page="${page}"]`);
  const hubOf = (page) => HUBS.find((h) => h.pages.includes(page));
  const label = (page) => SHORT[page] || navItem(page)?.querySelector('.nav-label')?.textContent?.trim() || page;

  // First visit after this update: switch to the new look once. Picking any
  // other theme in Settings afterwards sticks.
  if (!store.get('maow.nx.v1')) {
    store.set('maow.nx.v1', '1');
    store.set('maow.theme', 'neon');
    store.set('maow.theme.global', 'neon');   // panel-plus.js re-applies this one
    document.body.setAttribute('data-theme', 'neon');
  }

  // ---------- build the rail + tab strip ----------
  const rail = document.createElement('nav');
  rail.id = 'nx-rail';
  rail.setAttribute('aria-label', 'Sections');
  rail.innerHTML = HUBS.map((h) => `<button type="button" data-hub="${h.id}" title="${h.label}"><span class="nx-ico">${h.icon}</span><span class="nx-lbl">${h.label}</span></button>`).join('')
    + '<div class="nx-spacer"></div><div class="nx-ver" id="nx-ver"></div>';
  // Desktop: inside the sidebar. Phone: the sidebar is hidden, so the rail
  // moves to <body> and becomes a bottom bar.
  const phone = window.matchMedia('(max-width: 768px)');
  const placeRail = () => (phone.matches ? document.body : document.querySelector('.sidebar'))?.appendChild(rail);
  placeRail();
  phone.addEventListener?.('change', placeRail);

  const tabs = document.createElement('div');
  tabs.id = 'nx-tabs';
  tabs.setAttribute('role', 'tablist');
  const main = document.querySelector('.main');
  main?.insertBefore(tabs, main.firstChild);

  const go = (page) => navItem(page)?.click();
  rail.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-hub]');
    if (!b) return;
    const hub = HUBS.find((h) => h.id === b.dataset.hub);
    const last = store.get(`maow.nx.last.${hub.id}`);
    go(hub.pages.includes(last) && navItem(last) ? last : hub.pages.find((p) => navItem(p)));
  });
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-page]');
    if (b) go(b.dataset.page);
  });

  let shownHub = null;
  const sync = () => {
    const page = document.querySelector('.sidebar .nav-item.active')?.dataset.page;
    const hub = hubOf(page);
    if (!hub) return;
    store.set(`maow.nx.last.${hub.id}`, page);
    rail.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.hub === hub.id));
    if (shownHub !== hub.id) {
      shownHub = hub.id;
      const pages = hub.pages.filter((p) => navItem(p));
      tabs.innerHTML = pages.map((p) => `<button type="button" role="tab" data-page="${p}">${label(p)}</button>`).join('');
      tabs.classList.toggle('solo', pages.length < 2);
    }
    tabs.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.page === page;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    const ver = document.getElementById('panel-version')?.textContent?.trim();
    if (ver && ver !== '—') document.getElementById('nx-ver').textContent = ver.replace(/^.*?(v?\d+\.\d+\.\d+).*$/, '$1');
  };
  const nav = document.querySelector('.sidebar .nav');
  if (nav) new MutationObserver(sync).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] });

  // ---------- fold page descriptions into ⓘ ----------
  // Only plain text blocks without an id: elements with an id are filled in
  // live by the app (status lines) and stay visible.
  const foldHints = () => {
    document.querySelectorAll('.page-head').forEach((head) => {
      if (head.dataset.nx) return;
      head.dataset.nx = '1';
      const hints = [...head.children].filter((c) => !c.id && !c.querySelector('[id], button, input, select')
        && (c.matches('p, .muted, .small') && !/^H\d$/.test(c.tagName)) && c.textContent.trim().length > 0);
      if (!hints.length) return;
      const text = hints.map((h) => h.textContent.trim()).join(' ');
      hints.forEach((h) => h.classList.add('nx-hint'));
      const info = document.createElement('span');
      info.className = 'nx-info';
      info.tabIndex = 0;
      info.setAttribute('aria-label', text);
      info.innerHTML = 'i<span class="nx-tip"></span>';
      info.querySelector('.nx-tip').textContent = text;
      const title = head.querySelector('h1, h2');
      title ? title.after(info) : head.prepend(info);
    });
  };

  // Top-bar song pill: in neon the progress line lives under the text;
  // other themes expect it back at the bottom of the pill.
  const npPill = document.getElementById('topbar-np');
  const npText = npPill?.querySelector('.topbar-np-text');
  const npLine = npPill?.querySelector('.topbar-np-progress');
  const placeNpLine = (on) => {
    if (!npLine || !npText) return;
    const home = on ? npText : npPill;
    if (npLine.parentElement !== home) home.appendChild(npLine);
  };

  // ---------- on/off with the theme ----------
  // ---------- readable text on the accent colour ----------
  // Tabs, the play button and primary buttons sit on the theme's accent.
  // Of the theme's own "on accent" colour, white and near-black, use the one
  // with the best contrast, so all 120+ themes stay readable.
  const rgbOf = (c) => {
    const probe = document.createElement('i');
    probe.style.color = c;
    document.body.appendChild(probe);
    const v = getComputedStyle(probe).color;
    probe.remove();
    const n = (v.match(/[\d.]+/g) || []).map(Number);
    return /color\(srgb/.test(v) ? n.slice(0, 3).map((x) => x * 255) : n.slice(0, 3);
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const fixOnAccent = () => {
    const body = document.body;
    body.style.removeProperty('--nx-on');
    const cs = getComputedStyle(body);
    const accent = cs.getPropertyValue('--accent').trim();
    if (!accent) return;
    const acc = rgbOf(accent);
    const own = cs.getPropertyValue('--nx-on').trim() || '#ffffff';
    const best = [own, '#ffffff', '#111111'].map((c) => [c, contrast(rgbOf(c), acc)]).sort((a, b) => b[1] - a[1])[0];
    // Keep the theme's own pick when it's already easy to read.
    if (best[0] !== own && contrast(rgbOf(own), acc) < 4.5) body.style.setProperty('--nx-on', best[0]);
  };

  // The slim layout is on for every theme; neon.css colours it per theme.
  const apply = () => {
    document.body.classList.add('nx');
    placeNpLine(true);
    // Theme packs inject their CSS just after the switch: check again once it's in.
    fixOnAccent();
    requestAnimationFrame(fixOnAccent);
    setTimeout(fixOnAccent, 150);
    foldHints();
    sync();
  };
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  // Some pages build their header later; fold those too.
  let foldTimer = 0;
  new MutationObserver(() => {
    if (!document.body.classList.contains('nx') || foldTimer) return;
    foldTimer = setTimeout(() => { foldTimer = 0; foldHints(); }, 300);
  }).observe(main || document.body, { childList: true, subtree: true });
  apply();
  setTimeout(sync, 400);

  // Autoplay button: lit while autoplay is on for the shown server.
  addEventListener('maow:state', (e) => {
    const m = e.detail;
    if (m?.type !== 'state') return;
    const btn = document.getElementById('autoplay-btn');
    if (!btn) return;
    const gid = document.getElementById('server-select')?.value;
    const q = (m.queues || []).find((x) => x.guildId === gid) || m.queues?.[0];
    const on = q ? !!q.autoplay : !!m.configs?.[gid]?.autoplay;
    btn.classList.toggle('on', on);
    btn.title = on ? 'Autoplay is on: similar songs keep playing when the queue ends. Click to turn off.' : 'Autoplay is off. Click to keep playing similar songs when the queue ends.';
  });

  // Fonts for the display headings.
  if (!document.getElementById('nx-font')) {
    const l = document.createElement('link');
    l.id = 'nx-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Anton&display=swap';
    document.head.appendChild(l);
  }
})();
