<script lang="ts">
  import { base } from '$app/paths';
  import { liveState, sendAction } from '$lib/ws';
  import { me, startLogin } from '$lib/stores/user';
  import QueueList from '$lib/components/QueueList.svelte';

  let queues = $derived($liveState.queues ?? []);
  let queue = $derived(queues[0] ?? null);
  let song = $derived(queue?.currentSong ?? null);
  let paused = $derived(queue?.paused ?? false);

  let guildCount = $derived($liveState.guilds?.length ?? 0);
  let activeQueues = $derived(queues.filter((q) => q.currentSong).length);
  let totalQueued = $derived(queues.reduce((n, q) => n + (q.songs?.length ?? 0), 0));
  let ping = $derived($liveState.ping?.websocket ?? null);

  let query = $state('');
  function play() {
    if (query.trim()) {
      sendAction('play', { query: query.trim() });
      query = '';
    }
  }

  // Launcher tiles — the things people actually jump to from Home.
  const SHORTCUTS = [
    { label: 'Player', icon: '▶️', href: '/player', desc: 'Full now-playing' },
    { label: 'Library', icon: '🎵', href: '/library', desc: 'Browse tracks' },
    { label: 'Playlists', icon: '📋', href: '/playlists', desc: 'Saved sets' },
    { label: 'Lyrics', icon: '🎤', href: '/lyrics', desc: 'Synced words' },
    { label: 'Soundboard', icon: '🔉', href: '/soundboard', desc: 'One-tap clips' },
    { label: 'Radio', icon: '📻', href: '/radio', desc: '24/7 stations' },
    { label: 'Analytics', icon: '📈', href: '/analytics', desc: 'Listen stats' },
    { label: 'Themes', icon: '🖼️', href: '/theme-gallery', desc: '28 looks' },
    { label: 'Diagnostics', icon: '🩺', href: '/diagnostics', desc: 'Ops console' },
    { label: 'Settings', icon: '⚙️', href: '/settings', desc: 'Configure' },
  ];
</script>

<svelte:head><title>Home · MaowCore</title></svelte:head>

<div class="space-y-6">
  <!-- Hero header: bot connection (websocket) vs. your sign-in are shown separately -->
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="font-display text-3xl font-extrabold tracking-tight">
        Welcome back{#if $me.loggedIn}, <span class="text-accent">{$me.username}</span>{:else} <span class="text-accent">✦</span>{/if}
      </h1>
      <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full {$liveState.connected ? 'bg-success' : 'bg-warn animate-pulse-glow'}"></span>
          {$liveState.connected ? `Bot online · ${$liveState.botTag ?? 'MaowCore'}` : 'Bot offline — reconnecting…'}
        </span>
        <span class="text-muted/40">·</span>
        {#if $me.loggedIn}
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-accent"></span>
            {#if $me.rank}Signed in as <span class="font-semibold capitalize text-text">{$me.rank}</span>{:else}Signed in{/if}
          </span>
        {:else}
          <button class="inline-flex items-center gap-1.5 text-accent hover:underline" onclick={startLogin}>
            <span class="h-2 w-2 rounded-full bg-muted"></span> Not signed in — Sign in with Discord →
          </button>
        {/if}
      </div>
    </div>
    <a href="{base}/player" class="btn-ghost h-9 text-sm">Open full player →</a>
  </div>

  <!-- Quick-play launcher -->
  <div class="card flex items-center gap-2 p-3">
    <span class="pl-2 text-lg">🔎</span>
    <input
      class="input border-0 bg-transparent focus:ring-0"
      placeholder="Search or paste a YouTube / Spotify / SoundCloud link…"
      bind:value={query}
      onkeydown={(e) => e.key === 'Enter' && play()}
    />
    <button class="btn-primary shrink-0" onclick={play}>Play</button>
  </div>

  <!-- At-a-glance stats -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {#each [['Servers', guildCount, '🌐'], ['Active queues', activeQueues, '🎶'], ['Songs queued', totalQueued, '📋'], ['Gateway ping', ping != null ? `${ping} ms` : '—', '🏓']] as [label, val, icon]}
      <div class="card p-4">
        <div class="text-2xl">{icon}</div>
        <div class="mt-1 font-display text-2xl font-extrabold tabular-nums">{val}</div>
        <div class="text-xs text-muted">{label}</div>
      </div>
    {/each}
  </div>

  <!-- Compact now-playing strip + shortcuts | queue peek -->
  <div class="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
    <div class="space-y-6">
      <!-- Mini now-playing (links to the full player) -->
      <div class="card flex items-center gap-4 p-4">
        <div class="aspect-square w-16 shrink-0 overflow-hidden rounded-card border border-border bg-surface-2">
          {#if song?.thumbnail}
            <img src={song.thumbnail} alt="" class="h-full w-full object-cover" />
          {:else}
            <div class="grid h-full place-items-center text-2xl opacity-40">🎵</div>
          {/if}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[11px] font-bold uppercase tracking-widest text-accent">
            {song ? (paused ? 'Paused' : 'Now Playing') : 'Idle'}
          </div>
          <div class="truncate font-display text-lg font-bold">{song?.name ?? 'Nothing playing'}</div>
          <div class="truncate text-xs text-muted">
            {song?.requestedBy ? `Requested by ${song.requestedBy}` : 'Queue something to get started'}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          {#if song}
            <button class="btn-ghost h-10 w-10 !px-0" onclick={() => sendAction(paused ? 'resume' : 'pause')} title={paused ? 'Play' : 'Pause'}>{paused ? '▶' : '⏸'}</button>
            <button class="btn-ghost h-10 w-10 !px-0" onclick={() => sendAction('skip')} title="Skip">⏭</button>
          {/if}
          <a href="{base}/player" class="btn-primary h-10 text-sm">Open player</a>
        </div>
      </div>

      <!-- Launcher grid -->
      <div>
        <div class="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Jump to</div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {#each SHORTCUTS as s}
            <a href="{base}{s.href}" class="card group flex items-center gap-3 p-3 transition hover:-translate-y-0.5">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-surface-2 text-xl">{s.icon}</span>
              <div class="min-w-0">
                <div class="truncate font-display text-sm font-bold">{s.label}</div>
                <div class="truncate text-[11px] text-muted">{s.desc}</div>
              </div>
            </a>
          {/each}
        </div>
      </div>
    </div>

    <!-- Queue peek -->
    <QueueList />
  </div>
</div>
