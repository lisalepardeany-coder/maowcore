// Quick theme switcher + reactive pizzeria effects. Reads live data through the
// 'maow:state' and 'maow:link' events that app.js dispatches.
(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } },
  };
  const PACK = window.maowThemePack || { themes: [], has: () => false, secrets: () => ({}) };
  // Top-bar menu grouped by the same categories as the Settings picker.
  const GROUPS = PACK.catalog
    ? PACK.categories.map((c) => [c, PACK.catalog.filter((x) => x.cat === c).map((x) => [x.id, x.name])]).filter(([, l]) => l.length)
    : [['Classic', [['discord', 'Discord'], ['linear', 'Linear'], ['spotify', 'Spotify'], ['glass', 'Glass']]],
      ['Horror', [['pizzeria', 'Pizzeria'], ['backrooms', 'Backrooms'], ['analog', 'Analog horror'], ['slasher', 'Slasher']]]];
  // Stays quiet behind the sign-in screen (login-gate.js sets maowLocked).
  const active = () => !window.maowLocked && !!HORROR[document.body.dataset.theme];

  // ===== Theme switch in the top bar =====
  const quick = document.createElement('select');
  quick.id = 'theme-quick';
  quick.title = 'Switch theme';
  quick.setAttribute('aria-label', 'Switch theme');
  for (const [label, list] of GROUPS) {
    const g = document.createElement('optgroup'); g.label = label;
    for (const [v, n] of list) g.appendChild(new Option(`🎨 ${n}`, v));
    quick.appendChild(g);
  }
  quick.value = document.body.dataset.theme;
  quick.addEventListener('change', () => window.maowApplyTheme?.(quick.value));
  document.querySelector('.topbar-controls')?.prepend(quick);

  const MASCOT = `<svg viewBox="0 0 240 320" aria-hidden="true">
    <path fill="#3a2c1c" d="M44 96 30 16l52 40q38-14 76 0l52-40-14 80q18 26 14 62c-6 54-46 86-90 86s-84-32-90-86q-4-36 14-62z"/>
    <path fill="#7c1f1a" d="M46 44l-5-13 21 17zM194 44l5-13-21 17z"/>
    <path fill="#d9c79a" d="M78 170q42-34 84 0 14 44-42 62-56-18-42-62z"/>
    <g fill="#141008"><ellipse cx="82" cy="122" rx="28" ry="31"/><ellipse cx="158" cy="122" rx="28" ry="31"/></g>
    <circle class="pz-eye" data-eye cx="82" cy="122" r="7"/><circle class="pz-eye" data-eye cx="158" cy="122" r="7"/>
    <path fill="#b43c30" d="M108 164h24l-12 15z"/>
    <path fill="none" stroke="#141008" stroke-width="4" d="M120 179v12M84 196h72M96 196v18M110 196v22M130 196v22M144 196v18"/>
    <g stroke="#6c6251" stroke-width="3"><path d="M30 172 4 164M30 188 4 196M210 172l26-8M210 188l26 8"/></g>
    <path fill="#b43c30" d="M78 246h84l16 22-28 8-30-14-30 14-28-8z"/>
    <path fill="#3a2c1c" d="M40 320q6-48 50-52h60q44 4 50 52z"/>
    <g fill="#8a8068"><circle cx="72" cy="66" r="4"/><circle cx="168" cy="66" r="4"/><circle cx="52" cy="150" r="4"/><circle cx="188" cy="150" r="4"/></g>
  </svg>`;

  const WANDERER = `<svg viewBox="0 0 240 320" aria-hidden="true"><path fill="#0e0b03" d="M120 6c20 0 32 16 32 38 0 16-7 28-16 34 22 6 34 22 38 48l14 130c1 12-13 14-16 2l-14-104-6 166h-22l-10-116-10 116H88l-6-166-14 104c-3 12-17 10-16-2l14-130c4-26 16-42 38-48-9-6-16-18-16-34 0-22 12-38 32-38z"/><circle data-eye class="pz-eye" cx="108" cy="42" r="4"/><circle data-eye class="pz-eye" cx="132" cy="42" r="4"/></svg>`;
  const BROADCASTER = `<svg viewBox="0 0 240 320" aria-hidden="true"><path fill="#1a2230" d="M30 320q4-90 60-104h60q56 14 60 104z"/><rect x="62" y="30" width="116" height="170" rx="46" fill="#c9d3dc"/><rect x="62" y="30" width="116" height="170" rx="46" fill="none" stroke="#111823" stroke-width="5"/><path fill="#111823" d="M86 92h26v10H86zM128 92h26v10h-26z"/><circle data-eye class="pz-eye" cx="99" cy="97" r="3"/><circle data-eye class="pz-eye" cx="141" cy="97" r="3"/><path fill="none" stroke="#111823" stroke-width="5" d="M92 158h56"/><path fill="#e3ebf2" d="M112 216h16l6 40-14 18-14-18z"/></svg>`;
  const STALKER = `<svg viewBox="0 0 240 320" aria-hidden="true"><path fill="#0b0506" d="M20 320q6-110 60-128 40-12 80 0 54 18 60 128z"/><path fill="#160a0c" d="M120 8c60 0 86 44 86 96 0 66-40 116-86 116S34 170 34 104C34 52 60 8 120 8z"/><path fill="#d9d0c2" d="M120 34c42 0 62 32 62 72 0 52-30 94-62 94s-62-42-62-94c0-40 20-72 62-72z"/><g fill="#0b0506"><path d="M78 96q20-14 36 4-6 22-24 18-14-4-12-22zM162 96q-20-14-36 4 6 22 24 18 14-4 12-22z"/><path d="M106 166h28l-6 12h-16z"/></g><circle data-eye class="pz-eye" cx="97" cy="104" r="3"/><circle data-eye class="pz-eye" cx="143" cy="104" r="3"/><path fill="none" stroke="#7a1015" stroke-width="3" d="M150 42l-12 26 10 14-10 20"/></svg>`;
  const HORROR = {
    pizzeria: { mascot: MASCOT, rec: '● REC', meter: 'POWER', alert: '⚡ POWER OUTAGE: connection to the bot lost. Reconnecting…' },
    backrooms: { mascot: WANDERER, rec: 'LEVEL 0', meter: 'SANITY', alert: '💡 LIGHTS OUT: connection to the bot lost. Reconnecting…' },
    analog: { mascot: BROADCASTER, rec: '▶ PLAY', meter: 'TAPE', noise: 0.05, alert: '📼 SIGNAL LOST: connection to the bot lost. Reconnecting…' },
    slasher: { mascot: STALKER, rec: '☎ ON THE LINE', meter: 'LIGHT', alert: '🔪 THE LINE WENT DEAD: connection to the bot lost. Reconnecting…' },
  };
  for (const t of PACK.themes) {
    HORROR[t.id] = { mascot: t.mascot || '', rec: t.rec, meter: t.meter, alert: t.alert, noise: t.noise, calm: !!t.calm, noScare: !!(t.noScare || t.calm || !t.mascot), idleSay: t.idleSay };
  }

  const add = (html) => { document.body.insertAdjacentHTML('beforeend', html); };
  add(`<div class="pz" id="pz-shade"></div><div class="pz" id="pz-scan"></div><div class="pz" id="pz-static"></div><div class="pz" id="pz-beam"></div>
    <div class="pz" id="pz-mascot">${MASCOT}</div>
    <div class="pz" id="pz-alert" role="alert">⚡ POWER OUTAGE: connection to the bot lost. Reconnecting…</div>
    <div class="pz" id="pz-say" role="status"></div>
    <div id="pz-scare" aria-hidden="true">${MASCOT}</div>
    <div id="pz-hud">
      <span id="pz-rec">● REC</span><span id="pz-cam"></span><b id="pz-clock"></b>
      <span title="This meter is the system's free RAM"><span id="pz-meter">POWER</span> <b id="pz-power">--%</b></span>
      <span title="Usage rises with RAM use">USAGE <span id="pz-usage"></span></span>
      <span class="pz-spacer"></span>
      <button class="pz-tog" id="pz-t-sound">🔊 Sound</button>
      <button class="pz-tog" id="pz-t-reduce" title="Turn off flicker, static and the mascot">🕯 Calm</button>
      <button class="pz-tog" id="pz-t-scare" title="Allow rare jumpscares when left idle">☠ Scares</button>
    </div>`);
  $('pz-usage').innerHTML = '<i></i>'.repeat(6);
  const root = document.documentElement.style;

  const prefs = {
    sound: store.get('maow.pz.sound') === '1',
    reduce: store.get('maow.pz.reduce') != null ? store.get('maow.pz.reduce') === '1' : matchMedia('(prefers-reduced-motion: reduce)').matches,
    scare: store.get('maow.pz.scare') === '1',
  };
  // Gentle mode (panel-revamp.js) forces calm + silent + no scares on top of
  // the saved choices, without changing them, so switching it off restores them.
  const gentle = () => document.documentElement.classList.contains('maow-gentle');
  const R = () => prefs.reduce || gentle();
  const S = () => prefs.sound && !gentle();

  // ===== Generated sound (only after opting in) =====
  // Each pack theme has its own ambience; the original four share the fan hum.
  let ac; let fan; let fanTheme = null;
  const brownFan = () => {
    const g = ac.createGain(); g.gain.value = 0.02; g.connect(ac.destination);
    const size = ac.sampleRate * 2; const buf = ac.createBuffer(1, size, ac.sampleRate); const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < size; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g); src.start();
    return { stop() { src.stop(); g.disconnect(); } };
  };
  const startFan = () => {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    ac.resume();
    const t = document.body.dataset.theme;
    if (!active() || (fan && fanTheme === t)) return;
    stopFan();
    fanTheme = t;
    fan = PACK.has(t) ? PACK.ambience(t, ac) : brownFan();
  };
  const stopFan = () => { if (fan) { fan.stop(); fan = null; fanTheme = null; } };
  // A pack theme's own one-shot sound, if it has one; else false.
  const themeSfx = (name) => S() && ac && active() && PACK.has(document.body.dataset.theme)
    && PACK.sfx(document.body.dataset.theme, name, ac);
  const beep = (f = 900, len = 0.04, vol = 0.04, type = 'square') => {
    if (!S() || !ac || !active()) return;
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + len);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + len);
  };

  // ===== Toggles =====
  const bind = (id, key, after) => {
    const b = $(id);
    const paint = () => b.setAttribute('aria-pressed', String(prefs[key]));
    paint();
    b.addEventListener('click', () => {
      prefs[key] = !prefs[key];
      store.set(`maow.pz.${key}`, prefs[key] ? '1' : '0');
      paint();
      after?.();
    });
  };
  const applyReduce = () => { document.body.classList.toggle('pz-reduce', R()); mood(); };
  bind('pz-t-sound', 'sound', () => (S() ? startFan() : stopFan()));
  bind('pz-t-reduce', 'reduce', applyReduce);
  bind('pz-t-scare', 'scare');

  // ===== Reactions =====
  let ping = 0; let linked = true; let lastActive = Date.now(); let glitchUntil = 0;
  const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 6; };

  function mood() {
    if (!active()) { root.setProperty('--pz-noise', 0); root.setProperty('--pz-dim', 0); return; }
    const glitch = Date.now() < glitchUntil;
    const lag = Math.max(0, Math.min(1, (ping - 150) / 650));
    const cfg = HORROR[document.body.dataset.theme];
    const base = cfg?.noise ?? 0.025;
    // Calm (non-horror) themes skip the static and the late-night dimming.
    const noise = R() || cfg?.calm ? 0 : Math.min(0.32, base + lag * 0.2 + (glitch ? 0.2 : 0) + (isNight() ? 0.015 : 0));
    root.setProperty('--pz-noise', noise);
    root.setProperty('--pz-dim', isNight() && !cfg?.calm ? 0.18 : 0);
    document.body.classList.toggle('pz-glitch', glitch && !R());
  }
  const burst = (ms = 450) => { glitchUntil = Date.now() + ms; mood(); setTimeout(mood, ms + 20); };

  function setLink(up) {
    if (up === linked) return;
    linked = up;
    // Calm themes (cozy, cute, minimal…) just show the friendly banner; the
    // dark "flashlight" outage is for horror. Ship themes keep their red alert.
    const t = document.body.dataset.theme;
    const quietOutage = HORROR[t]?.calm && !PACK.get?.(t)?.redAlert;
    document.body.classList.toggle('pz-outage', !up && !R() && !quietOutage);
    if (!up && !themeSfx('outage') && !quietOutage) beep(70, 1, 0.14, 'sawtooth');
    $('pz-alert').style.display = !up && (R() || quietOutage) ? 'block' : '';
  }
  addEventListener('maow:link', (e) => setLink(e.detail));
  addEventListener('maow:state', (e) => {
    const m = e.detail;
    if (m.type === 'log' && m.level === 'error' && active()) burst();
    if (m.type !== 'state') return;
    if (!window.maowPz?.holdOutage) setLink(true);
    const webPing = m.ping?.websocket; const rest = m.ping?.rest;
    ping = webPing > 0 ? webPing : rest || 0;
    document.body.classList.toggle('pz-playing', (m.queues || []).some((q) => !q.paused));
    const sys = m.stats?.system;
    if (sys?.memTotal) {
      const free = 100 - (sys.memUsed / sys.memTotal) * 100;
      $('pz-power').textContent = `${Math.round(free)}%`;
      const on = Math.max(1, Math.ceil((100 - free) / 100 * 6));
      [...$('pz-usage').children].forEach((el, i) => el.classList.toggle('off', i >= on));
      $('pz-usage').classList.toggle('low', free < 15);
    }
    mood();
  });

  // Page change works like flipping cameras.
  const camera = () => {
    const nav = document.querySelector('.nav-item.active');
    const items = [...document.querySelectorAll('.nav-item')];
    const name = nav?.querySelector('.nav-label')?.textContent?.trim() || nav?.textContent?.trim() || '';
    $('pz-cam').textContent = `CAM ${String(items.indexOf(nav) + 1).padStart(2, '0')} · ${name.toUpperCase()}`;
  };
  document.addEventListener('click', (e) => {
    if (!active()) return;
    if (e.target.closest('.nav-item')) { burst(180); if (!themeSfx('click')) beep(420, 0.09, 0.05, 'sawtooth'); setTimeout(camera, 40); }
    else if (e.target.closest('button') && !themeSfx('click')) beep();
  });

  // Mister Maow's eyes follow the cursor; the flashlight follows it in an outage.
  addEventListener('pointermove', (e) => {
    root.setProperty('--pz-x', `${e.clientX}px`);
    root.setProperty('--pz-y', `${e.clientY}px`);
    if (!active()) return;
    const dx = Math.max(-1, Math.min(1, (e.clientX / innerWidth - 0.8) * 2));
    const dy = Math.max(-1, Math.min(1, (e.clientY / innerHeight - 0.7) * 2));
    document.querySelectorAll('#pz-mascot [data-eye]').forEach((el) => { el.style.transform = `translate(${dx * 12}px, ${dy * 12}px)`; });
  }, { passive: true });

  // Left alone, he comes closer. Faster at night. Any activity sends him back.
  const stage = (n) => { if (document.body.dataset.pzStage !== String(n)) document.body.dataset.pzStage = n; };
  for (const ev of ['pointermove', 'keydown', 'pointerdown', 'scroll']) {
    addEventListener(ev, () => { lastActive = Date.now(); stage(0); }, { passive: true, capture: true });
  }
  const jumpscare = () => {
    if (!prefs.scare || R() || !active() || HORROR[document.body.dataset.theme]?.noScare) return;
    const s = $('pz-scare'); s.style.display = 'flex';
    beep(80, 0.9, 0.3, 'sawtooth'); beep(1500, 0.7, 0.16, 'sawtooth');
    setTimeout(() => { s.style.display = 'none'; lastActive = Date.now(); stage(0); }, 800);
  };
  setInterval(() => {
    if (!active() || R()) return;
    const idle = (Date.now() - lastActive) / 1000 * (isNight() ? 1.6 : 1);
    const before = document.body.dataset.pzStage;
    stage(idle > 180 ? 3 : idle > 90 ? 2 : idle > 45 ? 1 : 0);
    // Some themes say something once when you've been away a while.
    const line = HORROR[document.body.dataset.theme]?.idleSay;
    if (line && before !== '2' && document.body.dataset.pzStage === '2') say(line);
    // How often (Settings → Panel → Jumpscares): rare / normal / often (default).
    const freq = { rare: [300, 0.015], normal: [180, 0.04], often: [75, 0.12] }[store.get('maow.pz.freq') || 'often'] || [75, 0.12];
    if (idle > freq[0] && Math.random() < freq[1]) jumpscare();
  }, 5000);

  // Secrets: type a word anywhere outside an input.
  const say = (t) => {
    if (!active()) return;
    const s = $('pz-say'); s.textContent = t; s.style.display = 'block';
    beep(600, 0.2, 0.05, 'triangle');
    setTimeout(() => { s.style.display = 'none'; }, 4500);
  };
  const SECRETS = {
    maow: () => say('Mister Maow says: employees must wash their paws.'),
    pepperoni: () => say('🍕 One large pepperoni has been added to the night shift. Nobody ordered it.'),
    nightshift: () => { say('You are not on the schedule tonight.'); burst(800); },
  };
  let typed = '';
  addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, textarea, select') || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-12);
    for (const k of Object.keys(SECRETS)) if (typed.endsWith(k)) { typed = ''; SECRETS[k](); }
    const own = PACK.secrets(document.body.dataset.theme);
    // A secret is a message, or an action that returns one (e.g. loading a holo scene).
    for (const [k, text] of Object.entries(own)) {
      if (!typed.endsWith(k)) continue;
      typed = '';
      try { say(typeof text === 'function' ? text() : text); } catch { /* ignore a broken secret */ }
      burst(400);
    }
  });

  const clock = () => { $('pz-clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  clock(); setInterval(clock, 15000);

  // Reacts to theme changes from anywhere (settings, palette, this menu).
  let shownTheme = null;
  const onTheme = () => {
    quick.value = document.body.dataset.theme;
    document.body.classList.toggle('pz-on', active());
    const cfg = HORROR[document.body.dataset.theme];
    if (cfg && shownTheme !== document.body.dataset.theme) {
      shownTheme = document.body.dataset.theme;
      $('pz-mascot').innerHTML = cfg.mascot;
      $('pz-scare').innerHTML = cfg.mascot;
      $('pz-rec').textContent = cfg.rec;
      $('pz-meter').textContent = cfg.meter;
      $('pz-alert').textContent = cfg.alert;
    }
    if (!active()) { stopFan(); stage(0); document.body.classList.remove('pz-outage'); }
    else if (S() && ac) startFan();
    camera(); mood();
  };
  new MutationObserver(onTheme).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  applyReduce(); onTheme();
  // Phones: start with the drawer closed, and close it after choosing a page.
  const phone = () => matchMedia('(max-width: 900px)').matches;
  if (phone()) document.body.classList.add('sidebar-collapsed');
  document.addEventListener('click', (e) => {
    if (phone() && e.target.closest('.nav-item')) document.body.classList.add('sidebar-collapsed');
  });

  // Status frame: grow to fit its content, so the page has one scrollbar.
  const frame = $('status-frame');
  const fitFrame = () => {
    try {
      const h = frame.contentDocument?.documentElement?.scrollHeight;
      if (h > 200) frame.style.height = `${h}px`;
    } catch { /* keeps its default height */ }
  };
  frame?.addEventListener('load', () => { fitFrame(); setTimeout(fitFrame, 1500); });
  setInterval(fitFrame, 30000);

  window.maowPz = { setLink, jumpscare, stage, burst, holdOutage: false,
    play: (name) => !!(S() && ac && active() && PACK.play?.(name, ac)), setIdle: (s) => { lastActive = Date.now() - s * 1000; },
    // Re-apply after Gentle mode is switched on/off.
    refreshGentle: () => { applyReduce(); if (S() && ac) startFan(); else stopFan(); } };
})();
