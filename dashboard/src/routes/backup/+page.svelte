<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtBytes, fmtRelative } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let snapshots = $state<any[]>([]);
  let bundles = $state<any[]>([]);
  let busy = $state(false);

  async function load() {
    loading = true;
    error = '';
    try {
      const [s, b] = await Promise.all([
        api.get<any>('/api/backup/list'),
        api.get<any>('/api/market/list'),
      ]);
      snapshots = s.snapshots ?? [];
      bundles = b.bundles ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function createSnapshot() {
    busy = true;
    try { await api.post('/api/backup/create'); await load(); }
    catch (e) { alert((e as Error).message); }
    finally { busy = false; }
  }

  async function restore(name: string) {
    if (!confirm(`Restore snapshot "${name}"? This overwrites current state.`)) return;
    try { await api.post('/api/backup/restore', { name }); alert('Restored — restart the bot to apply.'); }
    catch (e) { alert((e as Error).message); }
  }

  async function del(name: string) {
    if (!confirm('Delete this snapshot?')) return;
    try { await api.post('/api/backup/delete', { name }); await load(); }
    catch (e) { alert((e as Error).message); }
  }

  onMount(load);
</script>

<svelte:head><title>Backup & Share · MaowCore</title></svelte:head>

<PageHeader title="Backup & Share" subtitle="Snapshots for disaster recovery + shareable config bundles">
  {#snippet actions()}
    <button class="btn-primary" onclick={createSnapshot} disabled={busy}>
      {busy ? 'Creating…' : '📸 New snapshot'}
    </button>
  {/snippet}
</PageHeader>

<States {loading} {error}>
  <Card class="mb-6">
    <div class="mb-3 font-display text-lg font-bold">💾 Snapshots</div>
    {#if snapshots.length === 0}
      <p class="text-sm text-muted">No snapshots yet. Daily auto-snapshots will appear here.</p>
    {:else}
      <div class="space-y-2">
        {#each snapshots as s (s.name)}
          <div class="group flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2.5">
            <span class="text-lg">📦</span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{s.name}</div>
              <div class="text-[11px] text-muted">{fmtBytes(s.bytes ?? s.size)} · {fmtRelative(s.createdAt ?? s.mtime)}</div>
            </div>
            <div class="flex gap-1 opacity-0 transition group-hover:opacity-100">
              <button class="btn-ghost h-7 px-2 text-xs" onclick={() => restore(s.name)}>↺ Restore</button>
              <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => del(s.name)}>Delete</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card>
    <div class="mb-3 font-display text-lg font-bold">🧩 Marketplace bundles</div>
    {#if bundles.length === 0}
      <p class="text-sm text-muted">No saved bundles.</p>
    {:else}
      <div class="space-y-2">
        {#each bundles as b (b.file ?? b.name)}
          <div class="flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2.5">
            <span class="pill bg-bg-soft text-accent">{b.kind ?? 'bundle'}</span>
            <span class="min-w-0 flex-1 truncate text-sm">{b.name ?? b.file}</span>
            {#if b.description}<span class="hidden truncate text-[11px] text-muted sm:block">{b.description}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </Card>
</States>
