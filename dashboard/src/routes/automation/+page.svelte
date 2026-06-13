<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  let loading = $state(true);
  let error = $state('');
  let crons = $state<any[]>([]);
  let webhooks = $state<any[]>([]);
  let rules = $state<any[]>([]);

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await api.get<any>('/api/automation/list');
      crons = res.crons ?? [];
      webhooks = res.webhooks ?? [];
      rules = res.rules ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function removeCron(id: string) {
    try { await api.post('/api/automation/cron/remove', { id }); await load(); }
    catch (e) { alert((e as Error).message); }
  }
  async function toggleCron(id: string, enabled: boolean) {
    try { await api.post('/api/automation/cron/toggle', { id, enabled }); await load(); }
    catch (e) { alert((e as Error).message); }
  }
  async function removeWebhook(id: string) {
    try { await api.post('/api/automation/webhook/remove', { id }); await load(); }
    catch (e) { alert((e as Error).message); }
  }
  async function removeRule(id: string) {
    try { await api.post('/api/automation/rule/remove', { id }); await load(); }
    catch (e) { alert((e as Error).message); }
  }

  onMount(load);
</script>

<svelte:head><title>Automation · MaowCore</title></svelte:head>

<PageHeader title="Automation" subtitle="Cron jobs, incoming webhooks, and event rules" />

<States {loading} {error}>
  <div class="grid gap-6 lg:grid-cols-3">
    <Card>
      <div class="mb-3 flex items-center justify-between">
        <span class="font-display font-bold">⏰ Crons</span>
        <span class="pill bg-surface-2 text-muted">{crons.length}</span>
      </div>
      {#if crons.length === 0}<p class="text-sm text-muted">No cron jobs.</p>{/if}
      <div class="space-y-2">
        {#each crons as c (c.id)}
          <div class="rounded-btn bg-surface-2 p-3">
            <div class="flex items-center justify-between">
              <code class="text-xs text-accent-2">{c.expr ?? c.expression}</code>
              <div class="flex items-center gap-2">
                <input type="checkbox" checked={c.enabled !== false} onchange={(e) => toggleCron(c.id, e.currentTarget.checked)} />
                <button class="text-muted hover:text-danger" onclick={() => removeCron(c.id)}>✕</button>
              </div>
            </div>
            <div class="mt-1 truncate text-[11px] text-muted">{c.action?.line ?? c.name ?? ''}</div>
          </div>
        {/each}
      </div>
    </Card>

    <Card>
      <div class="mb-3 flex items-center justify-between">
        <span class="font-display font-bold">🪝 Webhooks</span>
        <span class="pill bg-surface-2 text-muted">{webhooks.length}</span>
      </div>
      {#if webhooks.length === 0}<p class="text-sm text-muted">No webhooks.</p>{/if}
      <div class="space-y-2">
        {#each webhooks as w (w.id)}
          <div class="rounded-btn bg-surface-2 p-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">{w.name}</span>
              <button class="text-muted hover:text-danger" onclick={() => removeWebhook(w.id)}>✕</button>
            </div>
            <div class="mt-1 text-[11px] text-muted">{w.hitCount ?? 0} hits</div>
          </div>
        {/each}
      </div>
    </Card>

    <Card>
      <div class="mb-3 flex items-center justify-between">
        <span class="font-display font-bold">⚡ Rules</span>
        <span class="pill bg-surface-2 text-muted">{rules.length}</span>
      </div>
      {#if rules.length === 0}<p class="text-sm text-muted">No rules.</p>{/if}
      <div class="space-y-2">
        {#each rules as r (r.id)}
          <div class="rounded-btn bg-surface-2 p-3">
            <div class="flex items-center justify-between">
              <span class="pill bg-accent/20 text-accent text-[10px]">{r.event}</span>
              <button class="text-muted hover:text-danger" onclick={() => removeRule(r.id)}>✕</button>
            </div>
            <div class="mt-1 truncate text-[11px] text-muted">{r.action?.line ?? ''}</div>
          </div>
        {/each}
      </div>
    </Card>
  </div>
</States>
