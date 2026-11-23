<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { fmtBytes, fmtDuration, fmtNumber } from '$lib/format';
  import { sendAction } from '$lib/ws';

  interface LibEntry {
    id?: string;
    name?: string;
    bytes?: number;
    duration?: number;
    source?: string;
    url?: string;
  }
  interface LibResponse {
    songs?: LibEntry[];
    items?: LibEntry[];
    totalBytes?: number;
    totalSec?: number;
    dir?: string;
  }

  let loading = $state(true);
  let error = $state('');
  let data = $state<LibResponse>({});
  let search = $state('');

  let page = $state(1);
  const PER_PAGE = 50;

  let songs = $derived(data.songs ?? data.items ?? []);
  let filtered = $derived(
    search ? songs.filter((s) => (s.name ?? '').toLowerCase().includes(search.toLowerCase())) : songs,
  );
  let pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  // Clamp page if filter shrinks the list, then slice.
  let pageSafe = $derived(Math.min(page, pageCount));
  let pageItems = $derived(filtered.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE));

  // Reset to page 1 whenever the search term changes.
  let lastSearch = '';
  $effect(() => {
    if (search !== lastSearch) {
      lastSearch = search;
      page = 1;
    }
  });

  // Build a compact page strip: 1 … 6 7 [8] 9 10 … 232
  function pageStrip(cur: number, total: number): (number | '…')[] {
    const out: (number | '…')[] = [];
    const add = (n: number | '…') => out.push(n);
    const window = 1;
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= cur - window && i <= cur + window)) add(i);
      else if (out[out.length - 1] !== '…') add('…');
    }
    return out;
  }

  onMount(async () => {
    try {
      data = await api.get<LibResponse>('/api/library');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Library · MaowCore</title></svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="font-display text-3xl font-extrabold tracking-tight">Library</h1>
      <p class="text-sm text-muted">
        {#if !loading}
          {fmtNumber(songs.length)} songs · {fmtBytes(data.totalBytes)} · {fmtDuration(data.totalSec)}
          {#if data.dir}<span class="opacity-60"> · {data.dir}</span>{/if}
        {:else}Loading…{/if}
      </p>
    </div>
    <input class="input max-w-xs" placeholder="Search library…" bind:value={search} />
  </div>

  {#if error}
    <div class="card border-danger/40 p-4 text-sm text-danger">⚠ {error}</div>
  {:else if loading}
    <div class="grid gap-2">
      {#each Array(6) as _}<div class="skel h-14"></div>{/each}
    </div>
  {:else if filtered.length === 0}
    <div class="card p-10 text-center text-muted">
      <div class="mb-2 text-3xl opacity-40">📭</div>
      {search ? 'No matches.' : 'Library is empty.'}
    </div>
  {:else}
    <div class="card divide-y divide-border overflow-hidden">
      {#each pageItems as song, i (song.id ?? i)}
        <div class="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
          <span class="w-8 text-center text-xs tabular-nums text-muted">{(pageSafe - 1) * PER_PAGE + i + 1}</span>
          <div class="grid h-9 w-9 place-items-center rounded-md bg-surface-2">🎵</div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">{song.name}</div>
            <div class="text-[11px] text-muted">
              {song.source ?? 'local'}{song.duration ? ` · ${fmtDuration(song.duration)}` : ''}
            </div>
          </div>
          <span class="text-[11px] text-muted">{fmtBytes(song.bytes)}</span>
          <button
            class="btn-primary h-8 px-3 text-xs opacity-0 transition group-hover:opacity-100"
            onclick={() => sendAction('play', { query: song.url ?? song.name })}
          >
            ▶ Play
          </button>
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    {#if pageCount > 1}
      <div class="mt-4 flex flex-wrap items-center justify-center gap-1">
        <button class="btn-ghost h-8 px-2 text-xs" disabled={pageSafe <= 1} onclick={() => (page = pageSafe - 1)}>‹ Prev</button>
        {#each pageStrip(pageSafe, pageCount) as p}
          {#if p === '…'}
            <span class="px-1 text-muted">…</span>
          {:else}
            <button
              class="h-8 min-w-8 rounded-btn px-2 text-xs font-semibold transition"
              class:bg-accent={p === pageSafe}
              class:text-on-accent={p === pageSafe}
              class:bg-surface-2={p !== pageSafe}
              onclick={() => (page = p as number)}
            >{p}</button>
          {/if}
        {/each}
        <button class="btn-ghost h-8 px-2 text-xs" disabled={pageSafe >= pageCount} onclick={() => (page = pageSafe + 1)}>Next ›</button>
      </div>
      <p class="mt-2 text-center text-xs text-muted">
        Showing {(pageSafe - 1) * PER_PAGE + 1}–{Math.min(pageSafe * PER_PAGE, filtered.length)} of {filtered.length}
      </p>
    {/if}
  {/if}
</div>
