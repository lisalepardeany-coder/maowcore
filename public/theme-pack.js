// Horror theme pack: 18 original themes inspired by horror film and game
// genres. Each theme is data (palette, mascot, HUD words, effects, sounds);
// this file turns that into CSS, a particle layer and generated audio.
// Loaded before app.js so the theme list knows about these ids.
// All sounds are synthesized live with Web Audio; no recordings are used.
(() => {
  // ===================== Mascots (original silhouettes) =====================
  const eyes = (list, r = 4) => list.map(([x, y]) => `<circle data-eye class="pz-eye" cx="${x}" cy="${y}" r="${r}"/>`).join('');
  const BODY = 'M80 138Q120 124 160 138L176 236 164 240 154 182 156 320H134L120 226 106 320H84L86 182 76 240 64 236Z';
  const svg = (inner) => `<svg viewBox="0 0 240 320" aria-hidden="true">${inner}</svg>`;
  const fig = ({ ink = '#070707', head, extra = '', front = '', e = [], r = 4 }) => svg(
    `<path fill="${ink}" d="${BODY}"/>${extra}${head ?? `<circle cx="120" cy="88" r="40" fill="${ink}"/>`}${front}${eyes(e, r)}`,
  );

  const M = {
    longhair: fig({
      ink: '#c9cfc6',
      head: '<path fill="#030403" d="M120 40c30 0 46 22 46 52v128l-8-16-8 22-8-24-8 28-8-26-6 28-6-28-8 26-8-28-8 24-8-22-8 16V92c0-30 16-52 46-52z"/>',
      e: [[132, 104]],
    }),
    xeno: svg(`<path fill="#101a20" d="${BODY}"/><path fill="#101a20" d="M92 104c-8-44 22-78 66-78 34 0 62 12 78 30-32-6-56 2-74 20-14 26-40 38-70 28z"/><path fill="none" stroke="#05080a" stroke-width="10" stroke-linecap="round" d="M150 300q60-10 70-80"/><g stroke="#1d2a2f" stroke-width="3"><path d="M100 160h40M100 174h40M102 188h36"/></g>${eyes([[150, 62]], 3)}`),
    patient: fig({
      ink: '#d8d6c8',
      head: '<circle cx="120" cy="88" r="42" fill="#d8d6c8"/>',
      front: '<g fill="none" stroke="#8e8b7c" stroke-width="7"><path d="M80 72q40 12 80 0M78 98q42 12 84 0M84 120q36 10 72 0"/><path d="M82 170q38 26 76 0M84 196q36-22 72 0" stroke-width="6"/></g><path fill="#0a0c0a" d="M98 82h16v10H98zM126 82h16v10h-16z"/>',
      e: [[106, 87], [134, 87]], r: 3,
    }),
    zombie: fig({
      ink: '#0b0807',
      head: '<circle cx="108" cy="94" r="38" fill="#0b0807"/>',
      extra: '<path fill="#0b0807" d="M150 146 234 150v16l-86 8z"/>',
      e: [[96, 90], [120, 86]],
    }),
    faceless: fig({ ink: '#26241f', head: '<ellipse cx="124" cy="86" rx="34" ry="44" fill="#3e3b35" transform="rotate(12 124 86)"/>' }),
    antler: fig({
      ink: '#050604',
      head: '<path fill="#d9d4c0" d="M98 62h44l-8 52-14 18-14-18z"/>',
      extra: '<g fill="none" stroke="#d9d4c0" stroke-width="6" stroke-linecap="round"><path d="M102 64Q80 40 70 12M84 36 62 30M76 22 92 10M138 64q22-24 32-52M156 36l22-6M164 22 148 10"/></g>',
      e: [[111, 82], [129, 82]],
    }),
    doll: svg(`<path fill="#a0365a" d="M84 150q36-14 72 0l34 170H50z"/><path fill="#f3dcd2" d="M76 176 56 252l12 4 22-62zM164 176l20 76-12 4-22-62z"/><circle cx="120" cy="96" r="52" fill="#f3dcd2"/><path fill="#3b2418" d="M66 96c0-40 24-62 54-62s54 22 54 62c-10-22-30-30-54-30s-44 8-54 30z"/><path fill="#a0365a" d="M120 40 92 24v32zm0 0 28-16v32z"/><path fill="none" stroke="#7a2a3a" stroke-width="3" d="M104 126q16 10 32 0M110 122v8M120 124v8M130 122v8"/>${eyes([[100, 98], [140, 98]], 8)}`),
    tallman: svg(`<path fill="#0b0b0b" d="M120 6c20 0 32 16 32 38 0 16-7 28-16 34 22 6 34 22 38 48l14 130c1 12-13 14-16 2l-14-104-6 166h-22l-10-116-10 116H88l-6-166-14 104c-3 12-17 10-16-2l14-130c4-26 16-42 38-48-9-6-16-18-16-34 0-22 12-38 32-38z"/>${eyes([[110, 42], [130, 42]], 3)}`),
    elder: svg(`<path fill="#120e22" d="${BODY}"/><circle cx="120" cy="84" r="46" fill="#1c1630"/><g fill="none" stroke="#1c1630" stroke-width="9" stroke-linecap="round"><path d="M92 116q-10 40 6 70M108 124q-6 46 4 80M132 124q8 46-4 80M148 116q12 40-6 70"/></g>${eyes([[98, 76], [120, 64], [142, 76], [108, 96], [132, 96]], 4)}`),
    beakmask: fig({
      ink: '#0a070b',
      head: '<circle cx="120" cy="92" r="34" fill="#1a1418"/><path fill="#1a1418" d="M140 96l58 38-60-14z"/><ellipse cx="120" cy="58" rx="66" ry="10" fill="#0a070b"/><path fill="#0a070b" d="M88 58l8-40h48l8 40z"/>',
      e: [[108, 90], [130, 90]], r: 6,
    }),
    clown: fig({
      ink: '#3b1d24',
      head: '<circle cx="86" cy="90" r="16" fill="#b3263a"/><circle cx="154" cy="90" r="16" fill="#b3263a"/><circle cx="120" cy="92" r="40" fill="#efe6dc"/><path fill="#b3263a" d="M96 58l24-50 24 50z"/><circle cx="120" cy="10" r="7" fill="#efe6dc"/><circle cx="120" cy="104" r="8" fill="#b3263a"/><path fill="none" stroke="#2a1014" stroke-width="4" d="M92 112q28 26 56 0"/>',
      front: '<path fill="#efe6dc" d="M78 138q14 18 28 0 14 18 28 0 14 18 28 0 0 14-42 18-42-4-42-18z"/>',
      e: [[106, 84], [134, 84]],
    }),
    thing: svg(`<path fill="#0a0f14" d="M60 320c-30-60-20-120 10-150 20-60 80-80 110-40 40 20 50 90 30 140-4 30-10 40-14 50z"/><g fill="none" stroke="#0a0f14" stroke-width="9" stroke-linecap="round"><path d="M70 190Q20 170 14 120M190 180q40-20 36-70M120 120q-10-60 20-100M90 140Q60 90 76 50"/></g>${eyes([[110, 180], [140, 196], [126, 220], [96, 212], [160, 160]], 5)}`),
    goat: fig({
      ink: '#1a120a',
      head: '<path fill="#2a1e12" d="M100 60h40l-6 60-14 16-14-16z"/><path fill="none" stroke="#d8c7a0" stroke-width="8" stroke-linecap="round" d="M104 62Q70 52 74 20M136 62q34-10 30-42"/><path fill="#2a1e12" d="M100 72 74 82l26 4zM140 72l26 10-26 4z"/>',
      e: [[110, 84], [130, 84]],
    }),
    fungal: fig({
      ink: '#14130e',
      head: '<circle cx="112" cy="96" r="38" fill="#14130e"/>',
      front: '<g fill="#8a6a3a"><path d="M80 80a22 22 0 0 1 40-10z"/><path d="M104 60a24 24 0 0 1 44 4z"/><path d="M120 92a20 20 0 0 1 32-8z"/><path d="M78 106a16 16 0 0 1 26-4z"/></g>',
      e: [[100, 104]],
    }),
    diver: fig({
      ink: '#1a2a30',
      head: '<circle cx="120" cy="92" r="50" fill="#3c5a64"/><circle cx="120" cy="96" r="26" fill="#071318"/><g fill="#2a434b"><circle cx="78" cy="96" r="8"/><circle cx="162" cy="96" r="8"/><circle cx="120" cy="50" r="8"/></g>',
      e: [[110, 96], [130, 96]], r: 4,
    }),
    bellhop: fig({
      ink: '#5a1418',
      head: '<circle cx="120" cy="92" r="38" fill="#e8d8c0"/><path fill="#8a1c22" d="M92 66h56V44H92z"/><path fill="#d6a548" d="M92 64h56v4H92z"/><path fill="none" stroke="#2a0c0c" stroke-width="3" d="M94 106q26 20 52 0M100 108v6M110 111v7M120 112v7M130 111v7M140 108v6"/>',
      front: '<g fill="#d6a548"><circle cx="120" cy="160" r="4"/><circle cx="120" cy="180" r="4"/><circle cx="120" cy="200" r="4"/></g>',
      e: [[106, 86], [134, 86]], r: 3,
    }),
    gasmask: fig({
      ink: '#121410',
      head: '<path fill="#121410" d="M74 96c0-44 20-66 46-66s46 22 46 66v40H74z"/><ellipse cx="120" cy="98" rx="34" ry="38" fill="#3a3d2c"/><circle cx="104" cy="90" r="12" fill="#0c0d08"/><circle cx="136" cy="90" r="12" fill="#0c0d08"/><rect x="110" y="114" width="20" height="26" rx="5" fill="#26281c"/>',
      e: [[104, 90], [136, 90]], r: 5,
    }),
    hatman: fig({
      ink: '#020203',
      head: '<circle cx="120" cy="92" r="36" fill="#020203"/><ellipse cx="120" cy="64" rx="70" ry="10" fill="#020203"/><path fill="#020203" d="M88 64l6-40h52l6 40z"/>',
      e: [[108, 92], [132, 92]], r: 3,
    }),
  };

  // ===================== Sound kit (Web Audio, all generated) =====================
  const noiseCache = new WeakMap();
  function kit(ac, out) {
    const live = []; const timers = new Set(); let dead = false;
    let echo = null;
    const buffers = noiseCache.get(ac) || {}; noiseCache.set(ac, buffers);
    const noiseBuffer = (color) => {
      if (buffers[color]) return buffers[color];
      const len = ac.sampleRate * 2; const b = ac.createBuffer(1, len, ac.sampleRate); const d = b.getChannelData(0);
      let l = 0; let b0 = 0; let b1 = 0; let b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'white') d[i] = w * 0.5;
        else if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
        else { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; }
      }
      return (buffers[color] = b);
    };
    const filt = (type, freq, q = 0.7) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };
    const lfo = (param, rate, depth) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.frequency.value = rate; g.gain.value = depth; o.connect(g).connect(param); o.start(); live.push(o);
    };
    const echoBus = () => {
      if (echo) return echo;
      const d = ac.createDelay(2); d.delayTime.value = 0.42; const fb = ac.createGain(); fb.gain.value = 0.38;
      d.connect(fb).connect(d); d.connect(out);
      return (echo = d);
    };
    const env = (g, t0, vol, attack, len) => {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    };
    const k = {
      // Looping filtered noise bed.
      noise({ color = 'brown', type = 'lowpass', freq = 1000, q = 0.7, gain = 0.02, lfoRate = 0, lfoDepth = 0, fRate = 0, fDepth = 0 } = {}) {
        const s = ac.createBufferSource(); s.buffer = noiseBuffer(color); s.loop = true;
        const f = filt(type, freq, q); const g = ac.createGain(); g.gain.value = gain;
        s.connect(f).connect(g).connect(out); s.start(); live.push(s);
        if (lfoRate) lfo(g.gain, lfoRate, lfoDepth);
        if (fRate) lfo(f.frequency, fRate, fDepth);
      },
      // Looping oscillator drone.
      tone({ f = 110, type = 'sine', gain = 0.01, cutoff = 0, lfoRate = 0, lfoDepth = 0, vib = 0 } = {}) {
        const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
        const g = ac.createGain(); g.gain.value = gain;
        if (cutoff) o.connect(filt('lowpass', cutoff)).connect(g); else o.connect(g);
        g.connect(out); o.start(); live.push(o);
        if (lfoRate) lfo(g.gain, lfoRate, lfoDepth);
        if (vib) lfo(o.frequency, 5, vib);
      },
      // One-shot tone with an envelope; optional pitch glide, filter and echo.
      hit(f, len = 0.2, vol = 0.05, type = 'sine', { to, attack = 0.005, cutoff, when = 0, wet = false } = {}) {
        const t0 = ac.currentTime + when;
        const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + len);
        const g = ac.createGain(); env(g, t0, vol, attack, len);
        (cutoff ? o.connect(filt('lowpass', cutoff)) : o).connect(g);
        g.connect(out); if (wet) g.connect(echoBus());
        o.start(t0); o.stop(t0 + len + 0.05);
      },
      // One-shot noise burst.
      burst(len = 0.05, vol = 0.05, { color = 'white', type = 'bandpass', freq = 2000, q = 1, when = 0, attack = 0.002 } = {}) {
        const t0 = ac.currentTime + when;
        const s = ac.createBufferSource(); s.buffer = noiseBuffer(color);
        const g = ac.createGain(); env(g, t0, vol, attack, len);
        s.connect(filt(type, freq, q)).connect(g).connect(out);
        s.start(t0, Math.random()); s.stop(t0 + len + 0.05);
      },
      // Repeat fn at a random interval between min and max ms.
      every(min, max, fn) { k.loop(() => { fn(); return min + Math.random() * (max - min); }, min + Math.random() * (max - min)); },
      // Repeat fn; its return value is the next delay in ms.
      loop(fn, first = 0) {
        const run = () => { if (dead) return; const next = fn(); const id = setTimeout(run, next); timers.add(id); };
        const id = setTimeout(run, first); timers.add(id);
      },
      stop() { dead = true; timers.forEach(clearTimeout); live.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }); },
    };
    return k;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // Shared one-shot sounds.
  const SFX = {
    blip: (k, f = 1200) => k.hit(f, 0.035, 0.03, 'square'),
    tick: (k) => k.burst(0.012, 0.08, { type: 'highpass', freq: 3200 }),
    type: (k) => { k.burst(0.02, 0.12, { freq: 2600, q: 0.8 }); k.hit(170, 0.03, 0.05, 'square'); },
    ping: (k) => k.hit(1350, 1.4, 0.05, 'sine', { wet: true }),
    tracker: (k) => k.hit(1046, 0.09, 0.04, 'square', { wet: true }),
    pluck: (k, f = 1318) => { k.hit(f, 0.7, 0.04, 'triangle'); k.hit(f * 2, 0.3, 0.012); },
    snap: (k) => k.burst(0.03, 0.15, { freq: 1800, q: 2 }),
    thud: (k, v = 0.12) => k.hit(90, 0.25, v, 'sine', { to: 45 }),
    chime: (k, f = 880) => { k.hit(f, 1.1, 0.03); k.hit(f * 2.76, 0.6, 0.01); },
    crackle: (k) => k.burst(0.08, 0.06, { freq: 3500, q: 0.5 }),
    bubble: (k) => k.hit(500, 0.12, 0.04, 'sine', { to: 1400 }),
    pop: (k) => { k.burst(0.03, 0.1, { freq: 900 }); k.hit(300, 0.06, 0.05, 'triangle', { to: 120 }); },
    clicker: (k) => { for (let i = 0; i < 4; i++) k.burst(0.008, 0.07, { freq: 1500, q: 4, when: i * 0.06 }); },
    bell: (k, f = 110, v = 0.06) => [1, 2.4, 3, 4.2, 5.4].forEach((m, i) => k.hit(f * m, 6 - i, v / (i + 1), 'sine', { attack: 0.01 })),
    siren: (k) => { k.hit(280, 2.4, 0.07, 'sawtooth', { to: 820, attack: 0.6, cutoff: 1400 }); k.hit(820, 2.6, 0.06, 'sawtooth', { to: 260, when: 2.3, attack: 0.1, cutoff: 1400 }); },
    flatline: (k) => k.hit(1000, 2.6, 0.05, 'sine', { attack: 0.01 }),
    alarm: (k) => { for (let i = 0; i < 6; i++) k.hit(i % 2 ? 520 : 760, 0.25, 0.05, 'square', { when: i * 0.28 }); },
    buzzer: (k) => k.hit(110, 1.2, 0.09, 'sawtooth', { cutoff: 900 }),
    static: (k) => k.burst(1.2, 0.1, { type: 'highpass', freq: 1500, attack: 0.01 }),
    moan: (k, v = 0.06) => k.hit(190, 3, v, 'sawtooth', { to: 110, attack: 0.8, cutoff: 500 }),
    groan: (k, v = 0.1) => k.hit(72, 2.6, v, 'sawtooth', { to: 46, attack: 0.4, cutoff: 300 }),
    screech: (k) => k.hit(1800, 0.8, 0.05, 'sawtooth', { to: 900, cutoff: 3000 }),
    thunder: (k) => k.burst(3.2, 0.22, { color: 'brown', type: 'lowpass', freq: 160, attack: 0.08 }),
    choir: (k) => [110, 131, 165, 196].forEach((f) => { k.hit(f, 3.6, 0.03, 'sawtooth', { attack: 1.6, cutoff: 800 }); k.hit(f * 1.005, 3.6, 0.02, 'sawtooth', { attack: 1.6, cutoff: 800 }); }),
    windDown: (k) => [1568, 1318, 1175, 1046, 880, 784].forEach((f, i) => k.hit(f, 0.8, 0.035, 'triangle', { when: i * (0.25 + i * 0.12) })),
    heartStop: (k) => { SFX.thud(k, 0.15); k.hit(55, 0.25, 0.1, 'sine', { to: 40, when: 0.2 }); k.hit(1000, 2.2, 0.04, 'sine', { when: 0.9 }); },
    calliopeDie: (k) => k.hit(523, 2.4, 0.04, 'square', { to: 130, cutoff: 1200 }),
    crow: (k) => { k.hit(900, 0.22, 0.04, 'sawtooth', { to: 600, cutoff: 1800 }); k.hit(860, 0.22, 0.035, 'sawtooth', { to: 560, cutoff: 1800, when: 0.3 }); },
    drip: (k, v = 0.02) => k.hit(rnd(1500, 2200), 0.09, v, 'sine', { to: 600 }),
    powerDown: (k) => k.hit(440, 2, 0.06, 'sawtooth', { to: 40, cutoff: 1200 }),
    tapeStop: (k) => k.hit(330, 1.5, 0.06, 'triangle', { to: 40 }),
    gameOver: (k) => [523, 494, 466, 440].forEach((f, i) => k.hit(f, i === 3 ? 0.9 : 0.22, 0.04, 'square', { when: i * 0.25 })),
    coin: (k) => { k.hit(988, 0.08, 0.035, 'square'); k.hit(1319, 0.25, 0.035, 'square', { when: 0.08 }); },
    console: (k) => { k.hit(1200, 0.05, 0.02); k.hit(1600, 0.06, 0.02, 'sine', { when: 0.06 }); },
    sparkle: (k) => { k.hit(2093, 0.3, 0.02); k.hit(2637, 0.3, 0.015, 'sine', { when: 0.05 }); },
    scratch: (k) => { k.burst(0.3, 0.08, { freq: 1200, q: 2 }); k.hit(600, 0.4, 0.03, 'sawtooth', { to: 100, cutoff: 900 }); },
    sad: (k) => { k.hit(660, 0.4, 0.03, 'triangle'); k.hit(494, 0.8, 0.03, 'triangle', { when: 0.35 }); },
  };

  // ===================== Themes =====================
  // pal: bg, elev, fg, accent, border, on (text on accent). light: light UI.
  // fx: canvas particles. fog/vig/tint/flicker: overlay layers.
  const T = [
    {
      id: 'cursedtape', name: 'Cursed Tape', sub: 'Haunted videotape, seven days', light: false,
      pal: ['#0a0d0b', '#141a16', '#dfe6dc', '#9fc9a8', '#2f3b33', '#08100a'], font: 'mono',
      bgcss: 'repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 40%, #18201b, #060807 75%)',
      swatch: 'repeating-linear-gradient(0deg, #3a4a3f 0 2px, #0a0d0b 2px 5px)',
      mascot: M.longhair, eye: '#e8f5e0', rec: '▶ TAPE 07', meter: 'SIGNAL', noise: 0.08,
      alert: '📺 THE TAPE ENDED: connection to the bot lost. Reconnecting…',
      css: 'body[data-theme="cursedtape"]::after{content:"";position:fixed;left:0;right:0;top:-12%;height:8%;z-index:899;pointer-events:none;background:linear-gradient(transparent,rgba(220,255,220,.07),transparent);animation:an-track 6s linear infinite}',
      amb: (k) => { k.noise({ color: 'white', type: 'highpass', freq: 3500, gain: 0.008 }); k.tone({ f: 60, type: 'sawtooth', gain: 0.004, cutoff: 220 }); k.every(6000, 14000, () => k.burst(rnd(0.1, 0.4), 0.03, { freq: 2500 })); },
      click: (k) => SFX.blip(k, 1250), outage: SFX.static,
      secrets: { seven: 'You have seven days to update the bot.', well: 'Something is climbing out of the well. It looks like a cat.' },
    },
    {
      id: 'derelict', name: 'Derelict Ship', sub: 'Dead starship, motion tracker', light: false,
      pal: ['#05090c', '#0e161b', '#d6e6ea', '#f2a93b', '#23343c', '#140b00'], font: 'mono', fx: 'dust',
      bgcss: 'radial-gradient(circle at 20% 30%, rgba(242,169,59,.06), transparent 40%), linear-gradient(#071016, #030507)',
      swatch: 'radial-gradient(circle at 70% 30%, #f2a93b 0 3px, transparent 4px), linear-gradient(#0e161b, #05090c)',
      mascot: M.xeno, eye: '#ff4a3a', rec: 'DECK 4', meter: 'O₂',
      alert: '🚨 DECOMPRESSION: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ freq: 180, gain: 0.05 }); k.tone({ f: 48, gain: 0.02 }); k.tone({ f: 96.3, gain: 0.007 }); k.every(2600, 2600, () => k.hit(1046, 0.07, 0.01, 'square')); k.every(10000, 22000, () => SFX.groan(k, 0.035)); },
      click: SFX.tracker, outage: SFX.alarm,
      secrets: { airlock: 'Airlock cycled. Nothing came in. Probably.', crew: 'Crew manifest: 7. Life signs detected: 8.' },
    },
    {
      id: 'asylum', name: 'Asylum', sub: 'Night vision, dying battery', light: false,
      pal: ['#070b08', '#111a13', '#d9ead9', '#8fe388', '#2a3d2c', '#041004'], font: 'mono', fx: 'dust',
      bgcss: 'repeating-linear-gradient(90deg, rgba(143,227,136,.035) 0 1px, transparent 1px 60px), radial-gradient(ellipse at 50% 30%, #0f1a11, #040604 80%)',
      swatch: 'radial-gradient(circle, #2f5a30, #070b08 70%)',
      mascot: M.patient, eye: '#eaffea', rec: '● REC · NV', meter: 'BATTERY', noise: 0.05,
      tint: ['#55ff6a', 'multiply', 0.1], flicker: 'fluoro',
      alert: '🔋 BATTERY DEAD: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.tone({ f: 120, type: 'sawtooth', gain: 0.004, cutoff: 900 }); k.noise({ color: 'white', type: 'bandpass', freq: 6000, gain: 0.003 }); k.every(4000, 9000, () => SFX.drip(k)); k.every(18000, 40000, () => SFX.thud(k, 0.05)); },
      click: SFX.tick, outage: SFX.flatline,
      secrets: { patient: 'Patient file 0451 is missing. So is patient 0451.', meds: 'Medication time. The cart is moving by itself.' },
    },
    {
      id: 'mansion', name: 'Survival Mansion', sub: 'Rain, save rooms, typewriters', light: false,
      pal: ['#0d0707', '#1a0f0e', '#efe2cf', '#c9a24a', '#4a2a24', '#170e02'], head: 'serif', fx: 'rain',
      bgcss: 'repeating-linear-gradient(90deg, rgba(201,162,74,.05) 0 2px, transparent 2px 44px), linear-gradient(#170b0a, #070404)',
      swatch: 'repeating-linear-gradient(90deg, #4a2a24 0 2px, #1a0f0e 2px 10px)',
      mascot: M.zombie, eye: '#ffd27a', rec: 'SAVE ROOM', meter: 'CONDITION',
      alert: '🩸 DANGER: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ color: 'pink', type: 'bandpass', freq: 1800, q: 0.4, gain: 0.035 }); k.noise({ freq: 400, gain: 0.02 }); k.every(1000, 1000, () => k.burst(0.008, 0.025, { type: 'highpass', freq: 4000 })); k.every(25000, 55000, () => SFX.thunder(k)); },
      click: SFX.type, outage: (k) => SFX.thud(k, 0.18),
      secrets: { herb: '🌿 You combined two herbs. Health restored.', typewriter: 'Progress saved. Ink ribbons left: 2.' },
    },
    {
      id: 'fogtown', name: 'Fog Town', sub: 'Endless fog, a siren, rust', light: true,
      pal: ['#8d8b86', '#e4e1da', '#1d1c1a', '#7a2a1c', '#9a958c', '#ffffff'], font: 'mono', fx: 'ash', fog: ['#f1efea', 0.2],
      bgcss: 'linear-gradient(#b9b7b1, #8d8b86)',
      swatch: 'linear-gradient(#e4e1da, #8d8b86)',
      mascot: M.faceless, eye: '#3b0f08', rec: '📻 RADIO ON', meter: 'STATIC',
      alert: '📢 THE SIREN: connection to the bot lost. Reconnecting…',
      css: 'body.pz-outage[data-theme="fogtown"]{--bg:#1a0806;--bg-elev:#2a110c;--bg-elev-2:#3a1a12;--bg-hover:#4a2216;--fg:#f0dcd2;--fg-muted:#d0b0a2;--fg-dim:#b09080;--border:#5a2a1c;--bg-input:#120604;--bg-input-2:#3a1a12;background:repeating-linear-gradient(90deg,#3a0c06 0 3px,#1a0806 3px 40px)!important;color-scheme:dark}body.pz-outage[data-theme="fogtown"] #tp-fog{opacity:0!important}',
      amb: (k) => { k.noise({ type: 'bandpass', freq: 500, q: 0.6, gain: 0.03, lfoRate: 0.07, lfoDepth: 0.02, fRate: 0.05, fDepth: 300 }); k.every(5000, 15000, () => k.burst(rnd(0.2, 0.9), 0.025, { freq: 2200, q: 0.6 })); },
      click: SFX.crackle, outage: SFX.siren,
      secrets: { radio: 'The radio crackles. Something is close.', fog: 'The fog is thicker today. The map has no roads.' },
    },
    {
      id: 'cabin', name: 'Cabin in the Woods', sub: 'Campfire, crickets, antlers', light: false,
      pal: ['#070a06', '#121810', '#e5e3d2', '#e0823a', '#2f3826', '#150800'], fx: 'embers', vig: '#000',
      bgcss: 'radial-gradient(ellipse at 50% 110%, rgba(224,130,58,.16), transparent 55%), repeating-linear-gradient(80deg, rgba(0,0,0,.25) 0 6px, transparent 6px 70px), linear-gradient(#0b1009, #050704)',
      swatch: 'radial-gradient(ellipse at 50% 100%, #e0823a, #121810 70%)',
      mascot: M.antler, eye: '#f3efc6', rec: 'NIGHT 3', meter: 'FIREWOOD',
      alert: '🌲 THE FIRE WENT OUT: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ type: 'bandpass', freq: 400, q: 0.5, gain: 0.015, lfoRate: 0.06, lfoDepth: 0.01 }); k.every(700, 1500, () => { for (let i = 0; i < 3; i++) k.hit(4400, 0.03, 0.006, 'sine', { when: i * 0.06 }); }); k.every(150, 900, () => k.burst(0.01, 0.03, { freq: rnd(2500, 4500) })); k.every(20000, 60000, () => SFX.snap(k)); },
      click: SFX.snap, outage: (k) => SFX.thud(k, 0.14),
      secrets: { map: 'You kicked the map into the creek. It was the only map.', cabin: 'The cabin door was open when you got here. You closed it.' },
    },
    {
      id: 'dollhouse', name: 'Dollhouse', sub: 'Music box, porcelain smiles', light: true,
      pal: ['#d9c3c3', '#fbf1ec', '#2a1a1e', '#a0365a', '#c9a9a9', '#ffffff'], head: 'serif', fx: 'dust',
      bgcss: 'radial-gradient(circle at 10px 10px, rgba(160,54,90,.18) 2px, transparent 3px) 0 0 / 40px 40px, repeating-linear-gradient(90deg, #e6d0cf 0 18px, #d9c3c3 18px 36px)',
      swatch: 'repeating-linear-gradient(90deg, #f3dcd2 0 6px, #d9a3b3 6px 12px)',
      mascot: M.doll, eye: '#1a0a10', rec: '♪ PLAYTIME', meter: 'WIND-UP',
      alert: '🎀 THE MUSIC BOX STOPPED: connection to the bot lost. Reconnecting…',
      amb: (k) => { const notes = [880, 1046, 1175, 1318, 1568, 1760]; k.every(700, 2200, () => SFX.pluck(k, pick(notes) * rnd(0.995, 1.005))); },
      click: (k) => SFX.pluck(k, 2093), outage: SFX.windDown,
      secrets: { play: '"Will you play with me?" — said nobody you can see.', dolly: 'Every doll is facing you now.' },
    },
    {
      id: 'footage', name: 'Found Footage', sub: 'Camcorder, night 21', light: false,
      pal: ['#0b0b0b', '#161616', '#ececec', '#e94b3c', '#3a3a3a', '#160000'], font: 'mono', noise: 0.06,
      tint: ['#000', 'normal', 0, 'grayscale(.85) contrast(1.05)'],
      bgcss: 'radial-gradient(ellipse at 50% 50%, #1a1a1a, #050505 80%)',
      swatch: 'linear-gradient(135deg, #2a2a2a, #0b0b0b)',
      mascot: M.tallman, eye: '#ffffff', rec: '● REC', meter: 'BATT',
      alert: '📹 TAPE CORRUPTED: connection to the bot lost. Reconnecting…',
      css: '[data-theme="footage"] #tp-frame{display:block}',
      amb: (k) => { k.tone({ f: 55, type: 'sawtooth', gain: 0.003, cutoff: 250 }); k.noise({ color: 'white', type: 'highpass', freq: 5000, gain: 0.005 }); },
      click: SFX.tick, outage: SFX.static,
      secrets: { night: 'Night 21. Footage shows the door opening at 3:14 AM.', camera: 'The camera was on the floor when you woke up. It was still recording.' },
    },
    {
      id: 'eldritch', name: 'Eldritch Deep', sub: 'Things with too many eyes', light: false,
      pal: ['#070611', '#120f22', '#e4def5', '#4fd1b0', '#2d2650', '#031410'], head: 'serif', fx: 'eyes', vig: '#1a0b33',
      bgcss: 'radial-gradient(ellipse at 50% 120%, rgba(79,209,176,.12), transparent 60%), radial-gradient(ellipse at 50% -20%, #1c1238, #070611 70%)',
      swatch: 'radial-gradient(circle, #4fd1b0 0 3px, #2d2650 4px 9px, #070611 10px)',
      mascot: M.elder, eye: '#4fd1b0', rec: 'DREAMING', meter: 'INSIGHT',
      alert: '🐙 IT AWAKENS: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.tone({ f: 41, gain: 0.03 }); k.tone({ f: 43.2, gain: 0.03 }); k.noise({ freq: 120, gain: 0.03 }); k.every(12000, 30000, () => SFX.moan(k, 0.03)); },
      click: SFX.bubble, outage: SFX.moan,
      secrets: { deep: 'The tide came in, though there is no sea here.', eyes: 'You counted the eyes. There is one more now.' },
    },
    {
      id: 'gothic', name: 'Blood Moon', sub: 'Gothic hunt, cathedral bells', light: false,
      pal: ['#08060a', '#151018', '#ece3e8', '#c8324a', '#3b2a33', '#ffffff'], head: 'serif', fx: 'ash', fog: ['#5a0f18', 0.22], vig: '#000', flicker: 'candle',
      bgcss: 'radial-gradient(circle at 80% 12%, rgba(200,50,74,.35) 0 50px, rgba(200,50,74,.08) 52px 140px, transparent 142px), linear-gradient(#120a10, #050306)',
      swatch: 'radial-gradient(circle at 70% 30%, #c8324a 0 7px, transparent 8px), linear-gradient(#151018, #08060a)',
      mascot: M.beakmask, eye: '#ffcf6a', rec: 'BLOOD MOON', meter: 'BLOOD',
      alert: '🔔 THE BELL TOLLS: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ type: 'bandpass', freq: 450, q: 0.6, gain: 0.025, lfoRate: 0.05, lfoDepth: 0.015 }); k.tone({ f: 55, type: 'triangle', gain: 0.006 }); k.every(25000, 45000, () => SFX.bell(k, 110, 0.03)); },
      click: (k) => SFX.chime(k, 660), outage: (k) => SFX.bell(k, 82, 0.09),
      secrets: { hunt: 'The night of the hunt has begun.', moon: 'The moon is closer than it was an hour ago.' },
    },
    {
      id: 'carnival', name: 'Dead Carnival', sub: 'Calliope, clowns, empty tents', light: false,
      pal: ['#0c0608', '#1a0e12', '#f6e8dc', '#e8b040', '#4d2730', '#1a0e00'], fx: 'confetti',
      bgcss: 'repeating-linear-gradient(90deg, rgba(179,38,58,.16) 0 40px, rgba(246,232,220,.05) 40px 80px), linear-gradient(#170a0e, #070304)',
      swatch: 'repeating-linear-gradient(90deg, #b3263a 0 8px, #f6e8dc 8px 16px)',
      mascot: M.clown, eye: '#fff1a6', rec: 'SHOWTIME', meter: 'TICKETS',
      alert: '🎪 THE LIGHTS WENT DOWN: connection to the bot lost. Reconnecting…',
      amb: (k) => {
        const tune = [392, 523, 622, 523, 349, 466, 587, 466, 311, 415, 523, 415, 294, 392, 494, 392];
        const bass = [131, 116, 104, 98];
        let i = 0;
        k.every(440, 440, () => {
          const wob = rnd(0.97, 1.01);
          if (i % 4 === 0) k.hit(bass[(i / 4) % 4] * wob, 0.3, 0.02, 'triangle');
          k.hit(tune[i % 16] * wob, 0.32, 0.012, 'square', { cutoff: 1600 });
          k.hit(tune[i % 16] * 2 * wob, 0.3, 0.008, 'triangle');
          i++;
        });
      },
      click: SFX.pop, outage: SFX.calliopeDie,
      secrets: { balloon: '🎈 A balloon floats past. You did not buy one.', clown: 'The clown waves. You are the only one in the tent.' },
    },
    {
      id: 'outpost', name: 'Frozen Outpost', sub: 'Blizzard, isolation, paranoia', light: false,
      pal: ['#050a10', '#0e1822', '#e6f2fa', '#8fd3ff', '#24384a', '#031220'], font: 'mono', fx: 'snow', fog: ['#dff2ff', 0.08],
      bgcss: 'radial-gradient(ellipse at 50% 0, #142636, #050a10 70%)',
      swatch: 'radial-gradient(circle at 30% 30%, #fff 0 2px, transparent 3px) 0 0 / 10px 10px, linear-gradient(#24384a, #050a10)',
      mascot: M.thing, eye: '#ff6b5a', rec: 'STATION 9', meter: 'HEAT',
      alert: '❄ GENERATOR DOWN: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ type: 'bandpass', freq: 700, q: 1.2, gain: 0.04, lfoRate: 0.11, lfoDepth: 0.03, fRate: 0.08, fDepth: 400 }); k.every(15000, 35000, () => k.burst(0.06, 0.08, { freq: 5000, q: 3 })); },
      click: SFX.tick, outage: (k) => SFX.thud(k, 0.16),
      secrets: { test: 'Blood test results: everyone in this server is human. Probably.', dogs: 'The dogs are quiet tonight. Too quiet.' },
    },
    {
      id: 'coven', name: 'Coven', sub: 'Folk horror, candles, the goat', light: false,
      pal: ['#0a0805', '#17120b', '#efe4cc', '#c4823c', '#3d2f1d', '#120900'], head: 'serif', fx: 'embers', vig: '#000', flicker: 'candle',
      bgcss: 'radial-gradient(circle at 50% 50%, transparent 0 140px, rgba(196,130,60,.08) 141px 143px, transparent 144px), radial-gradient(ellipse at 50% 60%, #1a130a, #050402 75%)',
      swatch: 'radial-gradient(circle, #c4823c 0 3px, #17120b 4px)',
      mascot: M.goat, eye: '#ffb347', rec: 'THE WOODS', meter: 'CANDLES',
      alert: '🕯 THE CANDLES DIED: connection to the bot lost. Reconnecting…',
      amb: (k) => { [110, 131, 165].forEach((f) => k.tone({ f, type: 'sawtooth', gain: 0.004, cutoff: 700, lfoRate: rnd(0.05, 0.12), lfoDepth: 0.002 })); k.every(20000, 50000, () => SFX.crow(k)); },
      click: (k) => SFX.thud(k, 0.06), outage: SFX.choir,
      secrets: { goat: 'The goat would like a word with you. Do not answer.', witch: 'Someone drew a circle around your keyboard.' },
    },
    {
      id: 'infection', name: 'Infection', sub: 'Spores, quarantine, clicking', light: false,
      pal: ['#070806', '#121410', '#e7e6d6', '#d9822b', '#33362a', '#140a00'], fx: 'spores', tint: ['#c9b060', 'multiply', 0.06],
      bgcss: 'radial-gradient(circle at 15% 80%, rgba(138,106,58,.18), transparent 30%), radial-gradient(circle at 85% 20%, rgba(138,106,58,.12), transparent 25%), linear-gradient(#0e100b, #050604)',
      swatch: 'radial-gradient(circle at 30% 60%, #8a6a3a 0 4px, transparent 5px), radial-gradient(circle at 70% 30%, #d9822b 0 3px, transparent 4px), #121410',
      mascot: M.fungal, eye: '#ffd08a', rec: '☣ QUARANTINE', meter: 'FILTER',
      alert: '☣ QUARANTINE BREACH: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ freq: 300, gain: 0.02 }); k.every(3000, 7000, () => SFX.drip(k)); k.every(10000, 25000, () => { for (let i = 0; i < 8; i++) k.burst(0.008, 0.05, { freq: 1500, q: 4, when: i * 0.07 + Math.random() * 0.03 }); }); },
      click: SFX.clicker, outage: SFX.screech,
      secrets: { mask: 'Filter replaced. You can breathe for another hour.', spores: 'The spores are thicker near the server room.' },
    },
    {
      id: 'abyss', name: 'Abyss Station', sub: 'Deep sea, sonar, pressure', light: false,
      pal: ['#020a10', '#08161f', '#d8eef5', '#3fd0e0', '#183442', '#021216'], fx: 'bubbles', vig: '#000814',
      bgcss: 'radial-gradient(ellipse at 50% -10%, rgba(63,208,224,.14), transparent 55%), linear-gradient(#04141e, #01050a)',
      swatch: 'radial-gradient(circle at 50% 0, #3fd0e0, #08161f 60%, #020a10)',
      mascot: M.diver, eye: '#9ff6ff', rec: 'DEPTH 3,400 M', meter: 'HULL',
      alert: '🌊 HULL BREACH: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ freq: 90, gain: 0.06 }); k.every(7000, 7000, () => k.hit(1350, 1.4, 0.02, 'sine', { wet: true })); k.every(4000, 12000, () => { for (let i = 0; i < 4; i++) k.hit(rnd(400, 800), 0.08, 0.015, 'sine', { to: 1200, when: i * 0.09 }); }); },
      click: SFX.ping, outage: SFX.groan,
      secrets: { sonar: 'Sonar contact. It is larger than the station.', surface: 'The surface is 3.4 km up. The elevator is not answering.' },
    },
    {
      id: 'hotel', name: 'Grand Hotel', sub: 'Empty ballroom, endless halls', light: false,
      pal: ['#0e0606', '#1c0e0c', '#f3e6d3', '#d6a548', '#4a2620', '#170e00'], head: 'serif', fx: 'dust',
      bgcss: 'linear-gradient(45deg, rgba(214,165,72,.07) 25%, transparent 25% 75%, rgba(214,165,72,.07) 75%) 0 0 / 46px 46px, linear-gradient(-45deg, rgba(140,28,34,.18) 25%, transparent 25% 75%, rgba(140,28,34,.18) 75%) 0 0 / 46px 46px, #120706',
      swatch: 'linear-gradient(45deg, #d6a548 25%, transparent 25% 75%, #d6a548 75%) 0 0 / 12px 12px, #5a1418',
      mascot: M.bellhop, eye: '#ffdf8a', rec: 'FLOOR 13', meter: 'VACANCY',
      alert: '🛎 FRONT DESK UNMANNED: connection to the bot lost. Reconnecting…',
      amb: (k) => {
        const chords = [[220, 262, 330], [196, 247, 294], [175, 220, 262], [165, 208, 247]];
        let i = 0;
        k.tone({ f: 60, gain: 0.006 });
        k.every(6000, 8000, () => { chords[i++ % 4].forEach((f) => k.hit(f, 4.2, 0.012, 'triangle', { attack: 1.4, cutoff: 600 })); });
      },
      click: (k) => SFX.chime(k, 1320), outage: (k) => { SFX.chime(k, 660); SFX.thud(k, 0.16); },
      secrets: { checkout: 'Checkout is at 11. It has been 11 for a very long time.', room: 'Room service knocked. You did not order room service.' },
    },
    {
      id: 'gameroom', name: 'The Game Room', sub: 'Dirty tiles, a ticking timer', light: false,
      pal: ['#0b0c09', '#171913', '#e8e6d8', '#b8c43a', '#3a3d2c', '#121400'], font: 'mono', flicker: 'fluoro', vig: '#000',
      bgcss: 'linear-gradient(rgba(0,0,0,.5) 2px, transparent 2px) 0 0 / 48px 48px, linear-gradient(90deg, rgba(0,0,0,.5) 2px, transparent 2px) 0 0 / 48px 48px, radial-gradient(ellipse at 50% 30%, #2a2c20, #0b0c09 75%)',
      swatch: 'linear-gradient(#000 1px, transparent 1px) 0 0 / 8px 8px, linear-gradient(90deg, #000 1px, transparent 1px) 0 0 / 8px 8px, #3a3d2c',
      mascot: M.gasmask, eye: '#e9f37a', rec: '⏱ GAME ON', meter: 'TIME',
      alert: '⏱ TIME IS UP: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.every(1000, 1000, () => k.burst(0.015, 0.05, { type: 'highpass', freq: 2500 })); k.tone({ f: 120, type: 'sawtooth', gain: 0.003, cutoff: 800 }); k.every(5000, 11000, () => SFX.drip(k, 0.025)); },
      click: SFX.tick, outage: SFX.buzzer,
      secrets: { game: 'Rules: fix the bug before the timer ends. Good luck.', tape: 'There is a tape recorder on the desk. It just says "update your dependencies."' },
    },
    {
      id: 'paralysis', name: 'Sleep Paralysis', sub: '3:33 AM, someone in the corner', light: false,
      pal: ['#040406', '#0e0e14', '#dcdbe8', '#8a7ad6', '#24233a', '#0a0814'], vig: '#000', flicker: 'breath',
      bgcss: 'radial-gradient(ellipse at 85% 60%, rgba(0,0,0,.9), transparent 30%), radial-gradient(ellipse at 50% 40%, #12121c, #020203 80%)',
      swatch: 'radial-gradient(ellipse at 70% 60%, #000 0 6px, transparent 9px), radial-gradient(#24233a, #040406)',
      mascot: M.hatman, eye: '#ff3b3b', rec: '3:33 AM', meter: 'BREATH',
      alert: '🛏 YOU CAN\'T MOVE: connection to the bot lost. Reconnecting…',
      amb: (k) => {
        k.noise({ color: 'pink', type: 'bandpass', freq: 900, q: 0.5, gain: 0.018, lfoRate: 0.22, lfoDepth: 0.018 });
        // The heart beats faster the longer the panel is left alone.
        k.loop(() => {
          const stage = Number(document.body.dataset.pzStage || 0);
          k.hit(60, 0.18, 0.09, 'sine', { to: 40 }); k.hit(55, 0.16, 0.06, 'sine', { to: 38, when: 0.2 });
          return 1150 - stage * 230;
        }, 500);
      },
      click: (k) => SFX.thud(k, 0.05), outage: SFX.heartStop,
      secrets: { wake: 'You tried to wake up. You are still here.', hatman: 'He tips his hat. He has been standing there all night.' },
    },
  ];
  // ===================== Categories =====================
  const CATS = ['Classic', 'Horror · Games', 'Horror · Movies & Books', 'Horror · Analog & Internet', 'Horror · Space',
    'AI & Tech', 'Starships · Exploration', 'Space & Sci-Fi', 'Space Movies & Shows', 'Space Games', 'Cozy & Nature',
    'Seasonal', 'Cute & Pastel', 'Minimal & Clean', 'Pixel & Arcade', 'Retro & Fantasy'];
  const HG = 'Horror · Games'; const HM = 'Horror · Movies & Books'; const HA = 'Horror · Analog & Internet';
  const CAT_OF = {
    mansion: HG, fogtown: HG, asylum: HG, infection: HG, abyss: HG, derelict: HG, gothic: HG,
    cursedtape: HM, cabin: HM, eldritch: HM, carnival: HM, outpost: HM, coven: HM, hotel: HM, gameroom: HM, dollhouse: HM,
    footage: HA, paralysis: HA,
  };
  for (const t of T) t.cat = CAT_OF[t.id];
  // Extra themes (AI, space, cozy, retro) live in theme-extras.js.
  // More packs (space etc.) register themselves in window.MAOW_THEME_PACKS.
  const helpers = { SFX, rnd, pick, svg, eyes, fig, BODY, M };
  for (const load of [window.MAOW_THEME_EXTRAS, ...(window.MAOW_THEME_PACKS || [])]) {
    if (typeof load !== 'function') continue;
    try {
      const seen = new Set(T.map((t) => t.id));
      T.push(...(load(helpers) || []).filter((t) => t?.id && t.pal && !seen.has(t.id)));
    } catch (e) { console.warn('[theme-pack] extra pack failed', e); }
  }
  // The panel's built-in themes, so the picker can list everything in one place.
  const BASE = [
    { id: 'discord', name: 'Discord', sub: 'Native, blurple', cat: 'Classic' },
    { id: 'linear', name: 'Linear', sub: 'Minimal, focused', cat: 'Classic' },
    { id: 'spotify', name: 'Spotify', sub: 'Music-first, green', cat: 'Classic' },
    { id: 'glass', name: 'Glass', sub: 'Frosted, lush', cat: 'Classic' },
    { id: 'pizzeria', name: 'Pizzeria', sub: 'Night-shift security desk', cat: HG, tags: ['sound', 'mascot', 'scares'] },
    { id: 'slasher', name: 'Slasher', sub: 'Blood red, film grain', cat: HM, tags: ['sound', 'mascot', 'scares'] },
    { id: 'backrooms', name: 'Backrooms', sub: 'Yellow rooms, buzzing lights', cat: HA, tags: ['sound', 'mascot', 'scares'] },
    { id: 'analog', name: 'Analog horror', sub: 'VHS static, lost signal', cat: HA, tags: ['sound', 'mascot', 'scares'] },
  ];
  const tagsOf = (t) => [t.amb && 'sound', (t.fx || t.fog || t.flicker) && 'effects', t.fx === 'warp' && 'warp', t.mascot && 'mascot', t.mascot && !t.calm && !t.noScare && 'scares',
    t.tracker && 'tracker', t.redAlert && 'redalert', t.voice && 'voice'].filter(Boolean);
  const CATALOG = [...BASE, ...T.map((t) => ({ id: t.id, name: t.name, sub: t.sub, cat: t.cat || 'Retro & Fantasy', tags: tagsOf(t) }))]
    .sort((a, b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat));
  const byId = Object.fromEntries(T.map((t) => [t.id, t]));

  // ===================== CSS from data =====================
  const mono = "'Courier New', ui-monospace, monospace";
  const serif = "Georgia, 'Times New Roman', serif";
  const cssFor = (t) => {
    const [bg, elev, fg, accent, border, on] = t.pal;
    const s = `[data-theme="${t.id}"]`;
    const ok = t.light ? ['#256635', '#a3201a', '#7c5206'] : ['#6fd28a', '#ff6b6b', '#f0c35a'];
    const mix = (a, p, b) => `color-mix(in srgb, ${a} ${p}%, ${b})`;
    return `${s}{--bg:${bg};--bg-elev:${elev};--bg-elev-2:${mix(elev, 90, fg)};--bg-hover:${mix(elev, 82, fg)};--bg-input:${mix(bg, 82, t.light ? '#fff' : '#000')};--bg-input-2:${mix(elev, 86, fg)};
--fg:${fg};--fg-muted:${mix(fg, 78, elev)};--fg-dim:${mix(fg, 64, elev)};--accent:${accent};--accent-hover:${mix(accent, 80, '#000')};--accent-soft:${mix(accent, 18, 'transparent')};
--success:${ok[0]};--danger:${ok[1]};--warning:${ok[2]};--info:${accent};--border:${border};--border-soft:${mix(fg, 11, 'transparent')};
--shadow-card:0 2px 0 rgba(0,0,0,${t.light ? '.18' : '.55'});--shadow-pop:0 14px 40px rgba(0,0,0,${t.light ? '.35' : '.75'});--radius:2px;--radius-lg:3px;
${t.font === 'mono' ? `--font:${mono};--font-mono:${mono};` : ''}color-scheme:${t.light ? 'light' : 'dark'}}
${s} select,${s} input,${s} textarea{color-scheme:${t.light ? 'light' : 'dark'}}
body${s}{background:${t.bgcss};background-attachment:fixed}
${s} .bg-ambient{display:none}${s} .main{background:transparent}
${s} .topbar,${s} .sidebar{background:${mix(elev, 92, bg)}}
${s} .primary{color:${on};font-weight:700}
${s} .card,${s} .stat,${s} .now-playing{border:1px solid var(--border)}
${s} #pz-hud,${s} #pz-say{background:var(--bg-elev)}${s} .pz-tog{background:var(--bg-elev-2)}${s} .pz-tog[aria-pressed="true"]{background:var(--accent);color:${on}}${s} #pz-usage i.off{background:var(--bg-input-2)}
${t.light ? `${s} #pz-scan{opacity:.35}` : ''}
${t.head === 'serif' || t.font === 'serif' ? `${s} .page-head h1,${s} .page-head h2,${s} .np-title-big,${s} .card-head h3{font-family:${serif};letter-spacing:.02em}` : `${s} .page-head h1{text-transform:uppercase;letter-spacing:.05em}`}
${s} #pz-mascot .pz-eye,${s} #pz-scare .pz-eye{fill:${t.eye}}
.swatch-preview[data-style="${t.id}"]{background:${t.swatch}}
${t.calm ? `${s} #pz-scan,${s} #pz-static{display:none!important}` : ''}
${!t.mascot ? `${s} #pz-mascot{display:none!important}` : ''}
${!t.mascot || t.calm || t.noScare ? `${s} #pz-t-scare{display:none}` : ''}
${t.css || ''}`;
  };
  const style = document.createElement('style');
  style.id = 'tp-style';
  style.textContent = `${T.map(cssFor).join('\n')}
.theme-swatch{color:var(--fg)}
#tp-fx,#tp-fog,#tp-vig,#tp-tint,#tp-frame{position:fixed;inset:0;pointer-events:none;display:none}
#tp-tint{z-index:895}#tp-fx{z-index:896}#tp-fog{z-index:896}#tp-vig{z-index:897}#tp-frame{z-index:903}
body.tp-on #tp-fx{display:block}
#tp-fog{inset:-20%;background:radial-gradient(ellipse 40% 30% at 30% 40%,var(--tp-fog),transparent 70%),radial-gradient(ellipse 45% 35% at 70% 65%,var(--tp-fog),transparent 70%),radial-gradient(ellipse 35% 25% at 50% 20%,var(--tp-fog),transparent 70%);opacity:var(--tp-fog-o,0);animation:tp-drift 46s ease-in-out infinite alternate}
@keyframes tp-drift{to{transform:translate(8%,-4%) scale(1.1)}}
#tp-vig{background:radial-gradient(ellipse at 50% 50%,transparent 52%,var(--tp-vig,#000) 120%)}
body.tp-flicker-candle #tp-vig{animation:tp-candle 3.2s steps(1) infinite}
@keyframes tp-candle{0%{opacity:1}11%{opacity:.82}19%{opacity:.96}37%{opacity:.86}52%{opacity:1}68%{opacity:.9}83%{opacity:.97}}
body.tp-flicker-fluoro #tp-vig{animation:tp-fluoro 9s steps(1) infinite}
@keyframes tp-fluoro{0%,100%{opacity:1}61%{opacity:1}62%{opacity:.25}63%{opacity:1}64%{opacity:.4}65%{opacity:1}}
body.tp-flicker-breath #tp-vig{animation:tp-breath 4.6s ease-in-out infinite}
@keyframes tp-breath{50%{opacity:.6;transform:scale(1.05)}}
#tp-frame{inset:14px;background:linear-gradient(var(--fg),var(--fg)) 0 0/34px 2px,linear-gradient(var(--fg),var(--fg)) 0 0/2px 34px,linear-gradient(var(--fg),var(--fg)) 100% 0/34px 2px,linear-gradient(var(--fg),var(--fg)) 100% 0/2px 34px,linear-gradient(var(--fg),var(--fg)) 0 100%/34px 2px,linear-gradient(var(--fg),var(--fg)) 0 100%/2px 34px,linear-gradient(var(--fg),var(--fg)) 100% 100%/34px 2px,linear-gradient(var(--fg),var(--fg)) 100% 100%/2px 34px;background-repeat:no-repeat;opacity:.55}
body.pz-reduce #tp-fx,body.pz-reduce #tp-fog{display:none!important}body.pz-reduce #tp-vig{animation:none!important}
@media (max-width:900px){#tp-frame{display:none!important}}`;
  document.head.appendChild(style);

  // ===================== Overlay + particle layer =====================
  document.body.insertAdjacentHTML('beforeend', '<div id="tp-tint"></div><canvas id="tp-fx"></canvas><div id="tp-fog"></div><div id="tp-vig"></div><div id="tp-frame"></div><div id="tp-redalert"></div>');
  const cv = document.getElementById('tp-fx');
  const cx = cv.getContext('2d');
  let parts = []; let kind = null; let raf = 0; let W = 0; let H = 0; let last = 0; let fgColor = '#fff'; let fxCol = null; let playingNow = false;
  const DPR = () => Math.min(1.5, window.devicePixelRatio || 1);
  const resize = () => { W = innerWidth; H = innerHeight; cv.width = W * DPR(); cv.height = H * DPR(); cx.setTransform(DPR(), 0, 0, DPR(), 0, 0); };
  const R = Math.random;
  const FX = {
    rain: { n: 120, make: () => ({ x: R() * (W + 200), y: R() * H, l: 10 + R() * 16, v: 9 + R() * 6 }), step: (p, s) => { p.y += p.v * s; p.x -= p.v * 0.25 * s; if (p.y > H) { p.y = -20; p.x = R() * (W + 200); } }, draw: (p) => { cx.globalAlpha = 0.3; cx.strokeStyle = fxCol || '#b4c8dc'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.l * 0.25, p.y + p.l); cx.stroke(); } },
    snow: { n: 140, make: () => ({ x: R() * W, y: R() * H, r: 0.8 + R() * 2.2, v: 0.6 + R() * 1.4, d: R() * 6.28 }), step: (p, s) => { p.y += p.v * s; p.d += 0.012 * s; p.x += (Math.sin(p.d) * 0.6 + 1.3) * s; if (p.y > H || p.x > W + 10) { p.y = -5; p.x = R() * W - 60; } }, draw: (p) => { cx.globalAlpha = 0.75; cx.fillStyle = '#f0f8ff'; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.fill(); } },
    embers: { n: 46, make: () => ({ x: R() * W, y: H + R() * H * 0.5, r: 1 + R() * 2, v: 0.5 + R() * 1.1, d: R() * 6.28, a: R() }), step: (p, s) => { p.y -= p.v * s; p.d += 0.03 * s; p.x += Math.sin(p.d) * 0.5 * s; p.a = 0.5 + Math.sin(p.d * 3) * 0.4; if (p.y < -10) { p.y = H + 10; p.x = R() * W; } }, draw: (p) => { cx.globalAlpha = Math.max(0, p.a) * Math.min(1, (p.y / H) + 0.2); cx.fillStyle = fxCol || '#ff9a3c'; cx.shadowColor = fxCol || '#ff7a1c'; cx.shadowBlur = 8; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.fill(); cx.shadowBlur = 0; } },
    ash: { n: 70, make: () => ({ x: R() * W, y: R() * H, r: 1 + R() * 2.4, v: 0.3 + R() * 0.7, d: R() * 6.28 }), step: (p, s) => { p.y += p.v * s; p.d += 0.01 * s; p.x += Math.sin(p.d) * 0.7 * s; if (p.y > H) { p.y = -5; p.x = R() * W; } }, draw: (p) => { cx.globalAlpha = 0.45; cx.fillStyle = fxCol || '#5a5650'; cx.fillRect(p.x, p.y, p.r, p.r * 0.7); } },
    dust: { n: 50, make: () => ({ x: R() * W, y: R() * H, r: 0.6 + R() * 1.6, vx: (R() - 0.5) * 0.25, vy: (R() - 0.5) * 0.2, d: R() * 6.28 }), step: (p, s) => { p.x += p.vx * s; p.y += p.vy * s; p.d += 0.02 * s; if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0; }, draw: (p) => { cx.globalAlpha = 0.25 + Math.sin(p.d) * 0.15; cx.fillStyle = fxCol || fgColor; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.fill(); } },
    spores: { n: 60, make: () => ({ x: R() * W, y: R() * H, r: 1 + R() * 2.5, d: R() * 6.28, v: 0.15 + R() * 0.35 }), step: (p, s) => { p.d += 0.015 * s; p.x += Math.cos(p.d) * 0.4 * s; p.y -= p.v * s; if (p.y < -10) { p.y = H + 10; p.x = R() * W; } }, draw: (p) => { cx.globalAlpha = 0.35 + Math.sin(p.d * 2) * 0.2; cx.fillStyle = '#e0c070'; cx.shadowColor = '#d9a040'; cx.shadowBlur = 6; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.fill(); cx.shadowBlur = 0; } },
    bubbles: { n: 40, make: () => ({ x: R() * W, y: H + R() * H, r: 1.5 + R() * 4, v: 0.6 + R() * 1.4, d: R() * 6.28 }), step: (p, s) => { p.y -= p.v * s; p.d += 0.05 * s; p.x += Math.sin(p.d) * 0.4 * s; if (p.y < -10) { p.y = H + 10; p.x = R() * W; } }, draw: (p) => { cx.globalAlpha = 0.35; cx.strokeStyle = '#9ff6ff'; cx.lineWidth = 1; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.stroke(); } },
    confetti: { n: 50, make: () => ({ x: R() * W, y: R() * H, w: 3 + R() * 4, v: 0.4 + R() * 0.8, a: R() * 6.28, c: ['#8a2a34', '#a0884a', '#4a6a7a', '#7a5a8a'][Math.floor(R() * 4)] }), step: (p, s) => { p.y += p.v * s; p.a += 0.03 * s; p.x += Math.sin(p.a) * 0.4 * s; if (p.y > H) { p.y = -5; p.x = R() * W; } }, draw: (p) => { cx.globalAlpha = 0.5; cx.fillStyle = p.c; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillRect(-p.w / 2, -1.5, p.w, 3); cx.restore(); } },
    // Drifting nodes joined by lines when close: a thinking network.
    network: { n: 42, make: () => ({ x: R() * W, y: R() * H, vx: (R() - 0.5) * 0.5, vy: (R() - 0.5) * 0.5, d: R() * 6.28 }), step: (p, s) => { p.x += p.vx * s; p.y += p.vy * s; p.d += 0.03 * s; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }, draw: (p, i) => { cx.fillStyle = fxCol || '#7c8cff'; cx.strokeStyle = fxCol || '#7c8cff'; cx.lineWidth = 1; for (let j = i + 1; j < parts.length; j++) { const q = parts[j]; const dd = Math.hypot(p.x - q.x, p.y - q.y); if (dd < 140) { cx.globalAlpha = (1 - dd / 140) * 0.28; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(q.x, q.y); cx.stroke(); } } cx.globalAlpha = 0.5 + Math.sin(p.d) * 0.3; cx.beginPath(); cx.arc(p.x, p.y, 2.2, 0, 6.28); cx.fill(); } },
    // Columns of falling hex characters.
    code: { n: 60, make: () => ({ x: Math.floor(R() * (W / 18)) * 18, y: R() * H, v: 2 + R() * 4, ch: Array.from({ length: 14 }, () => '0123456789ABCDEF'[Math.floor(R() * 16)]) }), step: (p, s) => { p.y += p.v * s; if (R() < 0.04) p.ch[Math.floor(R() * p.ch.length)] = '0123456789ABCDEF'[Math.floor(R() * 16)]; if (p.y - p.ch.length * 16 > H) { p.y = -10; p.x = Math.floor(R() * (W / 18)) * 18; } }, draw: (p) => { cx.font = '14px monospace'; cx.fillStyle = fxCol || '#33ff66'; p.ch.forEach((c, k) => { cx.globalAlpha = k === 0 ? 0.55 : 0.32 * (1 - k / p.ch.length); cx.fillText(c, p.x, p.y - k * 16); }); } },
    // Starfield; while music plays the stars stretch into streaks.
    stars: { n: 130, make: () => ({ x: R() * W, y: R() * H, r: 0.4 + R() * 1.4, v: 0.05 + R() * 0.3, d: R() * 6.28 }), step: (p, s) => { p.x -= p.v * s * (playingNow ? 6 : 1); p.d += 0.04 * s; if (p.x < 0) { p.x = W; p.y = R() * H; } }, draw: (p) => { cx.globalAlpha = 0.45 + Math.sin(p.d) * 0.35; cx.fillStyle = fxCol || '#ffffff'; cx.strokeStyle = fxCol || '#ffffff'; if (playingNow) { cx.lineWidth = p.r; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x + p.v * 90, p.y); cx.stroke(); } else { cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.fill(); } } },
    // Warp: stars fly out from the centre; much faster with longer trails when music plays.
    warp: { n: 150, make: () => ({ a: R() * 6.28, d: R() * Math.max(W, H) * 0.6, v: 0.4 + R() * 1.2, r: 0.5 + R() * 1.3 }), step: (p, s) => { p.d += p.v * s * (playingNow ? 5 : 1) * (0.3 + p.d / 400); if (p.d > Math.max(W, H) * 0.75) { p.d = R() * 30; p.a = R() * 6.28; } }, draw: (p) => { const x = W / 2 + Math.cos(p.a) * p.d; const y = H / 2 + Math.sin(p.a) * p.d; const tail = playingNow ? Math.min(140, p.d * 0.35) : Math.min(10, p.d * 0.04); cx.globalAlpha = Math.min(0.85, p.d / 300); cx.strokeStyle = fxCol || '#dfeaff'; cx.lineWidth = p.r; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - Math.cos(p.a) * tail, y - Math.sin(p.a) * tail); cx.stroke(); } },
    petals: { n: 46, make: () => ({ x: R() * W, y: R() * H, r: 4 + R() * 4, v: 0.5 + R() * 0.8, a: R() * 6.28, d: R() * 6.28 }), step: (p, s) => { p.y += p.v * s; p.d += 0.02 * s; p.a += 0.02 * s; p.x += (Math.sin(p.d) * 0.8 + 0.5) * s; if (p.y > H || p.x > W + 10) { p.y = -10; p.x = R() * W - 50; } }, draw: (p) => { cx.globalAlpha = 0.75; cx.fillStyle = fxCol || '#f5a3c0'; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.beginPath(); cx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.28); cx.fill(); cx.restore(); } },
    leaves: { n: 36, make: () => ({ x: R() * W, y: R() * H, r: 5 + R() * 5, v: 0.6 + R() * 0.9, a: R() * 6.28, d: R() * 6.28, c: ['#e8823a', '#c24d1c', '#d9a23a', '#8a3a18'][Math.floor(R() * 4)] }), step: (p, s) => { p.y += p.v * s; p.d += 0.025 * s; p.a += 0.03 * s; p.x += Math.sin(p.d) * 1.1 * s; if (p.y > H) { p.y = -10; p.x = R() * W; } }, draw: (p) => { cx.globalAlpha = 0.8; cx.fillStyle = p.c; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.beginPath(); cx.moveTo(0, -p.r); cx.quadraticCurveTo(p.r, 0, 0, p.r); cx.quadraticCurveTo(-p.r, 0, 0, -p.r); cx.fill(); cx.restore(); } },
    pixels: { n: 40, make: () => ({ x: R() * W, y: R() * H, z: 3 + Math.floor(R() * 3) * 3, v: 0.2 + R() * 0.5, c: (fxCol || '#ffd23f,#ff4f8b,#4fd6ff,#7dff6a').split(',')[Math.floor(R() * 4)] || fxCol, t: R() * 6.28 }), step: (p, s) => { p.y -= p.v * s; p.t += 0.05 * s; if (p.y < -10) { p.y = H + 10; p.x = R() * W; } }, draw: (p) => { cx.globalAlpha = 0.35 + (Math.sin(p.t) > 0.6 ? 0.3 : 0); cx.fillStyle = p.c; cx.fillRect(Math.round(p.x / 3) * 3, Math.round(p.y / 3) * 3, p.z, p.z); } },
    // Glowing fireflies drifting and blinking.
    fireflies: { n: 34, make: () => ({ x: R() * W, y: R() * H, d: R() * 6.28, v: 0.2 + R() * 0.4, t: R() * 6.28 }), step: (p, s) => { p.d += (R() - 0.5) * 0.08 * s; p.x += Math.cos(p.d) * p.v * s; p.y += Math.sin(p.d) * p.v * s; p.t += 0.04 * s; if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10; }, draw: (p) => { const a = Math.max(0, Math.sin(p.t)); cx.globalAlpha = 0.15 + a * 0.75; cx.fillStyle = fxCol || '#f5ff8a'; cx.shadowColor = fxCol || '#e6ff5a'; cx.shadowBlur = 10; cx.beginPath(); cx.arc(p.x, p.y, 1.8, 0, 6.28); cx.fill(); cx.shadowBlur = 0; } },
    // Little hearts floating up.
    hearts: { n: 26, make: () => ({ x: R() * W, y: H + R() * H, r: 4 + R() * 6, v: 0.35 + R() * 0.6, d: R() * 6.28 }), step: (p, s) => { p.y -= p.v * s; p.d += 0.03 * s; p.x += Math.sin(p.d) * 0.5 * s; if (p.y < -20) { p.y = H + 20; p.x = R() * W; } }, draw: (p) => { cx.globalAlpha = 0.45; cx.fillStyle = fxCol || '#ff8fb8'; const r = p.r; cx.beginPath(); cx.moveTo(p.x, p.y + r * 0.35); cx.bezierCurveTo(p.x - r, p.y - r * 0.5, p.x - r * 0.4, p.y - r * 1.1, p.x, p.y - r * 0.45); cx.bezierCurveTo(p.x + r * 0.4, p.y - r * 1.1, p.x + r, p.y - r * 0.5, p.x, p.y + r * 0.35); cx.fill(); } },
    // Twinkling four-point sparkles (fairy lights, magic).
    sparkles: { n: 44, make: () => ({ x: R() * W, y: R() * H, r: 2 + R() * 4, t: R() * 6.28, sp: 0.03 + R() * 0.05, c: (fxCol || '#fff6c2,#ffd1f0,#c9f1ff').split(',')[Math.floor(R() * 3)] || fxCol }), step: (p, s) => { p.t += p.sp * s; if (p.t > 6.28 * 3) { p.t = 0; p.x = R() * W; p.y = R() * H; } }, draw: (p) => { const a = Math.max(0, Math.sin(p.t)); if (a < 0.05) return; cx.globalAlpha = a * 0.8; cx.fillStyle = p.c; const r = p.r * a; cx.beginPath(); cx.moveTo(p.x, p.y - r); cx.lineTo(p.x + r * 0.25, p.y - r * 0.25); cx.lineTo(p.x + r, p.y); cx.lineTo(p.x + r * 0.25, p.y + r * 0.25); cx.lineTo(p.x, p.y + r); cx.lineTo(p.x - r * 0.25, p.y + r * 0.25); cx.lineTo(p.x - r, p.y); cx.lineTo(p.x - r * 0.25, p.y - r * 0.25); cx.fill(); } },
    // Bats flapping across the screen.
    bats: { n: 10, make: () => ({ x: -40 - R() * W, y: 40 + R() * H * 0.6, v: 1.2 + R() * 1.6, t: R() * 6.28, s: 0.6 + R() * 0.8 }), step: (p, s) => { p.x += p.v * s; p.t += 0.35 * s; p.y += Math.sin(p.t * 0.3) * 0.6 * s; if (p.x > W + 40) Object.assign(p, FX.bats.make()); }, draw: (p) => { const f = Math.sin(p.t) * 6 * p.s; const w = 14 * p.s; cx.globalAlpha = 0.6; cx.fillStyle = fxCol || '#120a14'; cx.beginPath(); cx.moveTo(p.x, p.y); cx.quadraticCurveTo(p.x - w * 0.6, p.y - 6 - f, p.x - w, p.y - f); cx.quadraticCurveTo(p.x - w * 0.5, p.y + 2, p.x, p.y + 4); cx.quadraticCurveTo(p.x + w * 0.5, p.y + 2, p.x + w, p.y - f); cx.quadraticCurveTo(p.x + w * 0.6, p.y - 6 - f, p.x, p.y); cx.fill(); } },
    // Pairs of eyes that open somewhere, look around, then close.
    eyes: { n: 6, make: () => ({ x: 40 + R() * (W - 80), y: 60 + R() * (H - 120), t: -R() * 600, life: 260 + R() * 300, s: 0.6 + R() * 0.8 }), step: (p, s) => { p.t += s; if (p.t > p.life) Object.assign(p, FX.eyes.make(), { t: -R() * 500 }); }, draw: (p) => { if (p.t < 0) return; const open = Math.min(1, p.t / 40, (p.life - p.t) / 40); cx.globalAlpha = 0.55 * open; cx.fillStyle = '#4fd1b0'; for (const dx of [-14, 14]) { cx.beginPath(); cx.ellipse(p.x + dx * p.s, p.y, 9 * p.s, 4.5 * p.s * open, 0, 0, 6.28); cx.fill(); } cx.fillStyle = '#050310'; for (const dx of [-14, 14]) { cx.beginPath(); cx.arc(p.x + dx * p.s + Math.sin(p.t / 30) * 3, p.y, 2.4 * p.s * open, 0, 6.28); cx.fill(); } } },
  };
  const frame = (now) => {
    raf = 0;
    const f = FX[kind];
    if (!f || document.hidden) return;
    playingNow = document.body.classList.contains('pz-playing');
    const s = Math.min(3, (now - (last || now)) / 16.7) * (playingNow && kind !== 'stars' && kind !== 'warp' ? 1.6 : 1);
    last = now;
    cx.clearRect(0, 0, W, H);
    for (const p of parts) f.step(p, s);
    parts.forEach((p, i) => f.draw(p, i));
    cx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };
  const startFx = (k) => {
    kind = k; parts = []; last = 0;
    if (!k || !FX[k] || document.body.classList.contains('pz-reduce')) { cx.clearRect(0, 0, W, H); return; }
    resize();
    fgColor = getComputedStyle(document.body).getPropertyValue('--fg').trim() || '#fff';
    const n = Math.round(FX[k].n * Math.min(1.3, (W * H) / (1400 * 800)));
    for (let i = 0; i < n; i++) parts.push(FX[k].make());
    if (!raf) raf = requestAnimationFrame(frame);
  };
  addEventListener('resize', () => { if (kind) startFx(kind); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && kind && !raf) raf = requestAnimationFrame(frame); });

  // ===================== Space extras: red alert, motion tracker, computer voice =====================
  const space = (() => {
    let theme = null; let listeners = 0; let lastSong = null; let songSeen = false; let wasDown = false;
    let radarTimer = 0; let sweep = 0; let nextPing = 0; const blipAngles = [];
    const voiceOn = () => store.get('maow.tp.voice') === '1';
    const speak = (text) => {
      if (!theme?.voice || !voiceOn() || !('speechSynthesis' in window)) return;
      if (document.documentElement.classList.contains('maow-gentle')) return;   // Gentle mode: no surprise voices
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = theme.voiceRate || 0.95; u.pitch = theme.voicePitch ?? 0.85; u.volume = 0.9;
        speechSynthesis.speak(u);
      } catch { /* speech not available */ }
    };
    // HUD pieces are added once theme-pizzeria.js has built the HUD.
    const ensureHud = () => {
      const hud = document.getElementById('pz-hud');
      if (!hud || document.getElementById('tp-radar')) return !!hud;
      const cam = document.getElementById('pz-cam');
      const wrap = document.createElement('span');
      wrap.id = 'tp-radar-wrap';
      wrap.title = 'Motion tracker: each blip is someone listening in voice';
      wrap.innerHTML = '<canvas id="tp-radar" width="72" height="72"></canvas><b id="tp-radar-n">0</b>';
      cam?.after(wrap);
      const btn = document.createElement('button');
      btn.className = 'pz-tog'; btn.id = 'tp-voice'; btn.textContent = '🗣 Voice';
      btn.title = 'Ship computer reads short announcements aloud';
      btn.setAttribute('aria-pressed', String(voiceOn()));
      btn.addEventListener('click', () => {
        store.set('maow.tp.voice', voiceOn() ? '0' : '1');
        btn.setAttribute('aria-pressed', String(voiceOn()));
        if (voiceOn()) speak(theme?.voiceHello || 'Computer online.');
        else try { speechSynthesis.cancel(); } catch { /* none */ }
      });
      document.getElementById('pz-t-sound')?.before(btn);
      return true;
    };
    const drawRadar = () => {
      const c = document.getElementById('tp-radar');
      if (!c) return;
      const g = c.getContext('2d'); const S = 72; const m = S / 2;
      const col = theme?.trackerColor || getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7dff9a';
      g.clearRect(0, 0, S, S);
      g.strokeStyle = col; g.globalAlpha = 0.35; g.lineWidth = 1.5;
      for (const r of [12, 22, 33]) { g.beginPath(); g.arc(m, S - 4, r * 1.6, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      sweep = (sweep + 0.09) % 1;
      g.globalAlpha = 0.18; g.fillStyle = col; g.beginPath(); g.moveTo(m, S - 4); g.arc(m, S - 4, sweep * 56, Math.PI * 1.15, Math.PI * 1.85); g.closePath(); g.fill();
      while (blipAngles.length < Math.min(listeners, 12)) blipAngles.push([1.2 + Math.random() * 0.6, 0.3 + Math.random() * 0.6]);
      g.globalAlpha = 0.95;
      blipAngles.slice(0, Math.min(listeners, 12)).forEach(([a, d]) => { g.beginPath(); g.arc(m + Math.cos(Math.PI * a) * d * 52, S - 4 + Math.sin(Math.PI * a) * d * 52, 2.6, 0, 6.28); g.fill(); });
      // Hunt mode: something closes in the longer the panel is left alone.
      if (theme?.hunt) {
        const stage = Number(document.body.dataset.pzStage || 0);
        if (stage > 0) {
          const d = Math.max(0.12, 0.95 - stage * 0.27) + Math.sin(Date.now() / 700) * 0.04;
          g.fillStyle = '#ff4040'; g.beginPath(); g.arc(m + Math.sin(Date.now() / 2300) * 18, S - 4 - d * 52, 3.4, 0, 6.28); g.fill();
        }
        const gap = [2600, 1800, 1100, 600][stage] || 2600;
        if (Date.now() > nextPing) { nextPing = Date.now() + gap; window.maowPz?.play?.(stage ? 'tracker' : 'blip'); }
      }
    };
    addEventListener('maow:state', (e) => {
      const m = e.detail;
      if (m?.type !== 'state') return;
      const qs = m.queues || [];
      const n = qs.reduce((sum, q) => sum + (q.listeners || 0), 0);
      if (theme?.tracker && n > listeners && songSeen) window.maowPz?.play?.('tracker');
      listeners = n;
      const label = document.getElementById('tp-radar-n'); if (label) label.textContent = String(n);
      const song = qs.find((q) => !q.paused && q.currentSong)?.currentSong?.name || null;
      if (songSeen && song && song !== lastSong) speak(`${theme?.voiceNow || 'Now playing'}: ${song.replace(/\(.*?\)|\[.*?\]/g, '').trim()}`);
      lastSong = song; songSeen = true;
    });
    addEventListener('maow:link', (e) => {
      if (!e.detail) { wasDown = true; speak(theme?.voiceDown || 'Warning. Connection to the bot lost.'); }
      else if (wasDown) { wasDown = false; speak(theme?.voiceUp || 'Connection restored.'); }
    });
    return {
      speak,
      apply(t) {
        theme = t;
        document.body.classList.toggle('tp-ra', !!t?.redAlert);
        const ready = ensureHud();
        if (!ready) { setTimeout(() => { if (theme === t) this.apply(t); }, 50); return; }
        const wrap = document.getElementById('tp-radar-wrap');
        const btn = document.getElementById('tp-voice');
        if (wrap) wrap.style.display = t?.tracker ? '' : 'none';
        if (btn) btn.style.display = t?.voice ? '' : 'none';
        clearInterval(radarTimer); radarTimer = 0;
        if (t?.tracker) radarTimer = setInterval(() => { if (!document.hidden && !document.body.classList.contains('pz-reduce')) drawRadar(); }, 60);
      },
    };
  })();

  const root = document.documentElement.style;
  const FLICKERS =['tp-flicker-candle', 'tp-flicker-fluoro', 'tp-flicker-breath'];
  const apply = () => {
    const t = byId[document.body.dataset.theme];
    document.body.classList.toggle('tp-on', !!t);
    FLICKERS.forEach((c) => document.body.classList.remove(c));
    const show = (id, on) => { document.getElementById(id).style.display = on ? 'block' : 'none'; };
    if (!t) { startFx(null); ['tp-fog', 'tp-vig', 'tp-tint'].forEach((id) => show(id, false)); space.apply(null); return; }
    fxCol = t.fxColor || null;
    startFx(t.fx || null);
    show('tp-fog', !!t.fog);
    const fogEl = document.getElementById('tp-fog');
    fogEl.style.background = t.fog?.[2] || '';
    if (t.fog) { root.setProperty('--tp-fog', t.fog[0]); root.setProperty('--tp-fog-o', t.fog[1]); }
    show('tp-vig', !!(t.vig || t.flicker));
    root.setProperty('--tp-vig', t.vig || '#000');
    if (t.flicker) document.body.classList.add(`tp-flicker-${t.flicker}`);
    space.apply(t);
    const tint = document.getElementById('tp-tint');
    show('tp-tint', !!t.tint);
    if (t.tint) {
      tint.style.background = t.tint[0]; tint.style.mixBlendMode = t.tint[1]; tint.style.opacity = t.tint[3] ? 1 : t.tint[2];
      tint.style.backdropFilter = t.tint[3] || ''; if (t.tint[3]) tint.style.background = 'transparent';
    }
  };
  // The class observer fires often (pz-playing etc.); only redo work on real change.
  let lastKey = '';
  const applyIfChanged = () => {
    const key = `${document.body.dataset.theme}|${document.body.classList.contains('pz-reduce')}`;
    if (key !== lastKey) { lastKey = key; apply(); }
  };
  new MutationObserver(applyIfChanged).observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });

  // ===================== Settings swatches =====================
  const addSwatches = () => {
    const grid = document.querySelector('.theme-grid');
    const sel = document.getElementById('cfg-theme');
    const anchor = grid?.querySelector('.theme-swatch[data-theme="discord"]');
    for (const t of T) {
      if (grid && !grid.querySelector(`[data-theme="${t.id}"]`)) {
        const b = document.createElement('button');
        b.className = 'theme-swatch'; b.dataset.theme = t.id;
        b.innerHTML = `<span class="swatch-preview" data-style="${t.id}"></span><span class="swatch-label"></span><span class="swatch-sub muted small"></span>`;
        b.querySelector('.swatch-label').textContent = t.name;
        b.querySelector('.swatch-sub').textContent = t.sub;
        grid.insertBefore(b, anchor || null);
      }
      if (sel && !sel.querySelector(`option[value="${t.id}"]`)) sel.add(new Option(t.name, t.id));
    }
  };
  addSwatches();

  // ===================== Categorized theme picker (Settings) =====================
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } },
  };
  const catOf = (id) => CATALOG.find((c) => c.id === id)?.cat || 'Classic';
  const TAGS = { sound: '🔊 Sounds', effects: '✨ Effects', warp: '🌠 Warp streaks', mascot: '👁 Mascot', scares: '☠ Scares', tracker: '📡 Motion tracker', redalert: '🚨 Red alert', voice: '🗣 Computer voice' };
  const buildPicker = () => {
    const grid = document.querySelector('.theme-grid');
    if (!grid || document.getElementById('tp-picker')) return;
    const card = grid.parentElement;
    const wrap = document.createElement('div');
    wrap.id = 'tp-picker';
    wrap.innerHTML = `
      <div class="tp-row">
        <label class="tp-field"><span>Category</span><select id="tp-cat"></select></label>
        <label class="tp-field tp-grow"><span>Theme</span><select id="tp-theme"></select></label>
        <div class="tp-step">
          <button type="button" id="tp-prev" title="Previous theme" aria-label="Previous theme">◀</button>
          <button type="button" id="tp-next" title="Next theme" aria-label="Next theme">▶</button>
          <button type="button" id="tp-rand" title="Random theme in this category" aria-label="Random theme">🎲</button>
        </div>
      </div>
      <div class="tp-preview">
        <span class="swatch-preview" id="tp-prev-swatch"></span>
        <div class="tp-info"><b id="tp-name"></b><div class="muted small" id="tp-sub"></div><div class="tp-tags" id="tp-tags"></div></div>
      </div>`;
    card.insertBefore(wrap, grid);
    const details = document.createElement('details');
    details.className = 'tp-cards';
    details.innerHTML = '<summary>Show as cards</summary>';
    card.insertBefore(details, grid);
    details.appendChild(grid);
    if (store.get('maow.tp.cards') === '1') details.open = true;
    details.addEventListener('toggle', () => store.set('maow.tp.cards', details.open ? '1' : '0'));

    const cat = document.getElementById('tp-cat');
    const sel = document.getElementById('tp-theme');
    cat.add(new Option(`All categories (${CATALOG.length})`, ''));
    for (const c of CATS) {
      const n = CATALOG.filter((x) => x.cat === c).length;
      if (n) cat.add(new Option(`${c} (${n})`, c));
    }
    cat.value = store.get('maow.tp.cat') || '';
    const list = () => CATALOG.filter((x) => !cat.value || x.cat === cat.value);
    const fill = () => {
      sel.innerHTML = '';
      for (const c of CATS) {
        const items = list().filter((x) => x.cat === c);
        if (!items.length) continue;
        const g = document.createElement('optgroup'); g.label = c;
        for (const x of items) g.appendChild(new Option(x.name, x.id));
        sel.appendChild(g);
      }
      grid.querySelectorAll('.theme-swatch').forEach((b) => { b.style.display = cat.value && catOf(b.dataset.theme) !== cat.value ? 'none' : ''; });
    };
    const paint = () => {
      const id = document.body.dataset.theme;
      const info = CATALOG.find((x) => x.id === id) || { name: id, sub: '', tags: [] };
      if (cat.value && info.cat !== cat.value) { cat.value = info.cat; store.set('maow.tp.cat', cat.value); fill(); }
      sel.value = id;
      document.getElementById('tp-prev-swatch').dataset.style = id;
      document.getElementById('tp-name').textContent = info.name;
      document.getElementById('tp-sub').textContent = `${info.sub}${info.cat ? ` · ${info.cat}` : ''}`;
      document.getElementById('tp-tags').innerHTML = (info.tags || []).map((t) => `<span class="tp-tag">${TAGS[t]}</span>`).join('');
    };
    const go = (id) => window.maowApplyTheme?.(id);
    const step = (dir) => {
      const ids = list().map((x) => x.id);
      const i = ids.indexOf(document.body.dataset.theme);
      go(ids[(i + dir + ids.length) % ids.length]);
    };
    cat.addEventListener('change', () => {
      store.set('maow.tp.cat', cat.value);
      fill();
      if (cat.value && catOf(document.body.dataset.theme) !== cat.value) go(list()[0].id);
      else paint();
    });
    sel.addEventListener('change', () => go(sel.value));
    document.getElementById('tp-prev').addEventListener('click', () => step(-1));
    document.getElementById('tp-next').addEventListener('click', () => step(1));
    document.getElementById('tp-rand').addEventListener('click', () => {
      const ids = list().map((x) => x.id).filter((x) => x !== document.body.dataset.theme);
      if (ids.length) go(pick(ids));
    });
    fill(); paint();
    new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  };
  style.textContent += `
#tp-picker{display:flex;flex-direction:column;gap:12px;margin-bottom:12px}
#tp-picker .tp-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
#tp-picker .tp-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--fg-muted);min-width:180px}
#tp-picker .tp-grow{flex:1}
#tp-picker select{height:38px;padding:0 10px;border-radius:var(--radius);background:var(--bg-input);color:var(--fg);border:1px solid var(--border);font-size:14px;cursor:pointer}
#tp-picker .tp-step{display:flex;gap:6px}
#tp-picker .tp-step button{height:38px;min-width:42px;border-radius:var(--radius);background:var(--bg-input-2);color:var(--fg);border:1px solid var(--border);cursor:pointer;font-size:14px}
#tp-picker .tp-step button:hover{border-color:var(--accent)}
#tp-picker .tp-preview{display:flex;gap:14px;align-items:center;padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-input)}
#tp-picker .tp-preview .swatch-preview{width:150px;height:72px;flex-shrink:0}
#tp-picker .tp-info{min-width:0}
#tp-picker .tp-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
#tp-picker .tp-tag{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--fg)}
.tp-cards>summary{cursor:pointer;color:var(--fg-muted);font-size:13px;margin:4px 0 10px}
@media (max-width:600px){#tp-picker .tp-field{min-width:0;flex:1 1 100%}#tp-picker .tp-preview .swatch-preview{width:90px}}`;
  buildPicker();
  style.textContent += `
#tp-redalert{position:fixed;inset:0;pointer-events:none;z-index:902;display:none;box-shadow:inset 0 0 0 4px rgba(255,40,40,.9),inset 0 0 140px rgba(255,0,0,.4);animation:tp-ra 1.1s ease-in-out infinite}
@keyframes tp-ra{50%{opacity:.25}}
body.tp-ra.pz-outage #tp-redalert,body.tp-ra.pz-glitch #tp-redalert{display:block}
body.tp-ra.pz-outage{--accent:#ff3b3b;--border:#7a1a1a}
body.pz-reduce #tp-redalert{animation:none}
#tp-radar-wrap{display:inline-flex;align-items:center;gap:4px}
#tp-radar{width:36px;height:36px}
#tp-radar-n{min-width:1ch}
@media (max-width:900px){#tp-radar-wrap{display:none!important}}`;

  // ===================== Public API =====================
  window.maowThemePack = {
    themes: T,
    catalog: CATALOG,
    categories: CATS,
    ids: T.map((t) => t.id),
    has: (id) => !!byId[id],
    get: (id) => byId[id],
    // Start a theme's ambience; returns { stop }.
    ambience(id, ac) {
      const t = byId[id];
      const bus = ac.createGain(); bus.gain.value = 0.9; bus.connect(ac.destination);
      const k = kit(ac, bus);
      try { t?.amb?.(k); } catch (e) { console.warn('[theme-pack] ambience failed', e); }
      return { stop() { k.stop(); bus.gain.setTargetAtTime(0, ac.currentTime, 0.08); setTimeout(() => bus.disconnect(), 400); } };
    },
    // Play a theme's one-shot sound: 'click' or 'outage'.
    sfx(id, name, ac) {
      const fn = byId[id]?.[name];
      if (!fn) return false;
      const k = kit(ac, ac.destination);
      try { fn(k); } catch (e) { console.warn('[theme-pack] sfx failed', e); }
      return true;
    },
    // Play a shared sound by name (used by the motion tracker).
    play(name, ac) {
      if (!SFX[name]) return false;
      try { SFX[name](kit(ac, ac.destination)); } catch { return false; }
      return true;
    },
    speak: (text) => space.speak(text),
    secrets: (id) => byId[id]?.secrets || {},
    refresh: applyIfChanged,
  };
  applyIfChanged();
})();
