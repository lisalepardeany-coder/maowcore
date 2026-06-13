<script lang="ts">
  import { api } from '$lib/api';
  import { liveState } from '$lib/ws';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';

  let query = $state('');
  let loading = $state(false);
  let error = $state('');
  let result = $state<any>(null);
  let lastAuto = '';

  let nowPlaying = $derived($liveState.queues?.[0]?.currentSong?.name ?? '');

  async function fetchLyrics(q: string) {
    if (!q.trim()) return;
    loading = true; error = ''; result = null;
    try {
      result = await api.get<any>(`/api/lyrics?q=${encodeURIComponent(q)}`);
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }

  // Auto-fetch lyrics for the current song.
  $effect(() => {
    if (nowPlaying && nowPlaying !== lastAuto) {
      lastAuto = nowPlaying;
      query = nowPlaying;
      fetchLyrics(nowPlaying);
    }
  });
</script>

<svelte:head><title>Lyrics · MaowCore</title></svelte:head>

<PageHeader title="Lyrics" subtitle={nowPlaying ? `Synced to: ${nowPlaying}` : 'Search any song'} />

<Card class="mb-6">
  <div class="flex gap-2">
    <input class="input" placeholder="Search a song…" bind:value={query} onkeydown={(e) => e.key === 'Enter' && fetchLyrics(query)} />
    <button class="btn-primary" onclick={() => fetchLyrics(query)}>Search</button>
    {#if nowPlaying}<button class="btn-ghost" onclick={() => fetchLyrics(nowPlaying)} title="Re-sync to now-playing">↻</button>{/if}
  </div>
</Card>

{#if loading}
  <div class="space-y-2">{#each Array(8) as _}<div class="skel h-5"></div>{/each}</div>
{:else if error}
  <div class="card border-danger/40 p-4 text-sm text-danger">⚠ {error}</div>
{:else if result}
  <Card>
    <div class="mb-4 flex items-center gap-3">
      {#if result.thumbnail}<img src={result.thumbnail} alt="" class="h-16 w-16 rounded-card object-cover" />{/if}
      <div>
        <div class="font-display text-xl font-bold">{result.title}</div>
        <div class="text-sm text-muted">{result.artist}</div>
        {#if result.url}<a href={result.url} target="_blank" rel="noreferrer" class="text-xs text-accent hover:underline">View on Genius →</a>{/if}
      </div>
    </div>
    <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text">{result.lyrics}</pre>
  </Card>
{:else}
  <div class="card p-12 text-center text-muted"><div class="mb-2 text-4xl opacity-40">🎤</div>Search a song or play one to see lyrics.</div>
{/if}
