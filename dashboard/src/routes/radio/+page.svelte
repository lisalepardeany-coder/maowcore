<script lang="ts">
  import { onMount } from 'svelte';
  import { sendAction } from '$lib/ws';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  // radio-browser public API (CORS-enabled).
  const API = 'https://de1.api.radio-browser.info/json';

  let query = $state('');
  let loading = $state(true);
  let error = $state('');
  let stations = $state<any[]>([]);

  async function fetchStations(path: string) {
    loading = true; error = '';
    try {
      const res = await fetch(`${API}${path}`, { headers: { 'User-Agent': 'MaowCore-Dashboard/1.0' } });
      stations = (await res.json()).filter((s: any) => s.url_resolved).slice(0, 48);
    } catch (e) { error = 'Could not reach radio-browser. ' + (e as Error).message; }
    finally { loading = false; }
  }

  function search() {
    if (query.trim()) fetchStations(`/stations/search?limit=48&hidebroken=true&order=clickcount&reverse=true&name=${encodeURIComponent(query)}`);
    else fetchStations('/stations/topvote/48');
  }

  function play(s: any) {
    sendAction('play', { query: s.url_resolved });
    pushToast(`📻 Tuning to ${s.name}`, 'success');
  }

  const TAGS = ['lofi', 'jazz', 'rock', 'electronic', 'classical', 'pop', 'news', 'chill'];

  onMount(() => fetchStations('/stations/topvote/48'));
</script>

<svelte:head><title>Radio · MaowCore</title></svelte:head>

<PageHeader title="Radio" subtitle="Search & play internet radio stations" />

<Card class="mb-4">
  <div class="flex gap-2">
    <input class="input" placeholder="Search stations…" bind:value={query} onkeydown={(e) => e.key === 'Enter' && search()} />
    <button class="btn-primary" onclick={search}>Search</button>
  </div>
  <div class="mt-3 flex flex-wrap gap-1.5">
    {#each TAGS as t}
      <button class="pill bg-surface-2 text-muted hover:text-text" onclick={() => { query = t; search(); }}>{t}</button>
    {/each}
  </div>
</Card>

<States {loading} {error} empty={!loading && stations.length === 0} emptyText="No stations found." emptyIcon="📻">
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each stations as s (s.stationuuid)}
      <Card class="group flex items-center gap-3">
        {#if s.favicon}
          <img src={s.favicon} alt="" class="h-10 w-10 shrink-0 rounded-md object-cover" onerror={(e) => (e.currentTarget.style.display = 'none')} />
        {:else}
          <div class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface-2">📻</div>
        {/if}
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{s.name}</div>
          <div class="truncate text-[11px] text-muted">{s.country || '—'}{s.bitrate ? ` · ${s.bitrate}kbps` : ''}{s.codec ? ` · ${s.codec}` : ''}</div>
        </div>
        <button class="btn-primary h-8 shrink-0 px-3 text-xs" onclick={() => play(s)}>▶</button>
      </Card>
    {/each}
  </div>
</States>
