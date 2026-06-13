<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtNumber } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let data = $state<any>(null);

  async function load(gid: string) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      data = await api.get<any>(`/api/wrapped?guildId=${gid}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load($guildId);
  });
</script>

<svelte:head><title>Wrapped · MaowCore</title></svelte:head>

<PageHeader title="Music Wrapped" subtitle="Your server's year in music">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<States {loading} {error} empty={!loading && !data} emptyText="No history to wrap yet." emptyIcon="🎁">
  {#if data}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total plays" value={fmtNumber(data.totalPlays)} icon="▶️" accent />
      <StatCard label="Listening hours" value={fmtNumber(Math.round(data.listeningHours ?? 0))} icon="⏱️" />
      <StatCard label="Unique tracks" value={fmtNumber(data.uniqueTracks)} icon="🎵" />
      <StatCard label="Discovery" value={`${Math.round(data.discoveryPct ?? 0)}%`} icon="🔮" />
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <Card>
        <div class="mb-3 font-display text-lg font-bold">Top Tracks</div>
        <ol class="space-y-1">
          {#each (data.topTracks ?? []).slice(0, 10) as t, i}
            <li class="flex items-center gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2">
              <span class="font-display w-6 text-center font-bold text-accent">{i + 1}</span>
              <span class="min-w-0 flex-1 truncate text-sm">{t.name}</span>
              <span class="pill bg-surface-2 text-muted">{fmtNumber(t.plays ?? t.count)}</span>
            </li>
          {/each}
        </ol>
      </Card>
      <Card>
        <div class="mb-3 font-display text-lg font-bold">Top Artists</div>
        <ol class="space-y-1">
          {#each (data.topArtists ?? []).slice(0, 10) as a, i}
            <li class="flex items-center gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2">
              <span class="font-display w-6 text-center font-bold text-accent-3">{i + 1}</span>
              <span class="min-w-0 flex-1 truncate text-sm">{a.name}</span>
              <span class="pill bg-surface-2 text-muted">{fmtNumber(a.plays ?? a.count)}</span>
            </li>
          {/each}
        </ol>
      </Card>
    </div>
  {/if}
</States>
