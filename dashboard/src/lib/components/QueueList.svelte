<script lang="ts">
  import { liveState, sendAction } from '$lib/ws';
  import { fmtDuration } from '$lib/format';

  let songs = $derived($liveState.queues?.[0]?.songs ?? []);
</script>

<div class="card overflow-hidden">
  <div class="flex items-center justify-between border-b border-border px-5 py-3">
    <h3 class="font-display font-bold">Up Next</h3>
    <span class="pill bg-surface-2 text-muted">{songs.length} queued</span>
  </div>

  {#if songs.length === 0}
    <div class="px-5 py-10 text-center text-sm text-muted">
      <div class="mb-2 text-3xl opacity-40">🎶</div>
      Queue is empty — use <code class="rounded bg-surface-2 px-1">/play</code> to add songs.
    </div>
  {:else}
    <ul class="max-h-[420px] divide-y divide-border overflow-y-auto">
      {#each songs as song, i (song.url ?? i)}
        <li class="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
          <span class="w-5 text-center text-xs tabular-nums text-muted">{i + 1}</span>
          {#if song.thumbnail}
            <img src={song.thumbnail} alt="" class="h-9 w-9 rounded-md object-cover" />
          {:else}
            <div class="grid h-9 w-9 place-items-center rounded-md bg-surface-2 text-sm">🎵</div>
          {/if}
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">{song.name}</div>
            <div class="truncate text-[11px] text-muted">{song.requestedBy ?? ''}</div>
          </div>
          <span class="text-[11px] tabular-nums text-muted">
            {song.formattedDuration ?? fmtDuration(song.duration)}
          </span>
          <button
            class="ml-1 opacity-0 transition group-hover:opacity-100 hover:text-danger"
            title="Remove"
            onclick={() => sendAction('queue_remove', { index: i })}
          >
            ✕
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
