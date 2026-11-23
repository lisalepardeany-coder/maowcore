<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtBytes, fmtNumber } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let report = $state<any>(null);
  let busy = $state(false);

  async function scan() {
    loading = true;
    error = '';
    try {
      const res = await api.get<any>('/api/library/cleanup/scan');
      report = res.report ?? res;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function deleteOrphans() {
    const files = (report?.orphans ?? []).map((o: any) => o.file ?? o.name ?? o);
    if (!files.length || !confirm(`Delete ${files.length} orphan files?`)) return;
    busy = true;
    try { await api.post('/api/library/cleanup/delete-orphans', { files }); await scan(); }
    catch (e) { alert((e as Error).message); }
    finally { busy = false; }
  }

  async function probeMissing() {
    busy = true;
    try { await api.post('/api/library/cleanup/probe-missing'); await scan(); }
    catch (e) { alert((e as Error).message); }
    finally { busy = false; }
  }

  onMount(scan);

  let orphans = $derived(report?.orphans ?? []);
  let dupes = $derived(report?.dupes ?? []);
  let unplayed = $derived(report?.unplayed ?? []);
  let missing = $derived(report?.missingDuration ?? []);
</script>

<svelte:head><title>Cleanup · MaowCore</title></svelte:head>

<PageHeader title="Library Cleanup" subtitle="Find orphans, duplicates, and stale files">
  {#snippet actions()}
    <button class="btn-ghost" onclick={scan}>↻ Re-scan</button>
  {/snippet}
</PageHeader>

<States {loading} {error}>
  {#if report}
    <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Orphan files" value={fmtNumber(orphans.length)} icon="👻" accent={orphans.length > 0} />
      <StatCard label="Duplicates" value={fmtNumber(dupes.length)} icon="👯" />
      <StatCard label="Unplayed >180d" value={fmtNumber(unplayed.length)} icon="🕸️" />
      <StatCard label="Missing duration" value={fmtNumber(missing.length)} icon="⏱️" />
    </div>

    <div class="flex flex-wrap gap-2">
      {#if orphans.length}
        <button class="btn-primary" onclick={deleteOrphans} disabled={busy}>🗑️ Delete {orphans.length} orphans</button>
      {/if}
      {#if missing.length}
        <button class="btn-ghost" onclick={probeMissing} disabled={busy}>🩺 Re-probe {missing.length} durations</button>
      {/if}
    </div>

    {#if report.breakdown && Object.keys(report.breakdown).length}
      <Card class="mt-6">
        <div class="mb-3 font-display text-lg font-bold">Storage by format</div>
        <div class="space-y-2">
          {#each Object.entries(report.breakdown).sort((a, b) => (b[1] as any).bytes - (a[1] as any).bytes) as [fmt, info]}
            {@const totalBytes = report.totalBytes || 1}
            <div>
              <div class="flex items-center justify-between text-sm">
                <span class="uppercase text-muted">{fmt} · {(info as any).count} files</span>
                <span>{fmtBytes((info as any).bytes)}</span>
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-2">
                <div
                  class="h-full rounded-pill"
                  style="width:{Math.round(((info as any).bytes / totalBytes) * 100)}%; background-image: linear-gradient(90deg, var(--accent), var(--accent-3))"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      </Card>
    {/if}

    {#if orphans.length}
      <Card class="mt-4">
        <div class="mb-2 font-display text-base font-bold">👻 Orphans</div>
        <ul class="max-h-60 space-y-0.5 overflow-y-auto text-xs text-muted">
          {#each orphans as o}<li class="truncate">{o.file ?? o.name ?? o}</li>{/each}
        </ul>
      </Card>
    {/if}
  {/if}
</States>
