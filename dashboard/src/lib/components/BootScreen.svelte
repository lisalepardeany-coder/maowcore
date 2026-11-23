<script lang="ts">
  import { onMount } from 'svelte';
  import { currentTheme } from '$lib/stores/theme';
  import { bootOverride } from '$lib/stores/boot';
  import { CINE_BOOTS, type CineBoot } from '$lib/boot-profiles';
  import { resumeAudio, setVolume, sfx } from '$lib/boot-sounds';
  import { bootLine, netLine, hackLine, pwGuess, intrusionTarget, sessionHash } from '$lib/boot-content';

  // `preview` (from the Boot Lab) wins; otherwise an explicit override; otherwise
  // the active theme's boot.
  let { onDone, preview = null }: { onDone: () => void; preview?: string | null } = $props();
  let profile = $derived(preview ?? ($bootOverride !== 'auto' ? $bootOverride : $currentTheme.boot));
  let themeId = $derived($currentTheme.id);

  // If the resolved profile is one of the data-driven cinematic boots, this is
  // its config; the generic cine renderer/sounds/timers key off it.
  let cine = $derived<CineBoot | null>(CINE_BOOTS.find((b) => b.id === profile) ?? null);
  // Cine boots carry their own palette so they look right regardless of theme.
  let cineVars = $derived(
    cine ? `--accent:${cine.accent};--accent-2:${cine.accent2 ?? cine.accent};--accent-3:${cine.accent2 ?? cine.accent};--success:${cine.accent};` : '',
  );
  // NOTE: use optional chaining (not `cine && (… || …)`) — a Svelte/minifier codegen
  // quirk can drop the guarding parens, turning it into `cine && a || cine.group…`
  // which throws on null `cine` (any built-in boot). Flat `?.` is immune.
  let cineStream = $derived(cine?.group === 'Server' || cine?.group === 'Hacker' || cine?.style === 'machine');
  let gateTitle = $derived(
    cine
      ? cine.group === 'Hacker' ? '⌬ INTRUSION'
      : cine.group === 'Backrooms' ? '▣ NO SIGNAL'
      : cine.group === 'Machine' ? `◉ ${cine.title}`
      : '◆ MAOWCORE'
      : profile === 'hacker' ? '⌬ INTRUSION' : '◆ MAOWCORE',
  );
  let gateBtn = $derived(
    profile === 'hacker' || cine?.group === 'Hacker' ? '▶ BREACH SYSTEM'
    : cine?.group === 'Backrooms' ? '▶ PRESS PLAY ▶'
    : '▶ PRESS TO BOOT',
  );

  let phase = $state<'gate' | 'running'>('gate');
  let step = $state(0);
  let fading = $state(false);
  let muted = $state(false);
  let soundEnabled = false;
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let finished = false;
  let raf = 0;
  let timers: any[] = [];

  // Hacker-specific state
  let stream = $state<string[]>([]);
  let stage = $state(0);
  let stageBanner = $state('ESTABLISHING CONNECTION');
  let stageSub = $state('');
  let cracked = $state('');
  let granted = $state(false);
  let overallPct = $state(0);
  let targetIp = '';
  let rpm = $state(0);          // engine tachometer 0..100
  let countdown = $state(10);   // launch countdown
  let lifted = $state(false);   // launch liftoff
  let viewers = $state(0);      // twitch stream viewer count
  let live = $state(false);     // twitch GOING LIVE
  let recTime = $state(0);      // backrooms VHS timestamp (seconds)
  let recClock = $derived(`SP  0:${String(Math.floor(recTime / 60)).padStart(2, '0')}:${String(recTime % 60).padStart(2, '0')}`);

  const rnd = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
  const dots = (t: string) => '.'.repeat(Math.max(3, 26 - t.length));

  const LINES: Record<string, string[]> = {
    terminal: ['Power-on self test', 'Detecting hardware · 16 CPUs', 'Loading kernel modules', 'Initializing memory map', 'Mounting /dev/audio', 'Probing yt-dlp + ffmpeg', 'Starting daemons', 'Loading library manifest', 'Establishing uplink', 'Authenticating gateway', 'System ready'],
    hud: ['Initializing reactor core', 'Spinning up coolant loop', 'Calibrating sensor array', 'Scanning subsystems', 'Linking neural interface', 'Mapping voice channels', 'Decrypting channels', 'Loading combat protocols', 'Arming systems', 'Synchronizing telemetry', 'SYSTEM ONLINE'],
    cosmic: ['Spooling warp core', 'Charging dilithium matrix', 'Aligning star charts', 'Plotting jump vector', 'Engaging thrusters', 'Spinning up the drive', 'Entering hyperspace'],
  };
  const STEP_MS: Record<string, number> = { terminal: 360, hud: 430, cosmic: 620 };
  const DURATION: Record<string, number> = { terminal: 5600, hud: 6800, cosmic: 5800, matrix: 6400, synthwave: 5400, arcade: 5200, minimal: 1600, hacker: 11000, vr: 7200, engine: 6400, server: 7600, launch: 8800, rig: 6600, stream: 6200, equalizer: 5400, discord: 5800 };
  let lines = $derived(LINES[profile] ?? []);
  const hasStream = (p: string) => p === 'terminal' || p === 'hud' || p === 'hacker' || p === 'server';

  // Step-revealed line sets for the new scenes.
  const VR_LINES = ['Headset detected · IPD 63mm', 'Display 2160×2160 @ 120Hz', 'Calibrating tracking · base station 1/2', 'Calibrating tracking · base station 2/2', 'Establishing room boundary', 'Loading world: MaowCore Hub', 'Streaming avatars · 8 nearby', 'Spawning avatar · shaders compiling'];
  const ENGINE_LINES = ['ABS', 'Traction', 'Turbo boost', 'Oil temp', 'Coolant', 'Telemetry'];
  const SERVER_LINES = ['POST · CPU 16C/32T OK', 'Memory 64GB ECC · 0 errors', 'RAID-10 array · 8 disks online', 'SMART check · all healthy', 'Mounting volumes · /srv /var /db', 'Network bonding · 10GbE x2', 'Firewall rules loaded · 247', 'Starting services · 47 daemons'];
  const RIG_LINES = ['GPU · RTX online · 24GB VRAM', 'CPU · 16 cores @ 5.8GHz', 'RAM · 64GB DDR5 @ 6400', 'NVMe · 7000MB/s read', 'Cooling · pump + 9 fans @ 100%', 'RGB · 1.6M colors synced', 'Anti-cheat · trusted'];
  const STREAM_LINES = ['Encoder · x264 · 1080p60', 'Bitrate · 6000 kbps CBR', 'Connecting to ingest server', 'Audio · 48kHz stereo', 'Scene · Starting Soon', 'Chat relay connected'];
  const EQ_LINES = ['Loading your library', 'Syncing 1,284 liked songs', 'Restoring playback queue', 'Crossfade · 5s', 'Connecting to devices'];
  const DISCORD_LINES = ['Authenticating session', 'Fetching servers · 4 found', 'Loading channels & members', 'Connecting to gateway', 'Subscribing to events', 'Voice engine ready'];
  const DISCORD_TIPS = [
    'Use /play with a Spotify or SoundCloud link — MaowCore resolves it automatically.',
    'Drag songs in the queue to reorder them on the Home page.',
    'Press Ctrl/⌘ + K anywhere to open the command palette.',
    'Try /lyrics — they auto-sync to whatever is playing.',
    'You can theme the entire dashboard — even this boot screen.',
    'Set a 24/7 voice channel in Settings → Player & Bot.',
    'The Soundboard plays clips straight to voice with one click.',
  ];
  let tip = $state(DISCORD_TIPS[0]);

  // Engine tachometer needle: rpm 0..100 maps to a 180°→0° sweep (left→right).
  let needleAngle = $derived(((180 - Math.min(100, rpm) * 1.8) * Math.PI) / 180);
  let needleX = $derived(100 + 70 * Math.cos(needleAngle));
  let needleY = $derived(100 - 70 * Math.sin(needleAngle));

  const HACK_STAGES = [
    { t: 0, banner: 'ESTABLISHING CONNECTION' },
    { t: 1500, banner: 'BYPASSING FIREWALL' },
    { t: 3000, banner: 'BRUTE-FORCE ATTACK' },
    { t: 6200, banner: 'INJECTING PAYLOAD' },
    { t: 7800, banner: 'DECRYPTING VAULT' },
    { t: 9000, banner: 'ACCESS GRANTED' },
  ];

  function scheduleSounds() {
    const s = sfx;
    if (profile === 'hacker') {
      for (let i = 0; i < 120; i++) s.typeClick(i * 0.072);
      s.powerHum(0, 1.0);
      s.beep(0.1, 440); s.beep(1.5, 600);
      s.siren(3.0, 3.0);
      s.glitch(6.2); s.glitch(6.8);
      s.beep(7.8, 820);
      s.whoosh(8.9, 0.8); s.chime(9.1); s.bootDone(9.1);
    } else if (profile === 'terminal') {
      s.powerHum(0, 1.2);
      lines.forEach((_, i) => { s.typeClick(0.3 + i * 0.36); s.beep(0.38 + i * 0.36, 560 + i * 50); });
      for (let i = 0; i < 40; i++) s.typeClick(0.3 + Math.random() * 3.5);
      s.bootDone(0.3 + lines.length * 0.36);
    } else if (profile === 'hud') {
      if (themeId === 'crimson') { s.siren(0, 2.2); s.siren(2.3, 1.6); } else s.riser(0, 1.8);
      s.glitch(0.4);
      lines.forEach((_, i) => s.beep(0.5 + i * 0.47, 900 + (i === lines.length - 1 ? 600 : 0)));
      for (let i = 0; i < 30; i++) s.typeClick(0.5 + Math.random() * 4);
      s.whoosh(0.5 + lines.length * 0.47, 0.6); s.bootDone(0.5 + lines.length * 0.47 + 0.3);
    } else if (profile === 'cosmic') {
      s.warp(0.3, 2.0); lines.forEach((_, i) => s.blip(0.4 + i * 0.7, 500 + i * 120)); s.whoosh(3.0, 0.8); s.chime(3.4);
    } else if (profile === 'matrix') {
      for (let i = 0; i < 14; i++) s.typeClick(0.4 + i * 0.18); s.glitch(1.2); s.glitch(2.6); s.glitch(4.0); s.powerHum(0, 0.8); s.beep(3.0, 440); s.bootDone(4.6);
    } else if (profile === 'synthwave') {
      s.arpUp(0.2); s.whoosh(0.1, 0.7); s.arpUp(1.4, [392, 494, 587, 784, 988]); s.bootDone(3.2);
    } else if (profile === 'arcade') {
      s.coin(0.1); s.chime(1.4); s.arpUp(1.6, [523, 659, 784, 1047]); s.blip(3.0, 1320);
    } else if (profile === 'vr') {
      s.powerHum(0, 1.6); s.blip(0.5, 700); s.blip(1.0, 880); s.blip(1.5, 1040); s.chime(2.2); s.arpUp(4.6, [523, 659, 784, 1047, 1319]); s.bootDone(5.4);
    } else if (profile === 'engine') {
      s.powerHum(0, 1.0); for (let i = 0; i < 8; i++) s.typeClick(0.2 + i * 0.06); // crank
      s.warp(0.8, 1.4); lines.forEach((_, i) => s.beep(2.6 + i * 0.3, 1000)); s.warp(4.0, 0.8); s.bootDone(4.6);
    } else if (profile === 'server') {
      s.powerHum(0, 2.4); s.beep(0.3, 1200); for (let i = 0; i < 50; i++) s.typeClick(0.3 + Math.random() * 5); s.beep(5.0, 880); s.bootDone(5.8);
    } else if (profile === 'launch') {
      for (let i = 0; i < 10; i++) s.beep(i * 0.5, i < 3 ? 1100 : 660); // countdown
      s.warp(4.6, 1.0); s.riser(5.0, 2.4); s.whoosh(5.0, 2.4); s.bootDone(7.4);
    } else if (profile === 'rig') {
      s.whoosh(0, 1.2); s.powerHum(0, 1.0); lines.forEach((_, i) => s.beep(0.6 + i * 0.4, 700 + i * 80)); s.coin(3.0); s.arpUp(3.6, [523, 659, 784, 1047]); s.bootDone(4.4);
    } else if (profile === 'stream') {
      s.blip(0.3, 880); s.blip(0.8, 1100); STREAM_LINES.forEach((_, i) => s.blip(1.2 + i * 0.4, 700 + i * 60)); s.coin(4.0); s.arpUp(4.4, [659, 784, 988]); s.bootDone(5.2);
    } else if (profile === 'equalizer') {
      s.arpUp(0.2, [523, 587, 659, 784, 880]); EQ_LINES.forEach((_, i) => s.blip(1.0 + i * 0.4, 600 + i * 90)); s.chime(3.4); s.bootDone(4.2);
    } else if (profile === 'discord') {
      s.blip(0.3, 587); s.blip(0.5, 740); DISCORD_LINES.forEach((_, i) => s.blip(1.0 + i * 0.4, 660)); s.blip(3.7, 880); s.blip(3.85, 1175); s.bootDone(4.0);
    } else if (cine) {
      const end = cine.duration / 1000 - 0.4;
      if (cine.style === 'vhs') {
        // analog tape: low hum, warbling glitches, dull thunks per line, drop-out at end.
        s.powerHum(0, 1.6); for (let i = 0; i < 7; i++) s.glitch(0.3 + i * 0.7);
        cine.lines.forEach((_, i) => s.beep(0.7 + i * 0.5, 180 + i * 14));
        s.glitch(end - 0.2); s.glitch(end);
      } else if (cine.style === 'machine') {
        // cold surveillance: rapid scanning blips, a low confirm, verdict chime.
        s.powerHum(0, 1.4); for (let i = 0; i < 28; i++) s.blip(0.2 + i * 0.13, 1500 + (i % 3) * 240);
        cine.lines.forEach((_, i) => s.beep(1.0 + i * 0.45, 520));
        s.chime(end - 0.5); s.bootDone(end);
      } else if (cine.style === 'rain') {
        for (let i = 0; i < 16; i++) s.typeClick(0.3 + i * 0.16); s.glitch(1.0); s.glitch(2.6); s.powerHum(0, 0.8); s.beep(3.0, 440); s.bootDone(end);
      } else {
        // log style (server / hacker / cinematic): hum + typed lines + ambient keys.
        s.powerHum(0, 1.4);
        cine.lines.forEach((_, i) => { s.typeClick(0.3 + i * 0.34); s.beep(0.38 + i * 0.34, 560 + i * 36); });
        for (let i = 0; i < 36; i++) s.typeClick(0.3 + Math.random() * (end - 0.6));
        if (cine.group === 'Hacker') { s.glitch(end - 1.0); s.beep(end - 0.6, 820); }
        s.bootDone(end);
      }
    } else s.chime(0);
  }

  function runHacker() {
    targetIp = intrusionTarget();
    stageSub = `target // ${targetIp}`;
    const PW = pwGuess(16);
    const streamIv = setInterval(() => {
      const add: string[] = [];
      const n = rnd(2, 4);
      for (let i = 0; i < n; i++) add.push(stage >= 2 && stage < 4 ? hackLine() : stage < 2 ? netLine() : bootLine());
      stream = [...stream, ...add].slice(-30);
    }, 55);
    timers.push(streamIv);
    HACK_STAGES.forEach((st, i) => timers.push(setTimeout(() => {
      stage = i; stageBanner = st.banner;
      if (i === 1) stageSub = `firewall @ ${targetIp} ... EVADED`;
      else if (i === 2) stageSub = 'cracking root credentials';
      else if (i === 3) stageSub = `uploading rootkit → ${targetIp}`;
      else if (i === 4) stageSub = 'AES-256-GCM ... brute-forcing key';
      else if (i === 5) { granted = true; stageSub = `session ${sessionHash().slice(0, 16)}`; }
    }, st.t)));
    const t0 = performance.now();
    const progIv = setInterval(() => { overallPct = Math.min(100, ((performance.now() - t0) / DURATION.hacker) * 100); }, 60);
    timers.push(progIv);
    const cS = 3000, cE = 6200;
    const crackIv = setInterval(() => {
      const now = performance.now() - t0;
      if (now < cS) { cracked = ''; return; }
      if (now > cE) { cracked = PW; return; }
      const lock = Math.floor(((now - cS) / (cE - cS)) * PW.length);
      cracked = PW.slice(0, lock) + Array.from({ length: PW.length - lock }, () => pwGuess(1)).join('');
    }, 45);
    timers.push(crackIv);
  }

  function start() {
    if (phase !== 'gate') return;
    phase = 'running';
    if (soundEnabled && !muted) { resumeAudio(); scheduleSounds(); }
    if (profile === 'matrix' || cine?.style === 'rain') startRain();
    if (profile === 'hacker') runHacker();
    else if (hasStream(profile) || cineStream) {
      const iv = setInterval(() => { stream = [...stream, ...Array.from({ length: rnd(1, 3) }, () => (Math.random() > 0.5 ? bootLine() : netLine()))].slice(-26); }, 70);
      timers.push(iv);
    }
    // Backrooms VHS running timestamp.
    if (cine?.style === 'vhs') {
      recTime = rnd(8, 52);
      const iv = setInterval(() => { recTime++; }, 1000);
      timers.push(iv);
    }
    // Engine tachometer sweep.
    if (profile === 'engine') {
      const t0 = performance.now();
      const iv = setInterval(() => { const e = (performance.now() - t0) / 1000; rpm = e < 2 ? Math.min(100, e * 55) : 60 + Math.sin(e * 6) * 38; }, 35);
      timers.push(iv);
    }
    // Launch countdown.
    if (profile === 'launch') {
      countdown = 10;
      const iv = setInterval(() => { countdown--; if (countdown <= 0) { lifted = true; clearInterval(iv); } }, 500);
      timers.push(iv);
    }
    // Twitch: go live + ticking viewer count.
    if (profile === 'stream') {
      timers.push(setTimeout(() => { live = true; }, 4000));
      const iv = setInterval(() => { if (live) viewers += rnd(3, 40); }, 200);
      timers.push(iv);
    }
    // Discord: cycle "Did you know?" tips while connecting.
    if (profile === 'discord') {
      tip = DISCORD_TIPS[rnd(0, DISCORD_TIPS.length - 1)];
      let ti = DISCORD_TIPS.indexOf(tip);
      const tv = setInterval(() => { ti = (ti + 1) % DISCORD_TIPS.length; tip = DISCORD_TIPS[ti]; }, 1700);
      timers.push(tv);
    }
    if (LINES[profile]) { const ms = STEP_MS[profile]; const iv = setInterval(() => { step++; if (step > lines.length) clearInterval(iv); }, ms); timers.push(iv); }
    else if (cine) { const total = cine.lines.length; const sp = Math.max(300, Math.floor((cine.duration - 1400) / (total + 1))); const iv = setInterval(() => { step++; if (step > total + 1) clearInterval(iv); }, sp); timers.push(iv); }
    else { const sp = profile === 'launch' ? 9999 : profile === 'discord' ? 560 : 700; const iv = setInterval(() => step++, sp); timers.push(iv); }
    timers.push(setTimeout(finish, cine?.duration ?? DURATION[profile] ?? 3500));
  }

  function finish() { if (finished) return; finished = true; fading = true; cancelAnimationFrame(raf); setTimeout(onDone, 550); }

  function startRain() {
    const cv = canvasEl;
    if (!cv) { setTimeout(startRain, 30); return; }
    const ctx = cv.getContext('2d'); if (!ctx) return;
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    const cols = Math.floor(cv.width / 16);
    const drops = Array(cols).fill(0).map(() => Math.random() * -50);
    const chars = 'アァカサタナハマヤラワabcdef0123456789MAOWCORE';
    const tint = cine?.accent ?? '#00ff41';
    const draw = () => {
      ctx.fillStyle = 'rgba(0,4,2,0.12)'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.font = '15px monospace';
      for (let i = 0; i < cols; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const y = drops[i] * 16;
        ctx.fillStyle = Math.random() > 0.96 ? '#ffffff' : tint;
        ctx.fillText(ch, i * 16, y);
        if (y > cv.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
  }

  function toggleMute() { muted = !muted; localStorage.setItem('maow.v2.bootsound', muted ? 'off' : 'on'); }

  onMount(() => {
    soundEnabled = localStorage.getItem('maow.v2.bootsound') !== 'off';
    let vol = 0.5;
    try { const p = JSON.parse(localStorage.getItem('maow.v2.prefs') || '{}'); if (p.soundVolume != null) vol = p.soundVolume; } catch { /* */ }
    setVolume(Math.max(0.25, vol));
    // Preview launches from a click in the Boot Lab (audio already unlocked), so
    // skip the gate and play immediately. Otherwise only auto-start when muted.
    if (preview != null || !soundEnabled) start();
    const skip = () => { if (phase === 'running') finish(); };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => { window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); cancelAnimationFrame(raf); };
  });
</script>

<div class="boot-root fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-black transition-opacity duration-500" class:opacity-0={fading} class:vhs-shake={cine?.style === 'vhs' && phase === 'running'} style="font-family: var(--font-mono);{cineVars}">
  {#if profile === 'matrix' || cine?.style === 'rain'}<canvas bind:this={canvasEl} class="absolute inset-0"></canvas>{/if}
  {#if profile === 'synthwave' || profile === 'cosmic'}<div class="boot-grid pointer-events-none absolute inset-0" class:cosmic={profile === 'cosmic'}></div>{/if}
  {#if cine?.style === 'vhs'}<div class="vhs-bg pointer-events-none absolute inset-0"></div>{/if}
  <div class="boot-scan pointer-events-none absolute inset-0"></div>
  <div class="boot-vignette pointer-events-none absolute inset-0"></div>

  {#if (hasStream(profile) || cineStream) && phase === 'running'}
    <div class="pointer-events-none absolute inset-0 flex flex-col justify-end overflow-hidden p-3 font-mono text-[11px] leading-tight {profile === 'hacker' || cine?.group === 'Hacker' ? 'opacity-30' : 'opacity-15'}" style="color: var(--accent)">
      {#each stream as l}<div class="truncate">{l}</div>{/each}
    </div>
  {/if}

  {#if phase === 'gate'}
    <button class="relative z-10 flex flex-col items-center gap-4" onclick={start}>
      <div class="boot-title text-4xl font-black tracking-[0.3em]" style="color: var(--accent)">{gateTitle}</div>
      {#if cine}<div class="text-xs tracking-[0.3em] text-white/45">{cine.name}</div>{/if}
      <div class="boot-blink rounded-pill border border-current px-6 py-2 text-sm font-bold tracking-[0.3em]" style="color: var(--accent)">{gateBtn}</div>
      <div class="text-[10px] tracking-widest text-white/30">click or press any key · 🔊 sound on</div>
    </button>
  {:else if profile === 'hacker'}
    {#if granted}<div class="hack-flash pointer-events-none absolute inset-0" style="background: var(--accent)"></div>{/if}
    <div class="relative z-10 w-full max-w-2xl px-6 text-center">
      {#if !granted}
        <div class="text-xs tracking-[0.3em] text-white/40">TARGET ACQUIRED</div>
        <div class="hack-banner mt-2 font-display text-3xl font-black" style="color: var(--accent)">{stageBanner}</div>
        <div class="mt-1 text-sm text-white/50">{stageSub}</div>
        {#if cracked}
          <div class="mt-5 inline-block rounded border border-current px-4 py-2 font-mono text-base tracking-[0.2em]" style="color: var(--accent)">ROOT:// <span class="text-white">{cracked}</span><span class="boot-cursor">_</span></div>
        {/if}
        <div class="mx-auto mt-6 h-1.5 max-w-md overflow-hidden rounded-pill bg-white/10"><div class="h-full transition-all" style="width:{overallPct}%; background: var(--accent); box-shadow:0 0 16px var(--accent)"></div></div>
        <div class="mt-1 text-[10px] text-white/30">{Math.round(overallPct)}% · INTRUSION IN PROGRESS · DO NOT DISCONNECT</div>
      {:else}
        <div class="hack-granted">
          <div class="font-display text-5xl font-black sm:text-6xl" style="color: var(--accent); text-shadow:0 0 40px var(--accent)">ACCESS GRANTED</div>
          <div class="mt-4 text-lg tracking-[0.3em] text-white/80">WELCOME, OPERATOR</div>
          <div class="mt-1 text-xs text-white/40">root privileges escalated · {stageSub}</div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="relative z-10 w-full max-w-lg px-6">
      {#if profile === 'arcade'}
        <div class="text-center">
          {#if step < 2}<div class="boot-blink font-display text-2xl font-black tracking-[0.2em]" style="color: var(--accent-2)">INSERT COIN</div>
          {:else}
            <div class="boot-pop font-display text-5xl font-black" style="color: var(--accent)">◆ MAOWCORE</div>
            <div class="mt-3 text-sm tracking-[0.3em] text-white/60">ARCADE EDITION</div>
            {#if step >= 4}<div class="boot-blink mt-6 font-display text-xl font-bold" style="color: var(--accent-3)">PLAYER 1 — START</div>{/if}
          {/if}
        </div>
      {:else if profile === 'matrix'}
        <div class="text-center">
          <div class="font-mono text-sm leading-relaxed" style="color: var(--accent)">
            {#if step >= 1}<div class="boot-line">> Wake up, operator…</div>{/if}
            {#if step >= 3}<div class="boot-line">> The system has you.</div>{/if}
            {#if step >= 5}<div class="boot-line">> Following the white rabbit.</div>{/if}
          </div>
          {#if step >= 6}<div class="boot-pop mt-6 font-display text-4xl font-black" style="color: var(--accent)">◆ MAOWCORE</div>{/if}
        </div>
      {:else if profile === 'synthwave'}
        <div class="text-center">
          <div class="boot-chrome font-display text-5xl font-black tracking-[0.15em]">◆ MAOWCORE</div>
          <div class="mt-2 text-sm tracking-[0.4em]" style="color: var(--accent-2)">OUTRUN MODE</div>
          {#if step >= 3}<div class="boot-blink mt-6 text-lg font-bold" style="color: var(--accent)">ENGAGED</div>{/if}
          <div class="mt-6 h-1 overflow-hidden rounded-pill bg-white/10"><div class="h-full" style="width:{Math.min(100, step * 25)}%; background:linear-gradient(90deg, var(--accent), var(--accent-2))"></div></div>
        </div>
      {:else if profile === 'minimal'}
        <div class="text-center"><div class="boot-pop font-display text-4xl font-extrabold" style="color: var(--accent)">◆ MAOWCORE</div><div class="mt-2 text-xs tracking-[0.3em] text-white/40">LOADING</div></div>
      {:else if profile === 'vr'}
        <div class="text-center">
          <div class="vr-frame mx-auto mb-4 grid h-16 w-28 place-items-center rounded-[40px] border-2 text-2xl" style="border-color: var(--accent)">🥽</div>
          <div class="boot-title font-display text-3xl font-black" style="color: var(--accent)">VR SYSTEM</div>
          <div class="mt-4 min-h-[120px] space-y-1 text-sm">
            {#each VR_LINES as l, i}{#if step > i}<div class="boot-line text-white/70"><span style="color: var(--accent-3)">●</span> {l}</div>{/if}{/each}
          </div>
          {#if step > VR_LINES.length}<div class="boot-pop font-display text-xl font-bold" style="color: var(--accent-2)">WELCOME TO THE METAVERSE</div>{/if}
          <div class="mt-5 h-1 overflow-hidden rounded-pill bg-white/10"><div class="h-full transition-all" style="width:{Math.min(100, step * 20)}%; background:linear-gradient(90deg, var(--accent), var(--accent-3))"></div></div>
        </div>
      {:else if profile === 'engine'}
        <div class="text-center">
          <div class="boot-title font-display text-3xl font-black" style="color: {rpm > 83 ? 'var(--danger)' : 'var(--accent)'}; text-shadow:0 0 24px currentColor">{rpm > 83 ? 'REDLINE' : 'IGNITION'}</div>
          <svg viewBox="0 0 200 116" class="mx-auto mt-3 w-64">
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--surface-2)" stroke-width="9" stroke-linecap="round" />
            <path d="M 169.3 60 A 80 80 0 0 1 180 100" fill="none" stroke="var(--danger)" stroke-width="9" stroke-linecap="round" />
            <line x1="100" y1="100" x2={needleX} y2={needleY} stroke="var(--accent)" stroke-width="3" stroke-linecap="round" />
            <circle cx="100" cy="100" r="6" fill="var(--accent)" />
            <text x="100" y="85" text-anchor="middle" font-size="15" fill="var(--accent)" font-weight="bold">{Math.round(rpm * 90)}</text>
            <text x="100" y="96" text-anchor="middle" font-size="6" fill="var(--muted)">RPM</text>
          </svg>
          <div class="mt-2 flex flex-wrap justify-center gap-2 text-xs">
            {#each ENGINE_LINES as l, i}{#if step > i}<span class="boot-line rounded-full px-2 py-0.5" style="color: var(--accent); border:1px solid var(--accent)">{l} ✓</span>{/if}{/each}
          </div>
          {#if step > ENGINE_LINES.length}<div class="boot-pop mt-4 font-display text-2xl font-black" style="color: var(--accent)">READY TO DRIVE</div>{/if}
        </div>
      {:else if profile === 'server'}
        <div class="w-full max-w-xl">
          <div class="boot-title font-display text-2xl font-black" style="color: var(--accent)">DATACENTER · POST</div>
          <div class="my-4 grid grid-cols-12 gap-1">
            {#each Array(48) as _, i}<div class="led h-2 rounded-sm" style="background: var(--accent); animation-delay:{(i % 12) * 0.08}s"></div>{/each}
          </div>
          <div class="min-h-[120px] space-y-0.5 font-mono text-xs">
            {#each SERVER_LINES as l, i}{#if step > i}<div class="boot-line text-white/70">[ <span style="color: var(--success)">OK</span> ] {l}</div>{/if}{/each}
          </div>
          {#if step > SERVER_LINES.length}<div class="boot-pop mt-2 font-display text-xl font-bold" style="color: var(--accent)">SYSTEM OPERATIONAL</div>{/if}
        </div>
      {:else if profile === 'launch'}
        <div class="relative text-center" class:launch-shake={lifted}>
          <div class="text-xs tracking-[0.4em] text-white/40">MISSION CONTROL</div>
          {#if !lifted}
            <div class="boot-pop my-4 font-display text-7xl font-black tabular-nums sm:text-8xl" style="color: var(--accent); text-shadow:0 0 40px var(--accent)">T-{Math.max(0, countdown)}</div>
            <div class="text-sm text-white/50">{countdown <= 3 ? 'IGNITION SEQUENCE START' : 'all systems nominal'}</div>
          {:else}
            <div class="boot-pop font-display text-5xl font-black" style="color: var(--accent-2); text-shadow:0 0 40px var(--accent-2)">🚀 LIFTOFF</div>
            <div class="mt-3 text-lg tracking-[0.3em] text-white/80">MAOWCORE IN ORBIT</div>
            <div class="launch-flame mx-auto mt-4 h-20 w-12"></div>
          {/if}
        </div>
      {:else if profile === 'rig'}
        <div class="w-full max-w-lg text-center">
          <div class="rgb-text font-display text-4xl font-black">◆ MAOWCORE</div>
          <div class="mt-1 text-xs tracking-[0.3em] text-white/50">GAMING RIG ONLINE</div>
          <div class="rgb-bar my-4 h-2 rounded-pill"></div>
          <div class="min-h-[110px] space-y-1 text-left font-mono text-xs">
            {#each RIG_LINES as l, i}{#if step > i}<div class="boot-line text-white/70"><span style="color: var(--accent-2)">▸</span> {l}</div>{/if}{/each}
          </div>
          {#if step > RIG_LINES.length}<div class="boot-pop font-display text-2xl font-black" style="color: var(--accent)">FPS UNLOCKED · GG</div>{/if}
        </div>
      {:else if profile === 'stream'}
        <div class="w-full max-w-lg text-center">
          {#if !live}
            <div class="boot-title font-display text-2xl font-black" style="color: var(--accent)">INITIALIZING STREAM</div>
            <div class="mt-4 min-h-[120px] space-y-1 text-left font-mono text-xs">
              {#each STREAM_LINES as l, i}{#if step > i}<div class="boot-line text-white/70"><span style="color: var(--accent)">✓</span> {l}</div>{/if}{/each}
            </div>
          {:else}
            <div class="flex items-center justify-center gap-2"><span class="live-dot h-3 w-3 rounded-full" style="background:#ff3b30"></span><span class="font-display text-4xl font-black" style="color: var(--accent-3)">GOING LIVE</span></div>
            <div class="boot-pop mt-3 font-display text-3xl font-black" style="color: var(--accent)">◆ MAOWCORE</div>
            <div class="mt-3 inline-flex items-center gap-2 rounded-pill px-4 py-1 text-sm" style="background: var(--surface-2)"><span style="color: var(--accent-3)">👁</span> {viewers.toLocaleString()} viewers</div>
          {/if}
        </div>
      {:else if profile === 'equalizer'}
        <div class="w-full max-w-lg text-center">
          <div class="mb-4 flex h-20 items-end justify-center gap-1">
            {#each Array(18) as _, i}<div class="eq-bar w-2 rounded-t" style="background: var(--accent); animation-delay:{(i % 9) * 0.08}s"></div>{/each}
          </div>
          <div class="boot-pop font-display text-3xl font-black" style="color: var(--accent)">◆ MAOWCORE</div>
          <div class="mt-3 min-h-[90px] space-y-1 text-sm">
            {#each EQ_LINES as l, i}{#if step > i}<div class="boot-line text-white/70">{l}</div>{/if}{/each}
          </div>
          {#if step > EQ_LINES.length}<div class="boot-pop font-display text-xl font-bold" style="color: var(--accent)">▶ READY</div>{/if}
        </div>
      {:else if profile === 'discord'}
        <div class="w-full max-w-lg text-center">
          <div class="discord-logo mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[26px] text-4xl font-black text-white" style="background: var(--accent)">◆</div>
          <div class="boot-title font-display text-2xl font-black" style="color: var(--accent)">CONNECTING<span class="boot-dots"></span></div>
          <div class="mt-4 min-h-[120px] space-y-1.5 text-sm">
            {#each DISCORD_LINES as l, i}{#if step > i}<div class="boot-line flex items-center justify-center gap-2 text-white/70"><span style="color: var(--success, #57f287)">✓</span> {l}</div>{/if}{/each}
          </div>
          {#if step > DISCORD_LINES.length}<div class="boot-pop font-display text-xl font-bold" style="color: var(--success, #57f287)">✓ CONNECTED</div>{/if}
          <div class="mx-auto mt-6 max-w-md rounded-card border border-white/10 bg-white/5 p-3 text-left text-xs leading-relaxed text-white/65"><span class="font-bold" style="color: var(--accent)">💡 Did you know?</span> {tip}</div>
        </div>
      {:else if cine && cine.style === 'log'}
        <!-- ── Generic streaming log boot (server / hacker / cinematic) ── -->
        <div class="w-full max-w-xl">
          <div class="boot-title font-display text-2xl font-black" style="color: var(--accent)">{cine.title}</div>
          <div class="mb-3 mt-1 text-xs tracking-[0.35em] text-white/40">{cine.sub}</div>
          <div class="min-h-[176px] space-y-0.5 font-mono text-xs">
            {#each cine.lines as l, i}{#if step > i}
              <div class="boot-line flex items-center gap-2 text-white/75">
                <span style="color: var(--accent)">{cine.glyph}</span>
                <span class="truncate">{l}</span>
                <span class="flex-1 truncate text-white/15">{dots(l)}</span>
                <span style="color: var(--success)">OK</span>
              </div>
            {/if}{/each}
          </div>
          {#if step > cine.lines.length}<div class="boot-pop mt-2 font-display text-xl font-bold" style="color: var(--accent)">{cine.done}<span class="boot-cursor">▋</span></div>{/if}
          <div class="mt-3 h-1 overflow-hidden rounded-pill bg-white/10"><div class="h-full transition-all duration-300" style="width:{Math.min(100, Math.round((step / (cine.lines.length + 1)) * 100))}%; background:linear-gradient(90deg, var(--accent), var(--accent-3)); box-shadow:0 0 14px var(--accent)"></div></div>
        </div>
      {:else if cine && cine.style === 'machine'}
        <!-- ── Person of Interest surveillance HUD ── -->
        <div class="w-full max-w-2xl text-center">
          <div class="machine-box relative mx-auto mb-6 grid h-28 w-48 place-items-center">
            <span class="machine-corner tl"></span><span class="machine-corner tr"></span><span class="machine-corner bl"></span><span class="machine-corner br"></span>
            <span class="machine-scan"></span>
            <div class="font-display text-3xl font-black tracking-[0.2em]" style="color: var(--accent); text-shadow:0 0 18px var(--accent)">{cine.title}</div>
          </div>
          <div class="text-xs tracking-[0.35em] text-white/45">{cine.sub}</div>
          <div class="mt-4 min-h-[140px] space-y-1 font-mono text-xs">
            {#each cine.lines as l, i}{#if step > i}<div class="boot-line flex items-center justify-center gap-2 text-white/70"><span style="color: var(--accent)">{cine.glyph}</span> {l}</div>{/if}{/each}
          </div>
          {#if step > cine.lines.length}
            <div class="boot-pop mt-3 inline-block border-2 px-7 py-2 font-display text-2xl font-black tracking-[0.35em]" style="border-color: {cine.verdictColor ?? 'var(--accent)'}; color: {cine.verdictColor ?? 'var(--accent)'}; box-shadow:0 0 24px -4px {cine.verdictColor ?? 'var(--accent)'}">{cine.verdict}</div>
            <div class="mt-3 text-sm tracking-[0.3em] text-white/60">{cine.done}</div>
          {/if}
        </div>
      {:else if cine && cine.style === 'vhs'}
        <!-- ── Backrooms analog-horror VHS ── -->
        <div class="vhs-wrap relative w-full max-w-2xl px-6 text-center">
          <div class="flex items-center justify-between font-mono text-xs" style="color: var(--accent)">
            <span class="flex items-center gap-1.5"><span class="vhs-rec h-2.5 w-2.5 rounded-full" style="background:#ff2d2d"></span> REC</span>
            <span class="tabular-nums">{recClock}</span>
          </div>
          <div class="vhs-text mt-10 font-display text-4xl font-black tracking-[0.12em] sm:text-5xl" style="color: var(--accent)">{cine.level}</div>
          <div class="mt-2 text-sm tracking-[0.4em] text-white/55">{cine.title}</div>
          <div class="mt-7 min-h-[130px] space-y-2 font-mono text-sm">
            {#each cine.lines as l, i}{#if step > i}<div class="vhs-line" style="color: var(--accent)">{l}</div>{/if}{/each}
          </div>
          {#if step > cine.lines.length}<div class="boot-pop vhs-text mt-4 font-display text-2xl font-black tracking-[0.3em]" style="color: var(--accent)">{cine.done}</div>{/if}
          <div class="mt-8 text-[10px] tracking-[0.3em] text-white/30">SD · PLAY ▶ · TRACKING ▮▮▯</div>
        </div>
      {:else if cine && cine.style === 'rain'}
        <!-- ── Matrix code-rain variants ── -->
        <div class="text-center">
          <div class="space-y-1 font-mono text-sm leading-relaxed" style="color: var(--accent); text-shadow:0 0 8px var(--accent)">
            {#each cine.lines as l, i}{#if step > i}<div class="boot-line">{l}</div>{/if}{/each}
          </div>
          {#if step > cine.lines.length}<div class="boot-pop mt-7 font-display text-4xl font-black" style="color: var(--accent)">{cine.done}</div>{/if}
        </div>
      {:else}
        <div class="boot-title text-3xl font-black tracking-[0.25em]" style="color: var(--accent)">◆ MAOWCORE</div>
        <div class="mb-6 mt-1 text-xs tracking-[0.4em] text-white/40">{profile === 'cosmic' ? 'W A R P   D R I V E' : profile === 'hud' ? 'S Y S T E M   B O O T' : 'T E R M I N A L'}</div>
        <div class="min-h-[160px] space-y-1 text-sm">
          {#each lines as line, i}
            {#if step > i}
              <div class="boot-line flex items-center gap-2 text-white/75">
                <span style="color: var(--accent)">{profile === 'cosmic' ? '✦' : '[ OK ]'}</span>
                <span class="truncate">{line}</span>
                {#if profile !== 'cosmic'}<span class="flex-1 truncate text-white/20">{dots(line)}</span><span style="color: var(--success, #3ce6a6)">OK</span>{/if}
              </div>
            {/if}
          {/each}
          {#if step > lines.length}<div class="boot-line pt-2 font-bold" style="color: var(--accent)">{profile === 'cosmic' ? '▸ ENGAGE' : '[ READY ] Welcome, operator'}<span class="boot-cursor">▋</span></div>{/if}
        </div>
        <div class="mt-4 h-1 overflow-hidden rounded-pill bg-white/10"><div class="h-full transition-all duration-300" style="width:{Math.min(100, Math.round((step / (lines.length + 1)) * 100))}%; background:linear-gradient(90deg, var(--accent), var(--accent-3)); box-shadow:0 0 14px var(--accent)"></div></div>
      {/if}
    </div>
  {/if}

  <button class="absolute bottom-4 right-4 z-20 text-xs text-white/40 hover:text-white" onclick={toggleMute}>{muted ? '🔇 muted' : '🔊 sound'}</button>
</div>

<style>
  .boot-title { text-shadow: 0 0 22px var(--accent); }
  .boot-scan { background: repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 3px); }
  .boot-vignette { background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.78) 100%); }
  .boot-cursor { animation: bootblink 1s steps(2) infinite; }
  .discord-logo { box-shadow: 0 12px 30px -6px var(--accent); animation: dbounce 0.9s cubic-bezier(0.5, 0, 0.5, 1) infinite; }
  .boot-dots::after { content: ''; animation: bootdots 1.4s steps(1) infinite; }
  @keyframes dbounce { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-14px) scale(1.04); } }
  @keyframes bootdots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
  .boot-blink { animation: bootblink 0.8s steps(2) infinite; }
  .boot-line { animation: bootline 0.22s ease both; }
  .boot-pop { animation: bootpop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; text-shadow: 0 0 30px var(--accent); }
  .boot-root { animation: bootflicker 5s steps(60) infinite; }
  .hack-banner { animation: bootglitch 0.4s steps(2) infinite; text-shadow: 0 0 24px var(--accent); }
  .hack-granted { animation: bootpop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .hack-flash { animation: hackflash 0.5s ease-out; opacity: 0; }
  .boot-grid { background: linear-gradient(0deg, rgba(255, 46, 151, 0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.12) 1px, transparent 1px); background-size: 40px 40px; transform: perspective(300px) rotateX(60deg); transform-origin: bottom; animation: gridrun 1.2s linear infinite; opacity: 0.5; }
  .boot-grid.cosmic { background: radial-gradient(2px 2px at 30% 40%, #fff, transparent), radial-gradient(2px 2px at 70% 60%, #fff, transparent), radial-gradient(1px 1px at 50% 20%, #fff, transparent); background-size: 200px 200px; transform: none; animation: bootstars 6s linear infinite; }
  .boot-chrome { background: linear-gradient(180deg, #fff 0%, var(--accent) 45%, var(--accent-3) 55%, #fff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: 0 0 30px var(--accent); }
  @keyframes bootblink { 50% { opacity: 0.25; } }
  @keyframes bootline { from { opacity: 0; transform: translateX(-6px); } }
  @keyframes bootpop { from { opacity: 0; transform: scale(0.7); } }
  @keyframes bootglitch { 0% { transform: translate(0); } 25% { transform: translate(-2px, 1px); } 50% { transform: translate(2px, -1px); } 75% { transform: translate(-1px, -1px); } }
  @keyframes hackflash { 0% { opacity: 0.7; } 100% { opacity: 0; } }
  @keyframes gridrun { to { background-position: 0 40px; } }
  @keyframes bootstars { to { background-position: 0 200px; } }
  @keyframes bootflicker { 0%, 100% { opacity: 1; } 97% { opacity: 0.9; } }
  .vr-frame { box-shadow: 0 0 30px -4px var(--accent); animation: bootpop 0.5s both; }
  .led { animation: ledblink 1.1s ease-in-out infinite; }
  @keyframes ledblink { 0%, 100% { opacity: 0.18; } 50% { opacity: 1; box-shadow: 0 0 8px var(--accent); } }
  .launch-shake { animation: shake 0.18s infinite; }
  @keyframes shake { 0% { transform: translate(0, 0); } 25% { transform: translate(-2px, 1px); } 50% { transform: translate(2px, -2px); } 75% { transform: translate(-1px, 2px); } }
  .launch-flame { background: radial-gradient(ellipse at 50% 0%, #fff, var(--accent-2) 30%, #ff6b00 60%, transparent 75%); filter: blur(2px); animation: flame 0.12s infinite alternate; border-radius: 0 0 50% 50%; }
  @keyframes flame { from { transform: scaleY(1) scaleX(1); opacity: 0.9; } to { transform: scaleY(1.3) scaleX(0.85); opacity: 1; } }
  .rgb-bar { background: linear-gradient(90deg, #ff0080, #ff8c00, #ffe000, #00ff88, #0088ff, #b14aff, #ff0080); background-size: 300% 100%; animation: rgbslide 2s linear infinite; box-shadow: 0 0 16px -2px #ff0080; }
  .rgb-text { background: linear-gradient(90deg, #ff0080, #00ff88, #0088ff, #ff0080); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: rgbslide 2s linear infinite; }
  @keyframes rgbslide { to { background-position: 300% 0; } }
  .live-dot { animation: livedot 1s ease-in-out infinite; }
  @keyframes livedot { 0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.6); } 50% { opacity: 0.6; box-shadow: 0 0 0 8px rgba(255, 59, 48, 0); } }
  .eq-bar { height: 20%; animation: eqdance 0.6s ease-in-out infinite alternate; }
  @keyframes eqdance { 0% { height: 12%; } 100% { height: 100%; } }

  /* ── Person of Interest "Machine" surveillance HUD ── */
  .machine-corner { position: absolute; width: 18px; height: 18px; border: 2px solid var(--accent); animation: machinepulse 1.6s ease-in-out infinite; }
  .machine-corner.tl { top: 0; left: 0; border-right: 0; border-bottom: 0; }
  .machine-corner.tr { top: 0; right: 0; border-left: 0; border-bottom: 0; }
  .machine-corner.bl { bottom: 0; left: 0; border-right: 0; border-top: 0; }
  .machine-corner.br { bottom: 0; right: 0; border-left: 0; border-top: 0; }
  .machine-scan { position: absolute; left: 0; right: 0; height: 2px; background: var(--accent); opacity: 0.5; box-shadow: 0 0 10px var(--accent); animation: machinescan 2.2s linear infinite; }
  @keyframes machinepulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; box-shadow: 0 0 12px var(--accent); } }
  @keyframes machinescan { 0% { top: 0; } 100% { top: 100%; } }

  /* ── Backrooms analog-horror VHS ── */
  .vhs-bg { background: radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 16%, transparent), transparent 72%), repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.38) 0 2px, transparent 2px 4px); mix-blend-mode: screen; animation: vhsroll 9s linear infinite; }
  .vhs-text { text-shadow: 2px 0 #ff003c, -2px 0 #00e5ff, 0 0 14px var(--accent); animation: vhschroma 2.6s steps(1) infinite; }
  .vhs-line { animation: vhsflick 3.2s steps(1) infinite; }
  .vhs-rec { animation: recblink 1s steps(1) infinite; }
  .vhs-shake { animation: bootflicker 5s steps(60) infinite, vhsjitter 6s steps(1) infinite; }
  @keyframes vhsroll { to { background-position: 0 0, 0 18px; } }
  @keyframes vhschroma { 0%, 47%, 100% { transform: translateX(0) skewX(0); } 50% { transform: translateX(-2px) skewX(-1.2deg); } 53% { transform: translateX(2px) skewX(0.6deg); } }
  @keyframes vhsflick { 0%, 96%, 100% { opacity: 0.88; transform: translateX(0); } 98% { opacity: 0.4; transform: translateX(-3px); } }
  @keyframes recblink { 50% { opacity: 0.2; } }
  @keyframes vhsjitter { 0%, 92%, 100% { transform: translateY(0); } 94% { transform: translateY(-3px); } 96% { transform: translateY(2px); } }

  @media (prefers-reduced-motion: reduce) { .boot-root, .boot-cursor, .boot-line, .boot-grid, .hack-banner, .led, .launch-shake, .rgb-bar, .rgb-text, .live-dot, .eq-bar, .machine-corner, .machine-scan, .vhs-bg, .vhs-text, .vhs-line, .vhs-rec, .vhs-shake { animation: none; } }
</style>
