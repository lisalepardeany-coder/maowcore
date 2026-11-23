<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import StatCard from '$lib/components/StatCard.svelte';
  import Card from '$lib/components/Card.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtNumber, fmtDuration } from '$lib/format';

  interface Track { name?: string; count?: number; plays?: number }
  let loading = $state(true);
  let error = $state('');
  let stats = $state<any>(null);

  async function load(gid: string) {
    loading = true;
    error = '';
    try {
      // /api/stats returns { total, totalListeningSec, topSongs, topArtists, plays24h }
      stats = await api.get<any>(`/api/stats${gid ? `?guildId=${gid}` : ''}`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load($guildId);
  });

  let topSongs = $derived<Track[]>(stats?.topSongs ?? []);
  let topArtists = $derived<Track[]>(stats?.topArtists ?? []);
  let plays24h = $derived<number[]>(stats?.plays24h ?? []);
  let peak = $derived(Math.max(1, ...plays24h));
  const val = (t: Track) => t.count ?? t.plays ?? 0;
</script>

<svelte:head><title>Insights · MaowCore</title></svelte:head>

<PageHeader title="Insights" subtitle="Listening stats for this server">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<States {loading} {error}>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard label="Total plays" value={fmtNumber(stats?.total)} icon="▶️" accent />
    <StatCard label="Listening time" value={fmtDuration(stats?.totalListeningSec)} icon="⏱️" />
    <StatCard label="Unique tracks" value={fmtNumber(topSongs.length)} icon="🎵" />
    <StatCard label="Artists" value={fmtNumber(topArtists.length)} icon="🎤" />
  </div>

  <!-- 24h activity sparkline -->
  {#if plays24h.length}
    <Card class="mt-6">
      <div class="mb-3 font-display text-lg font-bold">Plays over last 24h</div>
      <div class="flex h-28 items-end gap-1">
        {#each plays24h as count, h}
          <div class="group relative flex-1" title="{count} plays at {h}:00">
            <div
              class="rounded-t transition-all"
              style="height:{Math.max(2, (count / peak) * 100)}%; background-image: linear-gradient(to top, var(--accent), var(--accent-3))"
            ></div>
          </div>
        {/each}
      </div>
      <div class="mt-1 flex justify-between text-[10px] text-muted">
        <span>24h ago</span><span>12h</span><span>now</span>
      </div>
    </Card>
  {/if}

  <div class="mt-6 grid gap-6 lg:grid-cols-2">
    <Card>
      <div class="mb-3 font-display text-lg font-bold">🎵 Top Tracks</div>
      {#if topSongs.length === 0}
        <p class="text-sm text-muted">No plays recorded yet — queue some music!</p>
      {:else}
        <ol class="space-y-1">
          {#each topSongs.slice(0, 10) as t, i}
            <li class="flex items-center gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2">
              <span class="font-display w-6 text-center font-bold text-accent">{i + 1}</span>
              <span class="min-w-0 flex-1 truncate text-sm">{t.name}</span>
              <span class="pill bg-surface-2 text-muted">{fmtNumber(val(t))} plays</span>
            </li>
          {/each}
        </ol>
      {/if}
    </Card>

    <Card>
      <div class="mb-3 font-display text-lg font-bold">🎤 Top Artists</div>
      {#if topArtists.length === 0}
        <p class="text-sm text-muted">No artist data yet.</p>
      {:else}
        <ol class="space-y-1">
          {#each topArtists.slice(0, 10) as a, i}
            <li class="flex items-center gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2">
              <span class="font-display w-6 text-center font-bold text-accent-3">{i + 1}</span>
              <span class="min-w-0 flex-1 truncate text-sm">{a.name}</span>
              <span class="pill bg-surface-2 text-muted">{fmtNumber(val(a))} plays</span>
            </li>
          {/each}
        </ol>
      {/if}
    </Card>
  </div>
</States>
