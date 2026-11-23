// Space theme pack B: Space Movies & Shows (12) and Space Games (5).
// Original themes inspired by the feel of space films, shows and games; no
// names, logos, designs or recordings from them. Sounds are generated live.
(window.MAOW_THEME_PACKS = window.MAOW_THEME_PACKS || []).push(({ SFX, rnd, pick, svg, eyes }) => {
  const MOV = 'Space Movies & Shows'; const GAME = 'Space Games';
  const ship = { voice: true, redAlert: true, calm: true };

  const hum = (k, f = 64, g = 0.012) => { k.tone({ f, gain: g }); k.noise({ freq: 240, gain: 0.016 }); };
  const chirp = (k) => { k.hit(1500, 0.04, 0.02); k.hit(2000, 0.05, 0.016, 'sine', { when: 0.05 }); };
  const klaxon = (k) => { for (let i = 0; i < 3; i++) k.hit(420, 0.55, 0.05, 'sawtooth', { to: 880, cutoff: 1600, when: i * 0.65 }); };
  const pluck = (k, f, v = 0.03) => { k.hit(f, 0.5, v, 'triangle'); k.hit(f * 2, 0.15, v / 3, 'square', { cutoff: 2400 }); };
  const radio = (k) => k.every(4000, 12000, () => k.burst(rnd(0.2, 0.8), 0.025, { freq: 1800, q: 1.4 }));
  const breathe = (k, g = 0.012) => k.noise({ color: 'pink', type: 'bandpass', freq: 900, q: 0.5, gain: g, lfoRate: 0.2, lfoDepth: g });

  const ROBOT = svg(`<rect x="60" y="210" width="120" height="90" rx="20" fill="#d0d0d4"/><rect x="40" y="60" width="160" height="140" rx="26" fill="#e6e6ea" stroke="#9a9aa2" stroke-width="5"/><rect x="62" y="82" width="116" height="96" rx="14" fill="#16161a"/><path d="M96 150q24 18 48 0" stroke="#ffd23f" stroke-width="6" fill="none" stroke-linecap="round"/>${eyes([[100, 118], [140, 118]], 9)}<path stroke="#9a9aa2" stroke-width="8" d="M120 210v-10"/>`);
  const LENS = svg(`<rect x="50" y="40" width="140" height="240" rx="12" fill="#c8c8cc"/><rect x="62" y="52" width="116" height="216" rx="8" fill="#1a1a1e"/><circle cx="120" cy="150" r="46" fill="#2a0000"/><circle cx="120" cy="150" r="32" fill="#600000"/>${eyes([[120, 150]], 16)}<circle cx="110" cy="140" r="5" fill="#fff" opacity=".5"/><rect x="80" y="70" width="80" height="8" rx="3" fill="#8a8a92"/>`);

  // A different planet every time the panel is opened.
  const h = Math.floor(Math.random() * 360);
  const hsl = (s, l) => `hsl(${h} ${s}% ${l}%)`;

  return [
    // ======================= Space Movies & Shows =======================
    {
      id: 'lonemoon', cat: MOV, name: 'Lone Moon Base', sub: 'A friendly robot, a contract countdown', calm: true, noScare: true, voice: true,
      pal: ['#08080a', '#16161a', '#ececf0', '#ffd23f', '#34343c', '#1a1200'], fx: 'stars',
      bgcss: 'radial-gradient(ellipse 80% 30% at 50% 115%, #4a4a50, transparent 70%), #08080a',
      swatch: 'radial-gradient(ellipse 90% 40% at 50% 110%, #6a6a70, transparent 70%), #16161a',
      mascot: ROBOT, eye: '#ffd23f', rec: 'DAY 1,094 / 1,095', meter: 'CONTRACT',
      voiceHello: 'Good morning. How are you feeling today?', voiceDown: 'I am here to help you. The connection is down.',
      alert: '🙂 Communications are down. Reconnecting to the bot…',
      amb: (k) => { hum(k, 56, 0.01); k.every(9000, 20000, () => { k.hit(900, 0.06, 0.012); k.hit(1200, 0.08, 0.012, 'sine', { when: 0.08 }); }); },
      click: chirp, outage: SFX.sad,
      secrets: { robot: 'The robot smiles. :) It is always smiling.', home: 'Contract almost done. Your ride home is "on its way".' },
    },
    {
      id: 'solarpayload', cat: MOV, name: 'Solar Payload', sub: 'Blinding gold shield, close to the sun', calm: true, voice: true, redAlert: true,
      pal: ['#0a0602', '#1a1006', '#fbeedb', '#ffb21a', '#4a3214', '#1a0c00'], fx: 'ash', fxColor: '#ffd070',
      bgcss: 'radial-gradient(circle at 50% -30%, rgba(255,210,120,.55), rgba(255,160,30,.18) 35%, transparent 60%), #0a0602',
      swatch: 'radial-gradient(circle at 50% 0, #fff2c0, #ffb21a 35%, #1a1006 70%)',
      css: '[data-theme="solarpayload"] .topbar{box-shadow:0 0 40px rgba(255,178,26,.25);transition:box-shadow 1s}body.pz-playing[data-theme="solarpayload"] .topbar{box-shadow:0 0 90px 14px rgba(255,190,60,.55)}',
      rec: 'PAYLOAD · 0.3 AU', meter: 'SHIELD', voiceHello: 'Shield angle optimal. Do not look directly at the sun.',
      alert: '☀ SHIELD DAMAGE: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ freq: 90, gain: 0.05 }); [220, 330, 440].forEach((f, i) => k.tone({ f, gain: 0.003, lfoRate: 0.04 + i * 0.02, lfoDepth: 0.002 })); },
      click: chirp, outage: klaxon,
      secrets: { sun: 'You looked at the sun. The panel is a little brighter now.', bomb: 'Payload armed. It is only a very large music file.' },
    },
    {
      id: 'frontierfreighter', cat: MOV, name: 'Frontier Freighter', sub: 'Space western, warm brass', ...ship,
      pal: ['#0d0906', '#1c140d', '#f4e6d2', '#e0943a', '#4a3420', '#160a00'], fx: 'dust', fxColor: '#e0943a', head: 'serif',
      bgcss: 'radial-gradient(ellipse at 50% 120%, rgba(224,148,58,.2), transparent 55%), repeating-linear-gradient(0deg, rgba(74,52,32,.3) 0 2px, transparent 2px 64px), #0d0906',
      swatch: 'linear-gradient(135deg, #e0943a, #4a3420 60%, #0d0906)',
      rec: 'CARGO BAY', meter: 'FUEL', voiceHello: 'Engines warm. Cargo secured. Mostly.',
      alert: '🤠 WE LOST HER: connection to the bot lost. Reconnecting…',
      amb: (k) => { hum(k, 60, 0.01); const n = [196, 233, 262, 294, 349, 392]; k.every(1800, 4200, () => pluck(k, pick(n), 0.02)); },
      click: (k) => pluck(k, 392, 0.025), outage: SFX.tapeStop,
      secrets: { shiny: 'Everything is shiny. Nothing is on fire.', cargo: 'The cargo is ticking. That is probably fine.' },
    },
    {
      id: 'fleetcarrier', cat: MOV, name: 'Fleet Carrier', sub: 'Grim military grey, jump countdown', ...ship, tracker: true, trackerColor: '#e8c040',
      pal: ['#08090a', '#141618', '#e6e8ea', '#e8c040', '#33363a', '#161000'], font: 'mono',
      bgcss: 'repeating-linear-gradient(90deg, rgba(60,64,70,.35) 0 2px, transparent 2px 120px), linear-gradient(#0e1012, #040506)',
      swatch: 'repeating-linear-gradient(90deg, #33363a 0 4px, #141618 4px 16px), linear-gradient(#e8c040, #e8c040) 50% 50% / 40% 4px no-repeat',
      rec: 'COMBAT INFO CENTER', meter: 'JUMP DRIVE', voiceHello: 'Action stations. Set condition one.', voiceDown: 'Contact lost. Prepare to jump.',
      alert: '🚀 JUMP IN 3… 2… 1: connection to the bot lost. Reconnecting…',
      amb: (k) => { hum(k, 50, 0.014); radio(k); k.every(30000, 60000, () => { for (let i = 0; i < 5; i++) k.hit(880, 0.12, 0.02, 'square', { when: i }); }); },
      click: (k) => k.hit(1000, 0.05, 0.025, 'square'), outage: klaxon,
      secrets: { jump: 'Jump coordinates locked. Spinning up.', condition: 'Condition one set throughout the ship.' },
    },
    {
      id: 'smuggler', cat: MOV, name: "Smuggler's Cockpit", sub: 'Flickering dials, hyperjump streaks', ...ship,
      pal: ['#0b0907', '#191510', '#f0e6d8', '#ff8c3a', '#463a2c', '#160800'], fx: 'warp', fxColor: '#e8f0ff', flicker: 'fluoro', vig: '#000',
      bgcss: 'radial-gradient(circle at 50% 50%, rgba(232,240,255,.06), transparent 40%), #0b0907',
      swatch: 'repeating-conic-gradient(from 0deg at 50% 50%, #e8f0ff 0 2deg, transparent 2deg 20deg), #191510',
      rec: 'COCKPIT', meter: 'HYPERDRIVE', voiceHello: 'Hyperdrive… probably working.',
      alert: '💫 HYPERDRIVE FAILED (again): connection to the bot lost. Reconnecting…',
      amb: (k) => { k.tone({ f: 46, type: 'sawtooth', gain: 0.008, cutoff: 160, lfoRate: 6, lfoDepth: 0.004 }); k.every(1500, 6000, () => k.burst(0.02, 0.04, { freq: 1500, q: 3 })); k.every(20000, 50000, () => { k.hit(60, 1.4, 0.05, 'sawtooth', { to: 30, cutoff: 300 }); }); },
      click: (k) => k.burst(0.03, 0.06, { freq: 900, q: 2 }), outage: SFX.powerDown,
      secrets: { punch: 'Punch it! (The hyperdrive coughs.)', smuggle: 'The cargo is definitely, absolutely not contraband.' },
    },
    {
      id: 'spaceodyssey', cat: MOV, name: 'Space Odyssey', sub: 'White minimal ship, calm computer', light: true, calm: true, noScare: true, voice: true, voicePitch: 0.7, voiceRate: 0.85,
      pal: ['#e6e6e6', '#fafafa', '#1a1a1a', '#c81e28', '#cfcfcf', '#ffffff'],
      bgcss: 'repeating-linear-gradient(90deg, rgba(0,0,0,.035) 0 2px, transparent 2px 90px), linear-gradient(#f2f2f2, #d8d8d8)',
      swatch: 'radial-gradient(circle at 50% 50%, #c81e28 0 6px, #2a0000 7px 10px, #c8c8cc 11px)',
      css: '[data-theme="spaceodyssey"] .card,[data-theme="spaceodyssey"] .stat,[data-theme="spaceodyssey"] .now-playing{border-radius:2px;box-shadow:0 1px 0 rgba(0,0,0,.08)}[data-theme="spaceodyssey"] .page-head h1{font-weight:300;letter-spacing:.3em}',
      mascot: LENS, eye: '#ff2a20', rec: 'MISSION · JUPITER', meter: 'LIFE SUPPORT',
      voiceHello: 'Good afternoon. Everything is running smoothly.', voiceDown: 'I am afraid the connection has been lost.', voiceUp: 'The connection is back. I am feeling much better now.',
      idleSay: 'Are you still there? I have been watching the queue for you.',
      alert: '🔴 I am afraid the connection to the bot has been lost. Reconnecting…',
      amb: (k) => { breathe(k, 0.01); k.tone({ f: 60, gain: 0.004 }); },
      click: (k) => k.hit(1600, 0.05, 0.015), outage: SFX.powerDown,
      secrets: { daisy: 'The computer starts humming an old tune, very slowly.', calm: 'Everything is under control. Please keep listening.' },
    },
    {
      id: 'wormhole', cat: MOV, name: 'Wormhole Run', sub: 'Black hole lens, time dilation', calm: true, voice: true,
      pal: ['#000000', '#0c0c10', '#efefef', '#c8a46a', '#2c2c34', '#120a00'], fx: 'stars',
      bgcss: 'radial-gradient(ellipse 34% 10% at 65% 40%, rgba(255,220,160,.5), rgba(200,164,106,.2) 40%, transparent 70%), radial-gradient(circle at 65% 40%, #000 0 50px, rgba(255,220,160,.6) 52px, transparent 70px), #000',
      swatch: 'radial-gradient(ellipse 60% 18% at 50% 50%, #ffdca0, transparent 70%), radial-gradient(circle, #000 0 10px, #ffdca0 11px, transparent 14px), #0c0c10',
      rec: '1 HOUR = 7 YEARS', meter: 'FUEL', voiceHello: 'Approaching the wormhole. Every hour here costs years.',
      alert: '🕳 LOST TIME: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.every(1250, 1250, () => k.burst(0.012, 0.03, { type: 'highpass', freq: 3500 })); let c = 0; const ch = [[110, 165, 220], [98, 147, 196], [131, 196, 262]]; k.every(8000, 8000, () => ch[c++ % 3].forEach((f) => { k.hit(f, 8, 0.01, 'sawtooth', { attack: 3, cutoff: 900 }); k.hit(f * 2, 8, 0.005, 'sine', { attack: 3 }); })); },
      click: (k) => k.hit(880, 0.08, 0.02), outage: SFX.groan,
      secrets: { tick: 'Each tick is a day back home.', dust: 'The dust on the floor spelled out a song name.' },
    },
    {
      id: 'beltminer', cat: MOV, name: 'Belt Miner', sub: 'Hard sci-fi, thrust alarms', ...ship,
      pal: ['#07090b', '#12161a', '#e4eaee', '#ff6a3d', '#2e363e', '#160400'], font: 'mono', fx: 'ash', fxColor: '#8a9098',
      bgcss: 'radial-gradient(circle at 15% 20%, rgba(138,144,152,.18) 0 18px, transparent 19px), radial-gradient(circle at 85% 70%, rgba(138,144,152,.14) 0 30px, transparent 31px), #07090b',
      swatch: 'radial-gradient(circle at 30% 40%, #8a9098 0 6px, transparent 7px), radial-gradient(circle at 70% 60%, #8a9098 0 9px, transparent 10px), #12161a',
      rec: 'THE BELT', meter: 'REACTION MASS', voiceHello: 'Reactor nominal. Stand by for burn.',
      alert: '⚠ HIGH-G BURN: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.tone({ f: 72, type: 'sawtooth', gain: 0.004, cutoff: 260 }); k.noise({ freq: 200, gain: 0.02 }); k.every(25000, 60000, () => { for (let i = 0; i < 3; i++) { k.hit(740, 0.2, 0.02, 'square', { when: i * 0.5 }); k.hit(988, 0.2, 0.02, 'square', { when: i * 0.5 + 0.22 }); } }); },
      click: (k) => k.hit(1100, 0.04, 0.025, 'square'), outage: klaxon,
      secrets: { thrust: 'Burn starting. Everyone strap in.', ice: 'Ice haul delivered. Water rations are up.' },
    },
    {
      id: 'orbit', cat: MOV, name: 'Orbit', sub: 'Earth below, drifting debris', calm: true, voice: true,
      pal: ['#02040a', '#0a1020', '#e8eef8', '#6fb8ff', '#203050', '#02101f'], fx: 'ash', fxColor: '#9aa8b8',
      bgcss: 'radial-gradient(circle at 50% 210%, #3a7ac8 0 70%, #8ac8ff 71%, rgba(140,200,255,.25) 73%, transparent 78%), #02040a',
      swatch: 'radial-gradient(circle at 50% 180%, #3a7ac8 0 70%, #8ac8ff 72%, transparent 76%), #02040a',
      css: '[data-theme="orbit"] .card,[data-theme="orbit"] .stat{transition:transform 9s ease-in-out}[data-pz-stage="2"][data-theme="orbit"] .card,[data-pz-stage="3"][data-theme="orbit"] .card{transform:rotate(-.5deg) translateY(4px)}[data-pz-stage="2"][data-theme="orbit"] .stat:nth-child(odd),[data-pz-stage="3"][data-theme="orbit"] .stat:nth-child(odd){transform:rotate(.8deg) translateY(-3px)}',
      rec: 'LOW ORBIT', meter: 'O₂', voiceHello: 'Houston, the panel is online.', voiceDown: 'Lost contact with the ground. Anyone copy?',
      alert: '🛰 DEBRIS IMPACT: connection to the bot lost. Reconnecting…',
      amb: (k) => { breathe(k, 0.01); radio(k); },
      click: (k) => k.burst(0.03, 0.04, { freq: 1600, q: 2 }), outage: (k) => k.burst(1.6, 0.06, { freq: 1600, q: 1 }),
      secrets: { tether: 'Tether attached. You are not drifting. Yet.', earth: 'Sunrise over the planet. It happens every 90 minutes up here.' },
    },
    {
      id: 'darkempire', cat: MOV, name: 'Dark Empire', sub: 'Cold black and grey, marching', ...ship, voicePitch: 0.5,
      pal: ['#050506', '#111113', '#e6e6ea', '#c22a2a', '#2c2c32', '#ffffff'], font: 'mono',
      bgcss: 'repeating-linear-gradient(0deg, rgba(60,60,70,.3) 0 2px, transparent 2px 46px), repeating-linear-gradient(90deg, rgba(60,60,70,.3) 0 2px, transparent 2px 46px), #050506',
      swatch: 'linear-gradient(90deg, #111113 0 40%, #c22a2a 40% 60%, #111113 60%)',
      css: '[data-theme="darkempire"] .card,[data-theme="darkempire"] .stat,[data-theme="darkempire"] .now-playing{clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))}[data-theme="darkempire"] .page-head h1{letter-spacing:.25em}',
      rec: 'COMMAND DECK', meter: 'ORDER', voiceHello: 'All systems under control.',
      alert: '⬛ REBEL SABOTAGE: connection to the bot lost. Reconnecting…',
      amb: (k) => { let i = 0; k.every(500, 500, () => { if (i++ % 2 === 0) k.hit(60, 0.25, 0.05, 'sine', { to: 38 }); else k.burst(0.06, 0.03, { color: 'brown', type: 'lowpass', freq: 300 }); }); [55, 65.4, 82.4].forEach((f) => k.tone({ f, type: 'sawtooth', gain: 0.003, cutoff: 300 })); },
      click: (k) => k.hit(240, 0.06, 0.03, 'square', { cutoff: 800 }), outage: klaxon,
      secrets: { order: 'Order restored. The playlist will be alphabetized.', fleet: 'The fleet is assembled. They all want to request a song.' },
    },
    {
      id: 'rebelhangar', cat: MOV, name: 'Rebel Hangar', sub: 'Orange flight suits, droid chirps', ...ship,
      pal: ['#0a0806', '#1a1610', '#f2eadc', '#ff8a1e', '#3e3426', '#160800'], fx: 'dust', fxColor: '#ffb070',
      bgcss: 'linear-gradient(transparent 70%, rgba(255,138,30,.06) 70%), repeating-linear-gradient(90deg, rgba(62,52,38,.5) 0 3px, transparent 3px 140px), #0a0806',
      swatch: 'linear-gradient(135deg, #ff8a1e 0 40%, #f2eadc 40% 50%, #1a1610 50%)',
      rec: 'HANGAR BAY', meter: 'SQUADRON', voiceHello: 'All pilots to the hangar.',
      alert: '🛩 SQUADRON SCRAMBLE: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ color: 'pink', type: 'bandpass', freq: 300, q: 0.4, gain: 0.02 }); k.every(5000, 15000, () => { for (let i = 0; i < 5; i++) k.hit(rnd(1500, 3500), 0.07, 0.01, 'sine', { to: rnd(1500, 4000), when: i * 0.08 }); }); k.every(25000, 60000, () => k.hit(80, 2.5, 0.03, 'sawtooth', { to: 400, cutoff: 1200, attack: 0.8 })); },
      click: (k) => k.hit(rnd(2000, 3200), 0.06, 0.015, 'sine', { to: rnd(1500, 4000) }), outage: klaxon,
      secrets: { hope: 'There is always hope. And always another song.', droid: 'The droid beeped something rude. You choose to ignore it.' },
    },
    {
      id: 'oceanworld', cat: MOV, name: 'Ocean World Station', sub: 'A living ocean below, dreamy and wrong', calm: true, noScare: true, voice: true,
      pal: ['#020a0c', '#081a1e', '#dff6f4', '#5fd8c8', '#174044', '#02140f'], fx: 'dust', fxColor: '#5fd8c8', fog: ['#5fd8c8', 0.12],
      bgcss: 'radial-gradient(ellipse 120% 40% at 50% 120%, rgba(95,216,200,.3), transparent 70%), #020a0c',
      swatch: 'radial-gradient(ellipse 120% 50% at 50% 110%, #5fd8c8, transparent 70%), #081a1e',
      rec: 'OBSERVATION DECK', meter: 'MEMORY', voiceHello: 'The ocean is calm today. It is thinking.',
      idleSay: 'Someone you remember is standing behind you.',
      alert: '🌊 THE OCEAN TOOK THE SIGNAL: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ freq: 220, gain: 0.04, lfoRate: 0.08, lfoDepth: 0.03 }); [196, 247, 294].forEach((f, i) => k.tone({ f, gain: 0.003, lfoRate: 0.03 + i * 0.02, lfoDepth: 0.002 })); },
      click: (k) => SFX.chime(k, 784), outage: SFX.moan,
      secrets: { ocean: 'The ocean formed a shape. It looked like your playlist.', guest: 'A guest arrived on the station. Nobody docked.' },
    },

    // ======================= Space Games =======================
    {
      id: 'galacticcommander', cat: GAME, name: 'Galactic Commander', sub: 'Galaxy map, blue and orange choices', ...ship,
      pal: ['#03060c', '#0a1424', '#e6eefa', '#3ea8ff', '#1c3454', '#020e1c'], fx: 'stars',
      bgcss: 'radial-gradient(ellipse 50% 30% at 50% 50%, rgba(62,168,255,.14), transparent 70%), radial-gradient(circle at 50% 50%, transparent 0 160px, rgba(62,168,255,.1) 161px 162px, transparent 163px 260px, rgba(255,140,40,.08) 261px 262px, transparent 263px), #03060c',
      swatch: 'linear-gradient(90deg, #3ea8ff 0 50%, #ff8c28 50%)',
      css: '[data-theme="galacticcommander"] .card-head h3{border-left:3px solid #3ea8ff;padding-left:8px}[data-theme="galacticcommander"] .stat:nth-child(even){border-color:rgba(255,140,40,.5)}',
      rec: 'GALAXY MAP', meter: 'FUEL', voiceHello: 'Commander on deck. Galaxy map ready.',
      alert: '🌀 RELAY OFFLINE: connection to the bot lost. Reconnecting…',
      amb: (k) => { [110, 165, 247, 330].forEach((f, i) => k.tone({ f, type: i ? 'sine' : 'triangle', gain: 0.004, lfoRate: 0.05 + i * 0.03, lfoDepth: 0.003 })); k.every(6000, 14000, () => chirp(k)); },
      click: chirp, outage: klaxon,
      secrets: { paragon: 'Choice made: the kind one. Blue points earned.', renegade: 'Choice made: the rude one. Red points earned.' },
    },
    {
      id: 'timeloop', cat: GAME, name: 'Time Loop Explorer', sub: 'Campfire banjo, a 22-minute loop', calm: true, noScare: true,
      pal: ['#070a10', '#121826', '#f0ece0', '#ff9a3c', '#2c3448', '#160800'], fx: 'embers', fxColor: '#ffb060',
      bgcss: 'radial-gradient(ellipse at 50% 115%, rgba(255,154,60,.25), transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,240,200,.15) 0 30px, transparent 31px), #070a10',
      swatch: 'radial-gradient(ellipse at 50% 100%, #ff9a3c, transparent 55%), radial-gradient(circle at 75% 25%, #fff0c8 0 5px, transparent 6px), #121826',
      rec: 'LOOP 22:00', meter: 'OXYGEN',
      idleSay: 'The sun is getting bigger. You have a few minutes left in this loop.',
      alert: '💥 SUPERNOVA: the loop reset and the connection dropped. Reconnecting…',
      amb: (k) => { k.every(150, 900, () => k.burst(0.01, 0.025, { freq: rnd(2500, 4500) })); const n = [196, 247, 294, 330, 392, 440]; let i = 0; k.every(600, 600, () => { if (Math.random() < 0.6) pluck(k, n[(i += pick([1, 2, -1])) % 6 < 0 ? 0 : i % 6], 0.012); }); },
      click: (k) => pluck(k, 440, 0.02), outage: (k) => { k.hit(60, 3, 0.08, 'sawtooth', { to: 400, attack: 2.4, cutoff: 1500 }); k.burst(1.5, 0.1, { color: 'brown', type: 'lowpass', freq: 400, when: 2.6 }); },
      secrets: { loop: 'You wake up by the campfire. Again.', marshmallow: '🔥 Marshmallow: perfectly toasted. This loop was worth it.' },
    },
    {
      id: 'procedural', cat: GAME, name: 'Procedural Planets', sub: 'A new planet color every visit', calm: true, voice: true,
      pal: [hsl(40, 6), hsl(35, 12), hsl(30, 93), hsl(80, 62), hsl(30, 28), hsl(60, 8)], fx: 'stars',
      bgcss: `radial-gradient(circle at 80% 110%, ${hsl(60, 45)} 0 260px, ${hsl(70, 70)} 262px, transparent 280px), radial-gradient(ellipse at 20% 0, hsl(${(h + 120) % 360} 50% 20% / .4), transparent 50%), ${hsl(40, 6)}`,
      swatch: `radial-gradient(circle at 70% 120%, ${hsl(60, 45)} 0 40px, transparent 41px), ${hsl(35, 12)}`,
      rec: 'NEW PLANET DISCOVERED', meter: 'HAZARD', voiceHello: 'New planet discovered. Naming rights are yours.',
      alert: '🪐 EXOSUIT FAILURE: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.noise({ type: 'bandpass', freq: 600, q: 0.5, gain: 0.02, lfoRate: 0.06, lfoDepth: 0.012 }); k.every(5000, 5000, () => k.hit(400, 1.2, 0.012, 'sine', { to: 1600, attack: 0.2 })); },
      click: (k) => k.hit(1200, 0.06, 0.02, 'triangle'), outage: SFX.sad,
      secrets: { scan: 'Scan complete: 3 new species, all of them confused.', name: 'You named the planet after your favourite song.' },
    },
    {
      id: 'jumpmap', cat: GAME, name: 'Jump Map', sub: 'Pixel ship map, power bars', ...ship,
      pal: ['#0a0c10', '#161a22', '#e8ecf2', '#56e06a', '#2c3444', '#041404'], font: 'mono', fx: 'stars',
      bgcss: 'radial-gradient(circle, rgba(232,236,242,.08) 1px, transparent 1.5px) 0 0 / 10px 10px, #0a0c10',
      swatch: 'linear-gradient(90deg, #56e06a 0 15%, transparent 15% 20%, #56e06a 20% 35%, transparent 35% 40%, #f0c040 40% 55%, #161a22 55%)',
      css: '[data-theme="jumpmap"] .card,[data-theme="jumpmap"] .stat,[data-theme="jumpmap"] .now-playing{border:2px solid var(--border);border-radius:0;box-shadow:3px 3px 0 #000}',
      rec: 'SECTOR 1 · BEACON 3', meter: 'HULL', voiceHello: 'Jump drive charged. Pick a beacon.',
      alert: '👾 SHIP DESTROYED: connection to the bot lost. Reconnecting…',
      amb: (k) => { k.tone({ f: 110, type: 'triangle', gain: 0.004, lfoRate: 0.1, lfoDepth: 0.003 }); k.every(3000, 8000, () => { for (let i = 0; i < 3; i++) k.hit(pick([523, 659, 784]), 0.1, 0.008, 'square', { when: i * 0.12 }); }); },
      click: (k) => k.hit(1046, 0.05, 0.03, 'square'), outage: SFX.gameOver,
      secrets: { jump: 'Jumped to the next beacon. A merchant wants to sell you a song.', rebels: 'The pursuit fleet advances one sector.' },
    },
    {
      id: 'cockpitpilot', cat: GAME, name: 'Cockpit Pilot', sub: 'Heading, speed, docking computer', ...ship,
      pal: ['#04070a', '#0c141a', '#e2eef4', '#ff9e2c', '#203440', '#160800'], fx: 'warp', fxColor: '#ffd9a0',
      bgcss: 'radial-gradient(ellipse at 50% 110%, rgba(255,158,44,.14), transparent 50%), #04070a',
      swatch: 'repeating-conic-gradient(from 0deg at 50% 50%, #ffd9a0 0 2deg, transparent 2deg 24deg), #0c141a',
      css: '[data-theme="cockpitpilot"] #tp-frame{display:block}[data-theme="cockpitpilot"] .card,[data-theme="cockpitpilot"] .stat,[data-theme="cockpitpilot"] .now-playing{border-color:rgba(255,158,44,.4)}',
      rec: 'HDG 274 · 312 M/S', meter: 'FUEL', voiceHello: 'Docking request granted. Docking computer engaged.',
      alert: '🛸 MASS LOCKED: connection to the bot lost. Reconnecting…',
      amb: (k) => {
        hum(k, 58, 0.012);
        // A short public-domain waltz phrase, now and then, like a docking computer.
        const waltz = [294, 294, 370, 440, 440, 0, 880, 880, 740, 740];
        k.every(70000, 140000, () => waltz.forEach((f, i) => f && k.hit(f, 0.5, 0.012, 'triangle', { when: i * 0.32 })));
      },
      click: (k) => k.hit(1320, 0.04, 0.02, 'square'), outage: klaxon,
      secrets: { dock: 'Docking computer engaged. Waltz playing.', boost: 'Boost! The panel is going 50% faster (it is not).' },
    },
  ];
});
