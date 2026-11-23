<script lang="ts">
  import { liveState, sendAction } from '$lib/ws';
  import { fmtDuration } from '$lib/format';
  import QueueList from '$lib/components/QueueList.svelte';

  let queue = $derived($liveState.queues?.[0] ?? null);
  let song = $derived(queue?.currentSong ?? null);
  let paused = $derived(queue?.paused ?? false);
  let seekValue = $state<number | null>(null);
  let displayTime = $derived(seekValue ?? queue?.currentTime ?? 0);
  let progress = $derived(song?.duration ? Math.min(100, (displayTime / song.duration) * 100) : 0);

  function commitSeek(v: number) {
    sendAction('seek', { value: Math.floor(v) });
    seekValue = v;
    setTimeout(() => (seekValue = null), 1500);
  }
</script>

<svelte:head><title>Player · MaowCore</title></svelte:head>

<div class="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
  <!-- Immersive player -->
  <div class="relative overflow-hidden rounded-card border border-border p-8">
    {#if song?.thumbnail}
      <div class="pointer-events-none absolute inset-0 opacity-40 blur-3xl" style="background-image:url({song.thumbnail}); background-size:cover; background-position:center"></div>
      <div class="pointer-events-none absolute inset-0 bg-black/40"></div>
    {/if}
    <div class="relative flex flex-col items-center text-center">
      <div class="aspect-square w-full max-w-xs overflow-hidden rounded-card border border-border shadow-card {song && !paused ? 'animate-pulse-glow' : ''}">
        {#if song?.thumbnail}<img src={song.thumbnail} alt="" class="h-full w-full object-cover" />{:else}<div class="grid h-full place-items-center bg-surface-2 text-7xl opacity-40">🎵</div>{/if}
      </div>
      <div class="mt-6 text-xs font-bold uppercase tracking-[0.3em] text-accent">{song ? (paused ? 'Paused' : 'Now Playing') : 'Idle'}</div>
      <h1 class="mt-2 max-w-lg font-display text-3xl font-extrabold leading-tight">{song?.name ?? 'Nothing playing'}</h1>
      <p class="mt-1 text-sm text-muted">{song?.requestedBy ? `Requested by ${song.requestedBy}` : 'Queue something to begin'}</p>

      {#if song}
        <div class="group relative mt-6 w-full max-w-md py-2">
          <div class="h-1.5 overflow-hidden rounded-pill bg-surface-2"><div class="h-full rounded-pill" style="width:{progress}%; background-image:linear-gradient(90deg, var(--accent), var(--accent-3))"></div></div>
          <input type="range" min="0" max={song.duration ?? 0} value={displayTime} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" oninput={(e) => (seekValue = +e.currentTarget.value)} onchange={(e) => commitSeek(+e.currentTarget.value)} />
          <div class="mt-1 flex justify-between text-[11px] tabular-nums text-muted"><span>{fmtDuration(displayTime)}</span><span>{song.formattedDuration ?? fmtDuration(song.duration)}</span></div>
        </div>
      {/if}

      <div class="mt-4 flex items-center gap-3">
        <button class="btn-ghost h-12 w-12 !px-0 text-lg" onclick={() => commitSeek(0)} title="Restart">⏮</button>
        <button class="btn-primary h-16 w-16 !px-0 text-2xl" onclick={() => sendAction(paused ? 'resume' : 'pause')}>{paused ? '▶' : '⏸'}</button>
        <button class="btn-ghost h-12 w-12 !px-0 text-lg" onclick={() => sendAction('skip')} title="Skip">⏭</button>
      </div>
      <div class="mt-4 flex items-center gap-2">
        <button class="btn-ghost h-9 px-3 text-xs" onclick={() => sendAction('shuffle')}>🔀 Shuffle</button>
        <button class="btn-ghost h-9 px-3 text-xs {(queue?.loop ?? 0) > 0 ? 'text-accent ring-1 ring-accent' : ''}" onclick={() => sendAction('loop', { value: ((queue?.loop ?? 0) + 1) % 3 })}>{['🔁 Loop off', '🔂 Loop track', '🔁 Loop queue'][queue?.loop ?? 0]}</button>
        <button class="btn-ghost h-9 px-3 text-xs" onclick={() => sendAction('stop')}>⏹ Stop</button>
      </div>
      <div class="mt-4 flex w-full max-w-md items-center gap-2">
        <span>🔊</span>
        <input type="range" min="0" max="150" value={queue?.volume ?? 100} class="accent-accent flex-1" oninput={(e) => sendAction('volume', { value: +e.currentTarget.value })} />
        <span class="w-10 text-right text-xs tabular-nums text-muted">{queue?.volume ?? 100}%</span>
      </div>
    </div>
  </div>

  <QueueList />
</div>
