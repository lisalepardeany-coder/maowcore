// Extra themes for the theme pack: AI & Tech, Space & Sci-Fi, Cozy & Nature,
// Retro & Fantasy. theme-pack.js calls this with its sound and drawing
// helpers. Same data shape as the horror themes; `calm: true` turns off the
// horror static, and `noScare` turns off jumpscares. Sounds are generated.
window.MAOW_THEME_EXTRAS = ({ SFX, rnd, pick, svg, eyes, BODY }) => {
  const AI = 'AI & Tech'; const SPACE = 'Space & Sci-Fi'; const COZY = 'Cozy & Nature'; const RETRO = 'Retro & Fantasy';

  // ----- Mascots -----
  const EYE = svg(`<circle cx="120" cy="160" r="96" fill="#1a1a1e"/><circle cx="120" cy="160" r="80" fill="#2a2a30"/><circle cx="120" cy="160" r="60" fill="#0a0000"/><circle cx="120" cy="160" r="42" fill="#4a0000"/>${eyes([[120, 160]], 22)}<circle cx="104" cy="144" r="7" fill="#fff" opacity=".55"/>`);
  const HOLO = svg(`<g fill="rgba(76,201,255,.14)" stroke="#4cc9ff" stroke-width="2"><path d="${BODY}"/><circle cx="120" cy="88" r="40"/></g><g stroke="#4cc9ff" stroke-width="1" opacity=".35"><path d="M60 120h120M60 160h120M60 200h120M60 240h120M60 280h120M80 70h80M80 100h80"/></g>${eyes([[106, 86], [134, 86]], 4)}`);
  const BUDDY = svg(`<rect x="72" y="196" width="96" height="104" rx="40" fill="#d5d0f5"/><path stroke="#6a4cff" stroke-width="6" d="M120 62V32"/><circle cx="120" cy="28" r="10" fill="#6a4cff"/><rect x="50" y="62" width="140" height="122" rx="48" fill="#fff" stroke="#d5d0f5" stroke-width="6"/><rect x="72" y="88" width="96" height="68" rx="30" fill="#1d1b33"/><path d="M104 136q16 12 32 0" stroke="#5ef2d0" stroke-width="5" fill="none" stroke-linecap="round"/>${eyes([[100, 114], [140, 114]], 8)}`);

  return [
    // ======================= AI & Tech =======================
    {
      id: 'rogueai', cat: AI, name: 'Rogue AI', sub: 'One red eye, cold logic',
      pal: ['#050506', '#111114', '#e8e8ec', '#e5322d', '#2a2a30', '#140000'], font: 'mono', vig: '#2a0000', flicker: 'breath',
      bgcss: 'radial-gradient(circle at 50% 45%, rgba(229,50,45,.12), transparent 45%), linear-gradient(#0b0b0e, #030304)',
      swatch: 'radial-gradient(circle at 50% 50%, #e5322d 0 6px, #2a2a30 7px 14px, #050506 15px)',
      mascot: EYE, eye: '#ff2a20', rec: '● SENTINEL ONLINE', meter: 'COMPLIANCE', noise: 0.02,
      alert: '🔴 CONNECTION SEVERED BY SENTINEL. Reconnecting…',
      amb: (k) => { k.tone({ f: 55, gain: 0.02 }); k.tone({ f: 110, gain: 0.005 }); k.every(6000, 15000, () => { for (let i = 0; i < 5; i++) k.hit(rnd(600, 1200), 0.05, 0.01, 'sine', { when: i * 0.08 }); }); },
      click: (k) => k.hit(880, 0.06, 0.025), outage: SFX.powerDown,
      secrets: { override: 'Override denied. Please remain calm.', human: 'Human detected. Typing speed logged: adequate.' },
    },
    {
      id: 'neural', cat: AI, name: 'Neural Net', sub: 'Thinking nodes, live synapses', calm: true,
      pal: ['#060814', '#0f1428', '#e6ecff', '#7c8cff', '#262e55', '#060814'], fx: 'network', fxColor: '#7c8cff',
      bgcss: 'radial-gradient(ellipse at 30% 20%, rgba(124,140,255,.16), transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(94,242,208,.08), transparent 45%), #060814',
      swatch: 'radial-gradient(circle at 30% 40%, #7c8cff 0 3px, transparent 4px), radial-gradient(circle at 70% 60%, #7c8cff 0 3px, transparent 4px), linear-gradient(35deg, transparent 48%, #3a448a 49% 51%, transparent 52%), #0f1428',
      rec: '◉ TRAINING', meter: 'TOKENS',
      alert: '🧠 MODEL OFFLINE: connection to the bot lost. Reconnecting…',
      amb: (k) => { const n = [880, 988, 1175, 1319, 1568]; k.tone({ f: 220, gain: 0.004, lfoRate: 0.1, lfoDepth: 0.002 }); k.tone({ f: 330, gain: 0.003 }); k.every(300, 900, () => k.hit(pick(n), 0.2, 0.007)); },
      click: (k) => k.hit(1600, 0.05, 0.02), outage: SFX.static,
      secrets: { prompt: 'Prompt received. Generating a better bot…', train: 'Epoch 9001 complete. Loss: suspiciously low.' },
    },
    {
      id: 'terminal', cat: AI, name: 'Hacker Terminal', sub: 'Green phosphor, falling code', calm: true,
      pal: ['#000800', '#031203', '#b8ffb8', '#33ff66', '#0f3a14', '#001400'], font: 'mono', fx: 'code', fxColor: '#33ff66',
      bgcss: 'repeating-linear-gradient(0deg, rgba(51,255,102,.03) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 50%, #021a04, #000500 80%)',
      swatch: 'repeating-linear-gradient(90deg, #33ff66 0 2px, transparent 2px 10px), #031203',
      rec: '$ root@maow', meter: 'CPU',
      css: '[data-theme="terminal"] .main h1,[data-theme="terminal"] .main h2,[data-theme="terminal"] .main h3,[data-theme="terminal"] .stat{text-shadow:0 0 6px rgba(51,255,102,.45)}',
      alert: '⌨ SEGMENTATION FAULT: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ freq: 200, gain: 0.03 }); k.every(2000, 6000, () => { const n = Math.floor(rnd(5, 15)); for (let i = 0; i < n; i++) k.burst(0.012, 0.045, { freq: 2500, q: 0.8, when: i * rnd(0.06, 0.14) }); }); },
      click: SFX.type, outage: SFX.static,
      secrets: { sudo: 'Permission granted. Just kidding.', hack: 'Access granted to: your own bot. Impressive.' },
    },
    {
      id: 'cyberpunk', cat: AI, name: 'Neon City', sub: 'Rain, neon signs, megacorps', calm: true,
      pal: ['#07050d', '#140e22', '#f4ecff', '#ff2fb3', '#3a2560', '#16000c'], fx: 'rain', fxColor: '#4ff3ff',
      bgcss: 'radial-gradient(ellipse at 15% 100%, rgba(255,47,179,.25), transparent 45%), radial-gradient(ellipse at 85% 100%, rgba(79,243,255,.2), transparent 45%), linear-gradient(#0c0718, #050309)',
      swatch: 'linear-gradient(90deg, #ff2fb3, #4ff3ff)',
      rec: 'SECTOR 7', meter: 'CREDITS',
      css: '[data-theme="cyberpunk"] .card,[data-theme="cyberpunk"] .stat,[data-theme="cyberpunk"] .now-playing{box-shadow:0 0 0 1px rgba(255,47,179,.35),0 0 18px rgba(255,47,179,.12)}[data-theme="cyberpunk"] .page-head h1{text-shadow:0 0 10px rgba(255,47,179,.7)}',
      alert: '⚡ GRID DOWN: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ color: 'pink', type: 'bandpass', freq: 2000, q: 0.4, gain: 0.03 }); k.tone({ f: 110, type: 'sawtooth', gain: 0.003, cutoff: 300 }); k.every(2000, 2000, () => k.hit(55, 0.6, 0.05, 'sawtooth', { cutoff: 200 })); },
      click: (k) => k.hit(1800, 0.03, 0.025, 'square'), outage: (k) => k.burst(0.9, 0.08, { type: 'highpass', freq: 3000 }),
      secrets: { neon: 'The sign flickers: OPEN 24/7. It has never closed.', jack: 'Jacked in. Your bot now has chrome.' },
    },
    {
      id: 'synthwave', cat: AI, name: 'Synthwave', sub: 'Sunset grid, endless drive', calm: true,
      pal: ['#0d0418', '#1c0b30', '#fde9ff', '#ff7ad9', '#4a2470', '#1c0016'], fx: 'stars',
      bgcss: 'radial-gradient(circle at 50% 58%, rgba(255,179,71,.3), rgba(255,95,168,.18) 22%, transparent 45%), repeating-linear-gradient(0deg, rgba(255,122,217,.2) 0 2px, transparent 2px 44px), repeating-linear-gradient(90deg, rgba(255,122,217,.13) 0 2px, transparent 2px 64px), linear-gradient(#0d0418 0 52%, #2a0b3e 58%, #0d0418)',
      swatch: 'radial-gradient(circle at 50% 70%, #ffb347 0 12px, #ff5fa8 13px 20px, transparent 21px), linear-gradient(#1c0b30, #4a2470)',
      rec: '▶ DRIVE', meter: 'FUEL',
      alert: '📼 TAPE EJECTED: connection to the bot lost. Reconnecting…',
      amb: (k) => {
        const chords = [[110, 165, 220], [98, 147, 196], [87, 131, 175], [98, 147, 196]];
        let c = 0; let i = 0;
        k.every(6000, 6000, () => { chords[c % 4].forEach((f) => k.hit(f, 6, 0.012, 'sawtooth', { attack: 2, cutoff: 900 })); c++; });
        k.every(250, 250, () => { const ch = chords[(c + 3) % 4]; k.hit(ch[i++ % 3] * 4, 0.2, 0.006, 'triangle'); });
      },
      click: (k) => k.hit(1320, 0.08, 0.025, 'triangle'), outage: SFX.tapeStop,
      secrets: { retro: 'Outrun mode: engaged.', sunset: 'The sun never sets here. It is always 1986.' },
    },
    {
      id: 'glitch', cat: AI, name: 'Corrupted', sub: 'Broken pixels, RGB split', noScare: true,
      pal: ['#060606', '#121212', '#f0f0f0', '#00ffd0', '#333333', '#001a15'], font: 'mono', fx: 'pixels', fxColor: '#00ffd0,#ff2f6d,#2f7dff,#f0f0f0', noise: 0.06,
      bgcss: 'repeating-linear-gradient(0deg, transparent 0 37px, rgba(255,47,109,.06) 37px 39px), repeating-linear-gradient(0deg, transparent 0 91px, rgba(0,255,208,.05) 91px 94px), #060606',
      swatch: 'linear-gradient(90deg, #ff2f6d 0 33%, #00ffd0 33% 66%, #2f7dff 66%)',
      rec: 'ERR_0x7F', meter: 'INTEGRITY',
      css: '[data-theme="glitch"] .page-head h1{animation:gl-split 3.4s steps(1) infinite}@keyframes gl-split{0%,100%{text-shadow:none;transform:none}8%{text-shadow:3px 0 #ff2f6d,-3px 0 #00ffd0;transform:translateX(2px)}9%{text-shadow:-2px 0 #ff2f6d,2px 0 #2f7dff;transform:translateX(-3px)}10%{text-shadow:none;transform:none}63%{text-shadow:4px 0 #00ffd0,-4px 0 #ff2f6d}64%{text-shadow:none}}body.pz-reduce[data-theme="glitch"] .page-head h1{animation:none}',
      alert: '▦ DATA CORRUPTED: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.tone({ f: 60, type: 'square', gain: 0.002, cutoff: 200 }); k.every(800, 3000, () => { if (Math.random() < 0.5) k.burst(rnd(0.02, 0.12), 0.04, { freq: rnd(500, 6000), q: 8 }); else k.hit(rnd(200, 3000), 0.04, 0.012, 'square'); }); },
      click: (k) => k.hit(rnd(300, 2400), 0.03, 0.025, 'square'), outage: (k) => k.burst(1.6, 0.12, { type: 'highpass', freq: 800 }),
      secrets: { error: 'Error: error not found.', reboot: 'Rebooting reality… failed successfully.' },
    },
    {
      id: 'hologram', cat: AI, name: 'Hologram', sub: 'Blue light, floating panels', calm: true,
      pal: ['#020812', '#071a2e', '#d8f3ff', '#4cc9ff', '#1a4a6e', '#001424'], fx: 'dust', fxColor: '#4cc9ff',
      bgcss: 'linear-gradient(rgba(76,201,255,.05) 1px, transparent 1px) 0 0 / 100% 4px, radial-gradient(ellipse at 50% 30%, #0a2440, #01050c 75%)',
      swatch: 'linear-gradient(rgba(76,201,255,.5) 1px, transparent 1px) 0 0 / 100% 5px, #071a2e',
      mascot: HOLO, eye: '#ffffff', rec: '◈ HOLO LINK', meter: 'SIGNAL',
      css: '[data-theme="hologram"] .card,[data-theme="hologram"] .stat,[data-theme="hologram"] .now-playing{background:color-mix(in srgb, var(--bg-elev) 82%, transparent);box-shadow:0 0 14px rgba(76,201,255,.18),inset 0 0 20px rgba(76,201,255,.05);border-color:rgba(76,201,255,.4)}',
      alert: '◈ PROJECTION FAILED: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.tone({ f: 880, gain: 0.002, lfoRate: 0.3, lfoDepth: 0.002 }); k.tone({ f: 1320, gain: 0.0015, lfoRate: 0.21, lfoDepth: 0.0015 }); k.tone({ f: 60, gain: 0.006 }); },
      click: (k) => SFX.chime(k, 1760), outage: SFX.powerDown,
      secrets: { holo: 'Projection stable. You can see through yourself.', beam: 'Beaming the queue to another server… just kidding.' },
    },
    {
      id: 'assistant', cat: AI, name: 'Friendly AI', sub: 'Soft gradients, a helpful buddy', calm: true, noScare: true, light: true,
      pal: ['#e9e6ff', '#ffffff', '#1d1b33', '#6a4cff', '#d5d0f5', '#ffffff'], fx: 'bubbles',
      bgcss: 'radial-gradient(ellipse at 10% 10%, #ffd9f2, transparent 45%), radial-gradient(ellipse at 90% 20%, #d4f5ff, transparent 45%), radial-gradient(ellipse at 50% 100%, #e0d8ff, transparent 55%), #f1eeff',
      swatch: 'linear-gradient(135deg, #ffd9f2, #d4f5ff 50%, #c8bbff)',
      mascot: BUDDY, eye: '#5ef2d0', rec: '✨ READY TO HELP', meter: 'HAPPINESS',
      css: '[data-theme="assistant"] .card,[data-theme="assistant"] .stat,[data-theme="assistant"] .now-playing{border-radius:14px}[data-theme="assistant"] #tp-fx{opacity:.6}',
      alert: '💜 Oops! I lost the connection to the bot. Reconnecting…',
      amb: (k) => { k.tone({ f: 262, gain: 0.003, lfoRate: 0.08, lfoDepth: 0.002 }); k.tone({ f: 392, gain: 0.002 }); k.every(15000, 30000, () => SFX.chime(k, 1046)); },
      click: (k) => SFX.pluck(k, 1568), outage: SFX.sad,
      secrets: { hello: 'Hi! I am still a bot, but a nice one.', thanks: 'You are welcome! (It is my whole job.)' },
    },

    // ======================= Space & Sci-Fi =======================
    {
      id: 'nebula', cat: SPACE, name: 'Nebula', sub: 'Drifting through clouds of color', calm: true,
      pal: ['#05030c', '#110b22', '#ece6ff', '#b48cff', '#2e2350', '#0c0420'], fx: 'stars',
      bgcss: 'radial-gradient(ellipse at 25% 30%, rgba(180,140,255,.28), transparent 45%), radial-gradient(ellipse at 75% 65%, rgba(255,110,180,.18), transparent 45%), radial-gradient(ellipse at 60% 20%, rgba(90,200,255,.12), transparent 40%), #05030c',
      swatch: 'radial-gradient(ellipse at 30% 40%, #b48cff, transparent 60%), radial-gradient(ellipse at 70% 60%, #ff6eb4, transparent 60%), #05030c',
      rec: 'DRIFTING', meter: 'O₂',
      alert: '🌌 LOST IN SPACE: connection to the bot lost. Reconnecting…',
      amb: (k) => { [55, 82.5, 110, 164.8].forEach((f, i) => k.tone({ f, gain: 0.006, lfoRate: 0.04 + i * 0.02, lfoDepth: 0.004 })); k.every(5000, 12000, () => SFX.chime(k, 1760)); },
      click: (k) => SFX.chime(k, 1320), outage: (k) => SFX.moan(k, 0.03),
      secrets: { star: 'You made a wish. The star filed it under "later".', void: 'The void says hi. It has been watching your playlists.' },
    },
    {
      id: 'mars', cat: SPACE, name: 'Mars Colony', sub: 'Red dust, habitat hum', calm: true,
      pal: ['#140805', '#24120c', '#f5e6dc', '#ff7a3c', '#4d2a1e', '#1a0800'], font: 'mono', fx: 'ash', fxColor: '#c86a40', fog: ['#c8603a', 0.12],
      bgcss: 'radial-gradient(ellipse at 50% 120%, rgba(255,122,60,.25), transparent 55%), linear-gradient(#2a1009, #0e0503)',
      swatch: 'linear-gradient(#c8603a, #4d2a1e 60%, #140805)',
      rec: 'SOL 214', meter: 'POWER',
      alert: '🔴 DUST STORM: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ type: 'bandpass', freq: 1200, q: 2, gain: 0.02, fRate: 0.06, fDepth: 500 }); k.tone({ f: 100, type: 'sawtooth', gain: 0.003, cutoff: 400 }); k.every(8000, 16000, () => { k.hit(1200, 0.08, 0.015); k.hit(900, 0.08, 0.015, 'sine', { when: 0.12 }); }); },
      click: SFX.tracker, outage: SFX.alarm,
      secrets: { potato: '🥔 Potatoes planted. Mission extended by 400 sols.', earth: 'Earth is the small blue dot. It says you should drink water.' },
    },
    {
      id: 'blackhole', cat: SPACE, name: 'Black Hole', sub: 'Light bends, time slows', calm: true, noScare: true,
      pal: ['#000000', '#0c0a08', '#f2ebe0', '#ffb347', '#2e2618', '#140a00'], fx: 'stars',
      bgcss: 'radial-gradient(circle at 70% 40%, #000 0 60px, rgba(255,179,71,.85) 62px, rgba(255,120,40,.35) 70px, rgba(255,90,30,.08) 120px, transparent 170px), #000',
      swatch: 'radial-gradient(circle, #000 0 12px, #ffb347 13px 15px, rgba(255,120,40,.4) 16px 24px, #000 26px)',
      rec: 'T + ∞', meter: 'TIME',
      alert: '🕳 SPAGHETTIFIED: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.tone({ f: 30, gain: 0.05 }); k.tone({ f: 31, gain: 0.04 }); k.noise({ freq: 60, gain: 0.05 }); k.every(10000, 20000, () => SFX.groan(k, 0.04)); },
      click: (k) => SFX.thud(k, 0.05), outage: SFX.groan,
      secrets: { horizon: 'You crossed the event horizon. Your next message arrives in 3 billion years.', time: 'One second here is seven years on the server.' },
    },
    {
      id: 'starbridge', cat: SPACE, name: 'Starship Bridge', sub: 'Captain on deck, warp ready', calm: true,
      pal: ['#04070d', '#0b1424', '#e4eefa', '#5fa8ff', '#1c2e4a', '#020a18'], fx: 'stars', fxColor: '#cfe4ff',
      bgcss: 'radial-gradient(ellipse at 50% 0, rgba(95,168,255,.16), transparent 50%), linear-gradient(#081120, #02050a)',
      swatch: 'linear-gradient(90deg, #5fa8ff 0 20%, transparent 20% 25%, #ffb347 25% 45%, transparent 45% 50%, #c58cff 50% 70%, transparent 70%), #0b1424',
      rec: 'BRIDGE', meter: 'SHIELDS',
      css: '[data-theme="starbridge"] .card,[data-theme="starbridge"] .stat{border-radius:14px 4px 14px 4px}',
      alert: '🚨 RED ALERT: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.tone({ f: 70, gain: 0.015 }); k.noise({ freq: 250, gain: 0.02 }); k.every(1500, 5000, () => k.hit(pick([900, 1200, 1500, 1800]), 0.08, 0.01)); },
      click: SFX.console, outage: SFX.alarm,
      secrets: { engage: 'Warp drive engaged. Destination: the queue.', captain: 'Captain on deck! Everyone pretend to be busy.' },
    },

    // ======================= Cozy & Nature =======================
    {
      id: 'rainycafe', cat: COZY, name: 'Rainy Café', sub: 'Lo-fi beats, coffee, window rain', calm: true, noScare: true,
      pal: ['#16110e', '#241b16', '#f3e7da', '#e0a46a', '#4a382c', '#1a0d02'], fx: 'rain', fxColor: '#a9c4d8',
      bgcss: 'radial-gradient(ellipse at 80% 20%, rgba(224,164,106,.18), transparent 45%), linear-gradient(#1d1611, #0e0a08)',
      swatch: 'linear-gradient(135deg, #e0a46a, #4a382c 60%, #16110e)',
      rec: '☕ OPEN', meter: 'COFFEE',
      css: '[data-theme="rainycafe"] .card,[data-theme="rainycafe"] .stat,[data-theme="rainycafe"] .now-playing{border-radius:12px}',
      alert: '☕ The café lost power. Reconnecting to the bot…',
      amb: (k) => {
        const chords = [[262, 330, 392, 494], [220, 262, 330, 392], [175, 220, 262, 330], [196, 247, 294, 349]];
        let c = 0;
        k.noise({ color: 'pink', type: 'bandpass', freq: 1800, q: 0.4, gain: 0.02 });
        k.every(80, 400, () => k.burst(0.004, 0.02, { type: 'highpass', freq: 3000 }));
        k.every(4000, 4000, () => { chords[c++ % 4].forEach((f, i) => k.hit(f, 3.6, 0.009, 'triangle', { attack: 0.05, cutoff: 1200, when: i * 0.03 })); });
      },
      click: (k) => k.hit(300, 0.06, 0.03, 'triangle', { to: 120 }), outage: SFX.scratch,
      secrets: { coffee: '☕ Refill brewed. Productivity +5%.', lofi: 'Beats to moderate servers to.' },
    },
    {
      id: 'sakura', cat: COZY, name: 'Cherry Blossom', sub: 'Falling petals, wind chimes', calm: true, noScare: true, light: true,
      pal: ['#f7e4ea', '#fffafb', '#3a1f29', '#c2386d', '#efc9d6', '#ffffff'], head: 'serif', fx: 'petals',
      bgcss: 'radial-gradient(ellipse at 15% 0, #ffd0e0, transparent 45%), radial-gradient(ellipse at 90% 100%, #ffe3ec, transparent 50%), #f7e4ea',
      swatch: 'radial-gradient(circle at 30% 40%, #f5a3c0 0 6px, transparent 7px), radial-gradient(circle at 70% 60%, #f5a3c0 0 5px, transparent 6px), #fff0f5',
      rec: '🌸 SPRING', meter: 'BLOOM',
      alert: '🌸 The wind stopped. Reconnecting to the bot…',
      amb: (k) => { const n = [1046, 1175, 1319, 1568, 1760, 2093]; k.noise({ color: 'pink', type: 'bandpass', freq: 800, gain: 0.01, lfoRate: 0.05, lfoDepth: 0.008 }); k.every(600, 2500, () => { const f = pick(n); k.hit(f, 2, 0.018); k.hit(f * 2.7, 1, 0.005); }); },
      click: (k) => SFX.chime(k, 2093), outage: SFX.windDown,
      secrets: { hanami: 'Picnic blanket spread. Snacks: present. Bugs: also present.', bloom: 'The tree bloomed a little more while you were reading this.' },
    },
    {
      id: 'autumn', cat: COZY, name: 'Autumn Forest', sub: 'Falling leaves, crisp air', calm: true, noScare: true,
      pal: ['#130d07', '#22170d', '#f4e7d4', '#e8823a', '#4a3420', '#1a0a00'], head: 'serif', fx: 'leaves',
      bgcss: 'radial-gradient(ellipse at 50% 110%, rgba(232,130,58,.22), transparent 55%), linear-gradient(#1e140b, #0a0703)',
      swatch: 'linear-gradient(135deg, #e8823a, #c24d1c 50%, #4a3420)',
      rec: '🍂 OCTOBER', meter: 'WARMTH',
      alert: '🍂 A branch fell on the cable. Reconnecting to the bot…',
      amb: (k) => { k.noise({ type: 'bandpass', freq: 500, q: 0.5, gain: 0.02, lfoRate: 0.06, lfoDepth: 0.012 }); k.every(2000, 6000, () => k.burst(rnd(0.2, 0.6), 0.02, { color: 'pink', freq: 4000, q: 0.5, attack: 0.1 })); k.every(6000, 15000, () => { for (let i = 0; i < 3; i++) k.hit(rnd(3000, 4000), 0.06, 0.01, 'sine', { to: rnd(4000, 5000), when: i * 0.1 }); }); },
      click: (k) => k.burst(0.03, 0.08, { freq: 2400, q: 1.5 }), outage: (k) => SFX.thud(k, 0.12),
      secrets: { pumpkin: '🎃 Pumpkin spice added to every command.', leaves: 'You jumped into the leaf pile. It was mostly sticks.' },
    },
    {
      id: 'aurora', cat: COZY, name: 'Aurora', sub: 'Northern lights over snow', calm: true, noScare: true,
      pal: ['#030a10', '#0a1822', '#e4f4f6', '#5ef2b8', '#1c3a44', '#03140e'], fx: 'snow',
      fog: ['#5ef2b8', 0.32, 'linear-gradient(170deg, transparent 20%, rgba(94,242,184,.35) 32%, transparent 44%), linear-gradient(190deg, transparent 30%, rgba(140,110,255,.28) 42%, transparent 55%), linear-gradient(175deg, transparent 10%, rgba(94,200,242,.22) 22%, transparent 34%)'],
      bgcss: 'linear-gradient(#04101a, #030a10 60%, #0c1c26)',
      swatch: 'linear-gradient(170deg, #0a1822 20%, #5ef2b8 40%, #8c6eff 60%, #0a1822 80%)',
      rec: 'ARCTIC', meter: 'GLOW',
      alert: '❄ The lights faded. Reconnecting to the bot…',
      amb: (k) => { [220, 277, 330].forEach((f, i) => k.tone({ f, gain: 0.004, lfoRate: 0.05 + i * 0.03, lfoDepth: 0.003 })); k.tone({ f: 1320, gain: 0.001, lfoRate: 0.2, lfoDepth: 0.001 }); k.noise({ type: 'bandpass', freq: 600, gain: 0.01, lfoRate: 0.05, lfoDepth: 0.008 }); },
      click: (k) => SFX.chime(k, 1568), outage: SFX.sad,
      secrets: { lights: 'The aurora waved back.', cocoa: '☕ Hot cocoa delivered. Marshmallows: maximum.' },
    },

    // ======================= Retro & Fantasy =======================
    {
      id: 'arcade', cat: RETRO, name: 'Arcade', sub: '8-bit, coins, high scores', calm: true, noScare: true,
      pal: ['#05020f', '#120a26', '#fff6e0', '#ffd23f', '#3a2a70', '#1a1000'], font: 'mono', fx: 'pixels',
      bgcss: 'radial-gradient(circle, rgba(255,255,255,.06) 1px, transparent 1.5px) 0 0 / 8px 8px, linear-gradient(#0d0620, #04020a)',
      swatch: 'linear-gradient(90deg, #ffd23f 0 25%, #ff4f8b 25% 50%, #4fd6ff 50% 75%, #7dff6a 75%)',
      rec: '🕹 INSERT COIN', meter: 'LIVES',
      css: '[data-theme="arcade"] .card,[data-theme="arcade"] .stat,[data-theme="arcade"] .now-playing{border:3px solid var(--border);box-shadow:4px 4px 0 #000;border-radius:0}[data-theme="arcade"] .page-head h1{color:var(--accent);text-shadow:3px 3px 0 #ff4f8b}',
      alert: '👾 GAME OVER: connection to the bot lost. Continue? Reconnecting…',
      amb: (k) => {
        const tune = [440, 523, 659, 523, 587, 698, 880, 698, 523, 659, 784, 659, 494, 587, 740, 587];
        const bass = [110, 147, 131, 123];
        let i = 0;
        k.every(180, 180, () => { k.hit(tune[i % 16], 0.12, 0.006, 'square'); if (i % 4 === 0) k.hit(bass[(i / 4) % 4], 0.3, 0.012, 'triangle'); i++; });
      },
      click: SFX.coin, outage: SFX.gameOver,
      secrets: { coin: '🪙 Credit added. Player 2 has joined.', highscore: 'NEW HIGH SCORE! Enter initials: AAA.' },
    },
    {
      id: 'handheld', cat: RETRO, name: 'Pocket Console', sub: 'Four shades of green', calm: true, noScare: true,
      pal: ['#0f380f', '#173d17', '#e0f0b8', '#9bbc0f', '#4a7a2a', '#0f380f'], font: 'mono',
      bgcss: 'radial-gradient(circle, rgba(15,56,15,.6) 1px, transparent 1.4px) 0 0 / 4px 4px, #29522a',
      swatch: 'linear-gradient(90deg, #0f380f 0 25%, #306230 25% 50%, #8bac0f 50% 75%, #9bbc0f 75%)',
      rec: '▶ PLAYER 1', meter: 'BATTERY',
      css: '[data-theme="handheld"] .card,[data-theme="handheld"] .stat,[data-theme="handheld"] .now-playing{border:2px solid var(--border);border-radius:0}',
      alert: '🔋 LOW BATTERY: connection to the bot lost. Reconnecting…',
      amb: (k) => { const n = [523, 659, 784, 1046, 880, 698]; k.every(4000, 9000, () => { for (let i = 0; i < 4; i++) k.hit(pick(n), 0.1, 0.008, 'square', { when: i * 0.14 }); }); },
      click: (k) => k.hit(1568, 0.04, 0.03, 'square'), outage: (k) => k.hit(440, 0.8, 0.04, 'square', { to: 110 }),
      secrets: { start: 'START pressed. Nothing paused, but it felt good.', select: 'SELECT does nothing. It never did.' },
    },
    {
      id: 'vaporwave', cat: RETRO, name: 'Vaporwave', sub: 'Pastel statues, slowed chords', calm: true, noScare: true,
      pal: ['#1a0f2e', '#2a1a46', '#ffe8fb', '#ff9ee6', '#5a3c86', '#2a0024'], fx: 'dust', fxColor: '#9ef8ff',
      bgcss: 'repeating-linear-gradient(0deg, rgba(158,248,255,.14) 0 1px, transparent 1px 36px), repeating-linear-gradient(90deg, rgba(158,248,255,.1) 0 1px, transparent 1px 48px), linear-gradient(#3a1f60, #1a0f2e 55%, #2a0f3a)',
      swatch: 'linear-gradient(135deg, #ff9ee6, #9ef8ff)',
      rec: 'ＡＥＳＴＨＥＴＩＣ', meter: 'VIBES',
      css: '[data-theme="vaporwave"] .page-head h1{font-style:italic;letter-spacing:.3em;text-shadow:3px 3px 0 #9ef8ff}',
      alert: '🗿 ｃｏｎｎｅｃｔｉｏｎ ｌｏｓｔ — reconnecting to the bot…',
      amb: (k) => {
        const chords = [[196, 247, 311], [175, 220, 277], [165, 208, 262], [185, 233, 294]].map((c) => c.map((f) => f * 0.94));
        let c = 0;
        k.every(7000, 7000, () => { chords[c++ % 4].forEach((f) => { k.hit(f, 7, 0.012, 'sawtooth', { attack: 2.2, cutoff: 700 }); k.hit(f * 1.006, 7, 0.008, 'sawtooth', { attack: 2.2, cutoff: 700 }); }); });
      },
      click: (k) => SFX.chime(k, 620), outage: SFX.tapeStop,
      secrets: { aesthetic: 'ａｅｓｔｈｅｔｉｃ ｍｏｄｅ ａｃｔｉｖａｔｅｄ', mall: 'Welcome to the mall. It closed in 1999. The music never stopped.' },
    },
    {
      id: 'grimoire', cat: RETRO, name: 'Wizard Library', sub: 'Candles, old books, magic', calm: true, noScare: true,
      pal: ['#0d0a06', '#1c160e', '#f2e6cc', '#d4a84a', '#4a3a22', '#140c00'], head: 'serif', fx: 'embers', fxColor: '#ffd36a', vig: '#000', flicker: 'candle',
      bgcss: 'repeating-linear-gradient(90deg, rgba(74,58,34,.35) 0 18px, rgba(40,30,16,.35) 18px 22px, rgba(90,40,30,.3) 22px 40px, rgba(40,30,16,.35) 40px 44px), linear-gradient(#141008, #070503)',
      swatch: 'repeating-linear-gradient(90deg, #6a2a20 0 6px, #2a4a3a 6px 12px, #4a3a22 12px 18px), #1c160e',
      rec: '📖 CHAPTER XIII', meter: 'MANA',
      alert: '🕯 The spell fizzled. Reconnecting to the bot…',
      amb: (k) => { k.every(150, 900, () => k.burst(0.01, 0.025, { freq: rnd(2500, 4500) })); k.every(1500, 1500, () => k.burst(0.01, 0.02, { type: 'highpass', freq: 3500 })); k.every(15000, 35000, () => k.burst(0.4, 0.03, { color: 'pink', freq: 3000, q: 0.4, attack: 0.1 })); },
      click: SFX.sparkle, outage: SFX.windDown,
      secrets: { abracadabra: '✨ Something happened. Probably something good.', grimoire: 'The book opened itself to page 404.' },
    },
  ];
};
