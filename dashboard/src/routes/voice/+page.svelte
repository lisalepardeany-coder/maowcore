<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { liveState } from '$lib/ws';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtNumber } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let voiceChannels = $state<any[]>([]);

  let queues = $derived($liveState.queues ?? []);
  let disc = $derived($liveState.stats?.discord ?? {});

  async function load(gid: string) {
    if (!gid) return;
    loading = true; error = '';
    try {
      const res = await api.get<any>(`/api/admin/channels?guildId=${gid}`);
      // Voice = type 2, Stage = 13.
      voiceChannels = (res.groups ?? []).flatMap((g: any) => g.channels).filter((c: any) => c.type === 2 || c.type === 13);
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }
  $effect(() => { load($guildId); });

  let occupied = $derived(voiceChannels.filter((c) => (c.memberCount ?? 0) > 0));
</script>

<svelte:head><title>Voice Activity · MaowCore</title></svelte:head>

<PageHeader title="Voice Activity" subtitle="Who's in voice and what's playing">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
  <StatCard label="Active sessions" value={fmtNumber(queues.length)} icon="🎶" accent />
  <StatCard label="Voice connections" value={fmtNumber(disc.voiceConnections)} icon="🔊" />
  <StatCard label="Occupied channels" value={fmtNumber(occupied.length)} icon="👥" />
  <StatCard label="Est. bandwidth" value={`${(disc.voiceConnections ?? 0) * 256} kbps`} icon="📡" />
</div>

<States {loading} {error}>
  {#if queues.length}
    <Card class="mb-6">
      <div class="mb-3 font-display text-lg font-bold">Now playing</div>
      <div class="space-y-2">
        {#each queues as q (q.guildId)}
          <div class="flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2.5">
            {#if q.currentSong?.thumbnail}<img src={q.currentSong.thumbnail} alt="" class="h-10 w-10 shrink-0 rounded-md object-cover" />{:else}<div class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-bg-soft">🎵</div>{/if}
            <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium">{q.currentSong?.name ?? 'idle'}</div><div class="truncate text-[11px] text-muted">{q.guildName} · 🔊 {q.voiceChannelName ?? '—'}</div></div>
            <span class="pill bg-bg-soft text-muted">{q.paused ? '⏸' : '▶'} {q.volume ?? 100}%</span>
          </div>
        {/each}
      </div>
    </Card>
  {/if}

  <Card>
    <div class="mb-3 font-display text-lg font-bold">Voice channels</div>
    {#if voiceChannels.length === 0}
      <p class="text-sm text-muted">No voice channels found.</p>
    {:else}
      <div class="space-y-1">
        {#each voiceChannels.sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0)) as c (c.id)}
          <div class="flex items-center gap-3 rounded-btn px-3 py-2 {(c.memberCount ?? 0) > 0 ? 'bg-surface-2' : ''}">
            <span>{c.type === 13 ? '🎤' : '🔊'}</span>
            <span class="flex-1 text-sm {(c.memberCount ?? 0) > 0 ? 'font-medium' : 'text-muted'}">{c.name}</span>
            {#if (c.memberCount ?? 0) > 0}<span class="pill bg-accent/20 text-accent">👥 {c.memberCount}</span>{:else}<span class="text-[11px] text-muted">empty</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </Card>
</States>
