<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtNumber } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let leaderboard = $state<any[]>([]);
  let topRated = $state<any[]>([]);

  async function load(gid: string) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      const [lb, tr] = await Promise.all([
        api.get<any>(`/api/social/leaderboard?guildId=${gid}`),
        api.get<any>(`/api/social/top-rated?guildId=${gid}`),
      ]);
      leaderboard = lb.leaderboard ?? [];
      topRated = tr.topRated ?? [];
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

<svelte:head><title>Social · MaowCore</title></svelte:head>

<PageHeader title="Social" subtitle="Top listeners and best-rated tracks">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-2">
  <Card>
    <div class="mb-3 font-display text-lg font-bold">🏆 Top Listeners</div>
    <States {loading} {error} empty={!loading && leaderboard.length === 0} emptyText="No listening data yet.">
      <ol class="space-y-1">
        {#each leaderboard as row, i}
          <li class="flex items-center gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2">
            <span class="font-display w-6 text-center font-bold text-accent">{i + 1}</span>
            {#if row.avatar}<img src={row.avatar} alt="" class="h-7 w-7 rounded-full" />{/if}
            <span class="min-w-0 flex-1 truncate text-sm">{row.name ?? row.tag ?? row.user ?? row.userId}</span>
            <span class="pill bg-surface-2 text-muted">{fmtNumber(row.plays ?? row.count ?? 0)} plays</span>
          </li>
        {/each}
      </ol>
    </States>
  </Card>

  <Card>
    <div class="mb-3 font-display text-lg font-bold">⭐ Top Rated</div>
    <States {loading} {error} empty={!loading && topRated.length === 0} emptyText="No ratings yet.">
      <ol class="space-y-1">
        {#each topRated as row, i}
          <li class="flex items-center gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2">
            <span class="font-display w-6 text-center font-bold text-accent">{i + 1}</span>
            <span class="min-w-0 flex-1 truncate text-sm">{row.song ?? row.name}</span>
            <span class="pill bg-surface-2 text-warn">★ {(row.avg ?? row.rating ?? 0).toFixed?.(1) ?? row.avg}</span>
            <span class="text-[11px] text-muted">{fmtNumber(row.count ?? 0)}×</span>
          </li>
        {/each}
      </ol>
    </States>
  </Card>
</div>
