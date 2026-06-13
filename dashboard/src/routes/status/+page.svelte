<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { liveState, wsConnected } from '$lib/ws';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';
  import { fmtDuration } from '$lib/format';

  let health = $state<any>({});
  async function refresh() { try { health = await api.get<any>('/api/health'); } catch { /* */ } }
  onMount(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); });

  let diagHealth = $derived($liveState.diagnostics?.health ?? {});
  let uptime = $derived(health.startedAt ? Math.floor((Date.now() - health.startedAt) / 1000) : 0);
  let allOk = $derived($wsConnected && !!health.botTag && Object.values(diagHealth).every((s) => s === 'ok'));
  let anyDown = $derived(Object.values(diagHealth).some((s) => s === 'down') || !$wsConnected);

  const DOT: Record<string, string> = { ok: 'bg-success', degraded: 'bg-warn', down: 'bg-danger' };
</script>

<svelte:head><title>Status · MaowCore</title></svelte:head>

<PageHeader title="Status" subtitle="Live operational status" />

<Card class="mb-6 text-center" padding="p-8">
  <div class="text-5xl">{allOk ? '🟢' : anyDown ? '🔴' : '🟡'}</div>
  <div class="mt-3 font-display text-2xl font-extrabold">{allOk ? 'All systems operational' : anyDown ? 'Service disruption' : 'Partial degradation'}</div>
  <div class="mt-1 text-sm text-muted">{health.botTag ?? 'MaowCore'} · v{health.version ?? '—'} · up {health.startedAt ? fmtDuration(uptime) : '—'}</div>
</Card>

<Card>
  <div class="mb-3 font-display text-lg font-bold">Components</div>
  <div class="space-y-1.5">
    <div class="flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2.5 text-sm">
      <span class="h-2.5 w-2.5 rounded-full {$wsConnected ? 'bg-success' : 'bg-danger'}"></span>
      <span class="flex-1">Dashboard link (WebSocket)</span>
      <span class="text-xs capitalize text-muted">{$wsConnected ? 'operational' : 'down'}</span>
    </div>
    {#each Object.entries(diagHealth) as [name, st]}
      <div class="flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2.5 text-sm">
        <span class="h-2.5 w-2.5 rounded-full {DOT[st as string]}"></span>
        <span class="flex-1 capitalize">{name}</span>
        <span class="text-xs capitalize text-muted">{st === 'ok' ? 'operational' : st}</span>
      </div>
    {/each}
  </div>
  <p class="mt-3 text-[11px] text-muted">Auto-refreshes every 15s. Live subsystem health streamed from the bot.</p>
</Card>
