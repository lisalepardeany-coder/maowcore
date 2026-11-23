<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Topbar from '$lib/components/Topbar.svelte';
  import TopNav from '$lib/components/TopNav.svelte';
  import BootScreen from '$lib/components/BootScreen.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import ToastFeed from '$lib/components/ToastFeed.svelte';
  import { theme, currentTheme } from '$lib/stores/theme';
  import { bootPreview } from '$lib/stores/boot';
  import { captureSessionFromHash } from '$lib/api';
  import { loadMe } from '$lib/stores/user';
  import { connectWs, setWsGuild, liveState } from '$lib/ws';
  import { guildId } from '$lib/stores/guild';
  import { prefs, applyPrefs } from '$lib/stores/prefs';
  import { pushToast, toasts } from '$lib/stores/toast';
  import { setTheme } from '$lib/stores/theme';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';

  let { children }: { children: Snippet } = $props();

  let sidebarCollapsed = $state(false);
  // Cinematic boot screen — shows once per full page load unless disabled in
  // Settings. Read synchronously (client-only render) so there's no flash.
  let booting = $state(browser ? localStorage.getItem('maow.v2.bootscreen') !== 'off' : false);

  // The active theme decides the structural layout: side rail, top HUD, or
  // a forced icon-rail.
  let navStyle = $derived($currentTheme.nav);
  let railForced = $derived(navStyle === 'rail');

  $effect(() => {
    if (browser) document.documentElement.setAttribute('data-theme', $theme);
  });
  $effect(() => {
    setWsGuild($guildId);
  });
  // Apply all visual/accessibility preferences live.
  $effect(() => {
    applyPrefs($prefs);
  });

  // Now-playing notifications (opt-in via prefs).
  let lastNotifiedSong = '';
  $effect(() => {
    const song = $liveState.queues?.[0]?.currentSong;
    if ($prefs.notifyNowPlaying && song?.name && song.name !== lastNotifiedSong) {
      lastNotifiedSong = song.name;
      pushToast(`▶ Now playing: ${song.name}`, 'info');
      if (browser && Notification?.permission === 'granted') {
        try { new Notification('Now playing', { body: song.name }); } catch { /* */ }
      }
    }
  });

  onMount(() => {
    captureSessionFromHash();
    loadMe();
    connectWs();
    sidebarCollapsed = localStorage.getItem('maow.v2.sidebar') === '1';
    // Default landing page — redirect once on first load if configured.
    const landing = $prefs.landingPage;
    if (landing && landing !== '/' && $page.url.pathname.replace(base, '') === '/') {
      goto(`${base}${landing}`, { replaceState: true });
    }
    // Auto day/night theme.
    if ($prefs.autoTheme === 'daynight') {
      const h = new Date().getHours();
      setTheme(h >= 7 && h < 19 ? 'daylight' : 'nebula');
    }
  });

  // UI sound effects — a soft blip whenever a toast appears.
  let lastToastCount = 0;
  function beep() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 720;
      g.gain.value = $prefs.soundVolume * 0.06;
      o.start();
      o.stop(ctx.currentTime + 0.05);
      setTimeout(() => ctx.close(), 150);
    } catch { /* */ }
  }
  $effect(() => {
    if ($toasts.length > lastToastCount && $prefs.sounds) beep();
    lastToastCount = $toasts.length;
  });

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    if (browser) localStorage.setItem('maow.v2.sidebar', sidebarCollapsed ? '1' : '0');
  }
</script>

<!-- Global overlays: command palette + toast feed. -->
<CommandPalette />
<ToastFeed />

<!-- Cinematic system-boot screen on first load, or a Boot Lab preview replay. -->
{#if booting || $bootPreview !== null}
  <BootScreen preview={$bootPreview} onDone={() => { booting = false; bootPreview.set(null); }} />
{/if}

<!-- Decorative overlays — shown only for themes that opt in via CSS. -->
<div class="deco-grid pointer-events-none fixed inset-0 -z-10" aria-hidden="true"></div>
<div class="deco-scanlines pointer-events-none fixed inset-0 z-50" aria-hidden="true"></div>

{#if navStyle === 'top'}
  <!-- Top HUD layout (Cyberdeck) -->
  <div class="flex h-screen flex-col overflow-hidden">
    <TopNav />
    <main class="flex-1 overflow-y-auto p-4 sm:p-6">
      <div class="mx-auto max-w-6xl">{@render children()}</div>
    </main>
  </div>
{:else}
  <!-- Side layout (rail-forced for Terminal) -->
  <div class="flex h-screen overflow-hidden">
    <div class="hidden md:block">
      <Sidebar collapsed={railForced || sidebarCollapsed} />
    </div>
    <div class="flex min-w-0 flex-1 flex-col">
      <Topbar onToggleSidebar={toggleSidebar} />
      <main class="flex-1 overflow-y-auto p-4 sm:p-6">
        <div class="mx-auto max-w-6xl">{@render children()}</div>
      </main>
    </div>
  </div>
{/if}
