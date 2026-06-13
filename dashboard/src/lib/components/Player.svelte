<script lang="ts">
  import { liveState, sendAction } from '$lib/ws';
  import { fmtDuration } from '$lib/format';

  let queue = $derived($liveState.queues?.[0] ?? null);
  let song = $derived(queue?.currentSong ?? null);
  let paused = $derived(queue?.paused ?? false);

  // Seek handling. While dragging we show the local value (seekValue) instead
  // of the live currentTime so the thumb doesn't jump under the user's finger.
  // After committing the seek, keep showing the chosen value briefly until the
  // server's currentTime catches up.
  let seekValue = $state<number | null>(null);
  let displayTime = $derived(seekValue ?? queue?.currentTime ?? 0);
  let progress = $derived(song?.duration ? Math.min(100, (displayTime / song.duration) * 100) : 0);

  function commitSeek(v: number) {
    sendAction('seek', { value: Math.floor(v) });
    seekValue = v;
    setTimeout(() => { seekValue = null; }, 1500);
  }
  function restart() {
    commitSeek(0);
  }
</script>

<div class="card relative overflow-hidden p-6">
  <!-- ambient art glow -->
  {#if song?.thumbnail}
    <div
      class="pointer-events-none absolute inset-0 opacity-30 blur-3xl"
      style="background-image: url({song.thumbnail}); background-size: cover; background-position: center"
    ></div>
  {/if}

  <div class="relative flex flex-col gap-5 sm:flex-row sm:items-center">
    <!-- Album art -->
    <div
      class="aspect-square w-full max-w-[160px] shrink-0 overflow-hidden rounded-card border border-border bg-surface-2 shadow-card"
    >
      {#if song?.thumbnail}
        <img src={song.thumbnail} alt="" class="h-full w-full object-cover" />
      {:else}
        <div class="grid h-full place-items-center text-5xl opacity-40">🎵</div>
      {/if}
    </div>

    <!-- Info + controls -->
    <div class="min-w-0 flex-1">
      <div class="text-xs font-bold uppercase tracking-widest text-accent">
        {song ? (paused ? 'Paused' : 'Now Playing') : 'Idle'}
      </div>
      <h2 class="mt-1 truncate font-display text-2xl font-extrabold">
        {song?.name ?? 'Nothing in the queue'}
      </h2>
      <p class="mt-0.5 text-sm text-muted">
        {song?.requestedBy ? `Requested by ${song.requestedBy}` : 'Queue something to get started'}
      </p>

      <!-- Seekable progress slider -->
      {#if song}
        <div class="group relative mt-4 py-2">
          <div class="h-1.5 overflow-hidden rounded-pill bg-surface-2">
            <div
              class="h-full rounded-pill {seekValue == null ? 'transition-all duration-700' : ''}"
              style="width:{progress}%; background-image: linear-gradient(90deg, var(--accent), var(--accent-3))"
            ></div>
          </div>
          <!-- Draggable thumb (appears on hover) -->
          <div
            class="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-accent opacity-0 shadow transition group-hover:opacity-100"
            style="left:calc({progress}% - 6px)"
          ></div>
          <!-- Transparent range overlay captures clicks/drags across the bar -->
          <input
            type="range"
            min="0"
            max={song.duration ?? 0}
            value={displayTime}
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Seek"
            oninput={(e) => (seekValue = +e.currentTarget.value)}
            onchange={(e) => commitSeek(+e.currentTarget.value)}
          />
          <div class="mt-1 flex justify-between text-[11px] tabular-nums text-muted">
            <span>{fmtDuration(displayTime)}</span>
            <span>{song.formattedDuration ?? fmtDuration(song.duration)}</span>
          </div>
        </div>
      {/if}

      <!-- Transport -->
      <div class="mt-4 flex items-center gap-2">
        <button class="btn-ghost h-10 w-10 !px-0" title="Restart song" onclick={restart}>⏮</button>
        <button
          class="btn-primary h-12 w-12 !px-0 text-lg"
          title={paused ? 'Play' : 'Pause'}
          onclick={() => sendAction(paused ? 'resume' : 'pause')}
        >
          {paused ? '▶' : '⏸'}
        </button>
        <button class="btn-ghost h-10 w-10 !px-0" title="Skip" onclick={() => sendAction('skip')}>⏭</button>
        <button class="btn-ghost h-10 w-10 !px-0" title="Stop" onclick={() => sendAction('stop')}>⏹</button>

        <div class="ml-auto flex items-center gap-2">
          <span class="text-sm">🔊</span>
          <input
            type="range"
            min="0"
            max="150"
            value={queue?.volume ?? 100}
            class="accent-accent"
            oninput={(e) => sendAction('volume', { value: +e.currentTarget.value })}
          />
        </div>
      </div>
    </div>
  </div>
</div>
