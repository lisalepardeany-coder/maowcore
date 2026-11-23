<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtNumber, fmtDuration } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let stats = $state<any>({});
  let heatmap = $state<any[]>([]);

  async function load(gid: string) {
    loading = true; error = '';
    try {
      const [s, h] = await Promise.all([
        api.get<any>(`/api/stats${gid ? `?guildId=${gid}` : ''}`),
        gid ? api.get<any>(`/api/admin/heatmap?guildId=${gid}&days=182`).catch(() => ({ days: [] })) : Promise.resolve({ days: [] }),
      ]);
      stats = s;
      heatmap = h.days ?? h.heatmap ?? [];
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }
  $effect(() => { load($guildId); });

  let plays24h = $derived<number[]>(stats.plays24h ?? []);
  let peak24 = $derived(Math.max(1, ...plays24h));
  let hmMax = $derived(Math.max(1, ...heatmap.map((d: any) => d.count ?? d.plays ?? 0)));
  function hmColor(n: number): string {
    if (!n) return 'var(--surface-2)';
    const t = Math.min(1, n / hmMax);
    return `color-mix(in srgb, var(--accent) ${Math.round(20 + t * 80)}%, var(--surface-2))`;
  }
</script>

<svelte:head><title>Analytics · MaowCore</title></svelte:head>

<PageHeader title="Server Analytics" subtitle="Listening trends & activity">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<States {loading} {error}>
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard label="Total plays" value={fmtNumber(stats.total)} icon="▶️" accent />
    <StatCard label="Listening time" value={fmtDuration(stats.totalListeningSec)} icon="⏱️" />
    <StatCard label="Unique tracks" value={fmtNumber((stats.topSongs ?? []).length)} icon="🎵" />
    <StatCard label="Artists" value={fmtNumber((stats.topArtists ?? []).length)} icon="🎤" />
  </div>

  {#if plays24h.length}
    <Card class="mt-6">
      <div class="mb-3 font-display text-lg font-bold">Activity · last 24h</div>
      <div class="flex h-28 items-end gap-1">
        {#each plays24h as count, h}
          <div class="flex-1 rounded-t transition-all" style="height:{Math.max(2, (count / peak24) * 100)}%; background-image:linear-gradient(to top, var(--accent), var(--accent-3))" title="{count} @ {h}:00"></div>
        {/each}
      </div>
      <div class="mt-1 flex justify-between text-[10px] text-muted"><span>24h ago</span><span>12h</span><span>now</span></div>
    </Card>
  {/if}

  {#if heatmap.length}
    <Card class="mt-6">
      <div class="mb-3 font-display text-lg font-bold">Listening heatmap</div>
      <div class="flex flex-wrap gap-1">
        {#each heatmap as d}
          <div class="h-3 w-3 rounded-sm" style="background:{hmColor(d.count ?? d.plays ?? 0)}" title="{d.date ?? ''}: {d.count ?? d.plays ?? 0} plays"></div>
        {/each}
      </div>
    </Card>
  {/if}

  <div class="mt-6 grid gap-6 lg:grid-cols-2">
    <Card>
      <div class="mb-3 font-display text-lg font-bold">Top tracks</div>
      {#if (stats.topSongs ?? []).length === 0}<p class="text-sm text-muted">No data.</p>{:else}
        <ol class="space-y-1">{#each stats.topSongs.slice(0, 10) as t, i}<li class="flex items-center gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2"><span class="font-display w-6 text-center font-bold text-accent">{i + 1}</span><span class="min-w-0 flex-1 truncate text-sm">{t.name}</span><span class="pill bg-surface-2 text-muted">{fmtNumber(t.count ?? t.plays)}</span></li>{/each}</ol>
      {/if}
    </Card>
    <Card>
      <div class="mb-3 font-display text-lg font-bold">Top artists</div>
      {#if (stats.topArtists ?? []).length === 0}<p class="text-sm text-muted">No data.</p>{:else}
        <ol class="space-y-1">{#each stats.topArtists.slice(0, 10) as a, i}<li class="flex items-center gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2"><span class="font-display w-6 text-center font-bold text-accent-3">{i + 1}</span><span class="min-w-0 flex-1 truncate text-sm">{a.name}</span><span class="pill bg-surface-2 text-muted">{fmtNumber(a.count ?? a.plays)}</span></li>{/each}</ol>
      {/if}
    </Card>
  </div>
</States>
