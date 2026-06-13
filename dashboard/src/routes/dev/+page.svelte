<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  let loading = $state(true);
  let error = $state('');
  let endpoints = $state<any[]>([]);
  let plugins = $state<any[]>([]);
  let filter = $state('');

  // SQL runner
  let sql = $state('SELECT name FROM sqlite_master WHERE type=\'table\';');
  let sqlResult = $state<any>(null);
  let sqlError = $state('');

  async function load() {
    loading = true;
    try {
      const [ep, pl] = await Promise.all([
        api.get<any>('/api/dev/endpoints').catch(() => ({ endpoints: [] })),
        api.get<any>('/api/dev/plugins').catch(() => ({ plugins: [] })),
      ]);
      endpoints = ep.endpoints ?? ep ?? [];
      plugins = pl.plugins ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function runSql() {
    sqlError = '';
    sqlResult = null;
    try {
      sqlResult = await api.post<any>('/api/dev/db/query', { sql });
    } catch (e) {
      sqlError = (e as Error).message;
    }
  }

  let filtered = $derived(
    filter
      ? endpoints.filter((e) => JSON.stringify(e).toLowerCase().includes(filter.toLowerCase()))
      : endpoints,
  );

  onMount(load);
</script>

<svelte:head><title>Developer · MaowCore</title></svelte:head>

<PageHeader title="Developer" subtitle="API catalog, plugins, and a live SQL console" />

<States {loading} {error}>
  <!-- SQL console -->
  <Card class="mb-6">
    <div class="mb-2 font-display text-lg font-bold">🗄️ SQL Console</div>
    <textarea class="input font-mono text-xs min-h-20" bind:value={sql}></textarea>
    <button class="btn-primary mt-2" onclick={runSql}>Run (read-only)</button>
    {#if sqlError}<div class="mt-2 text-sm text-danger">⚠ {sqlError}</div>{/if}
    {#if sqlResult?.rows}
      <div class="mt-3 max-h-72 overflow-auto rounded-card border border-border">
        <table class="w-full text-left text-xs">
          <thead class="sticky top-0 bg-surface-2">
            <tr>{#each sqlResult.columns as c}<th class="px-2 py-1 font-semibold">{c}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each sqlResult.rows as row}
              <tr class="border-t border-border">
                {#each sqlResult.columns as c}<td class="px-2 py-1 text-muted">{row[c]}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if sqlResult.capped}<p class="mt-1 text-xs text-warn">Capped at 1000 rows ({sqlResult.totalRows} total).</p>{/if}
    {/if}
  </Card>

  <!-- Endpoints -->
  <Card class="mb-6">
    <div class="mb-2 flex items-center justify-between">
      <span class="font-display text-lg font-bold">🔌 API Endpoints</span>
      <input class="input max-w-[200px]" placeholder="Filter…" bind:value={filter} />
    </div>
    <div class="max-h-96 space-y-0.5 overflow-y-auto">
      {#each filtered as e}
        <div class="flex items-center gap-2 rounded-btn px-2 py-1 text-xs hover:bg-surface-2">
          <span class="pill {e.method === 'POST' ? 'bg-accent-3/20 text-accent-3' : 'bg-success/20 text-success'} w-14 justify-center">{e.method ?? 'GET'}</span>
          <code class="text-muted">{e.path ?? e}</code>
          {#if e.desc}<span class="truncate text-muted opacity-70">— {e.desc}</span>{/if}
        </div>
      {/each}
    </div>
  </Card>

  <!-- Plugins -->
  <Card>
    <div class="mb-2 font-display text-lg font-bold">🧩 Plugins</div>
    {#if plugins.length === 0}
      <p class="text-sm text-muted">No plugins loaded.</p>
    {:else}
      <div class="grid gap-2 sm:grid-cols-2">
        {#each plugins as p}
          <div class="rounded-btn bg-surface-2 px-3 py-2">
            <div class="text-sm font-medium">{p.name ?? p.id}</div>
            <div class="text-[11px] text-muted">v{p.version ?? '?'} · {p.id}</div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>
</States>
