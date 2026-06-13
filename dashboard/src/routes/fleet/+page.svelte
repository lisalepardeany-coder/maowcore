<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';

  interface Instance {
    id: string;
    name: string;
    url: string;
    token?: string;
    health: 'ok' | 'down' | 'checking';
    latency?: number;
    botTag?: string;
    version?: string;
  }

  let instances = $state<Instance[]>([]);
  let busy = $state(false);

  // Editor: null = closed, 'new' = adding, otherwise the id being edited.
  let editing = $state<null | 'new' | string>(null);
  let form = $state({ name: '', url: '', token: '' });

  const STORAGE_KEY = 'maow.instances';

  function persist() {
    // Store only the configurable fields (not transient health/latency).
    const data = instances.map((i) => ({ id: i.id, name: i.name, url: i.url, token: i.token }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadInstances(): Instance[] {
    let raw: any[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) raw = JSON.parse(stored);
    } catch {
      /* ignore bad json */
    }
    if (!Array.isArray(raw) || raw.length === 0) {
      raw = [{ id: 'self', name: 'This bot', url: location.origin }];
    }
    return raw.map((r, i) => ({
      id: r.id ?? String(i),
      name: r.name ?? 'Instance',
      url: r.url ?? location.origin,
      token: r.token,
      health: 'checking' as const,
    }));
  }

  async function probe(inst: Instance) {
    inst.health = 'checking';
    const started = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (inst.token) headers.Authorization = `Bearer ${inst.token}`;
      const res = await fetch(`${inst.url.replace(/\/$/, '')}/api/health`, { headers });
      const data = await res.json().catch(() => ({}));
      inst.health = res.ok ? 'ok' : 'down';
      inst.latency = Math.round(performance.now() - started);
      inst.botTag = data.botTag;
      inst.version = data.version;
    } catch {
      inst.health = 'down';
    }
  }

  async function probeAll() {
    if (busy) return;
    busy = true;
    const next = [...instances];
    for (const inst of next) await probe(inst);
    instances = next;
    busy = false;
  }

  function openAdd() {
    editing = 'new';
    form = { name: '', url: '', token: '' };
  }
  function openEdit(inst: Instance) {
    editing = inst.id;
    form = { name: inst.name, url: inst.url, token: inst.token ?? '' };
  }

  async function save() {
    const name = form.name.trim();
    let url = form.url.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//.test(url)) url = 'http://' + url;

    if (editing === 'new') {
      instances = [
        ...instances,
        { id: `i-${Date.now().toString(36)}`, name, url, token: form.token.trim() || undefined, health: 'checking' },
      ];
    } else {
      instances = instances.map((i) =>
        i.id === editing ? { ...i, name, url, token: form.token.trim() || undefined } : i,
      );
    }
    persist();
    editing = null;
    await probeAll();
  }

  function remove(id: string) {
    if (!confirm('Remove this instance from your fleet?')) return;
    instances = instances.filter((i) => i.id !== id);
    if (instances.length === 0) instances = loadInstances();
    persist();
  }

  onMount(() => {
    instances = loadInstances();
    probeAll();
  });

  const DOT: Record<string, string> = {
    ok: 'bg-success',
    down: 'bg-danger',
    checking: 'bg-warn animate-pulse-glow',
  };
</script>

<svelte:head><title>Fleet · MaowCore</title></svelte:head>

<PageHeader title="Fleet" subtitle="Monitor all your bot instances">
  {#snippet actions()}
    <button class="btn-ghost" onclick={probeAll} disabled={busy}>{busy ? 'Checking…' : '↻ Refresh'}</button>
    <button class="btn-primary" onclick={openAdd}>+ Add instance</button>
  {/snippet}
</PageHeader>

{#if editing}
  <Card class="mb-4 animate-fade-up">
    <div class="mb-3 font-display text-base font-bold">{editing === 'new' ? 'Add instance' : 'Edit instance'}</div>
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="mb-1 block text-xs font-semibold text-muted">Name</label>
        <input class="input" placeholder="My second bot" bind:value={form.name} />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold text-muted">Control server URL</label>
        <input class="input" placeholder="http://127.0.0.1:8766" bind:value={form.url} />
      </div>
      <div class="sm:col-span-2">
        <label class="mb-1 block text-xs font-semibold text-muted">Bearer token (optional)</label>
        <input class="input" placeholder="Only if CONTROL_TOKEN is set on that instance" bind:value={form.token} />
      </div>
    </div>
    <div class="mt-3 flex justify-end gap-2">
      <button class="btn-ghost" onclick={() => (editing = null)}>Cancel</button>
      <button class="btn-primary" onclick={save}>Save</button>
    </div>
  </Card>
{/if}

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {#each instances as inst (inst.id)}
    <Card class="group animate-fade-up">
      <div class="flex items-center justify-between">
        <span class="font-display font-bold">{inst.name}</span>
        <span class="flex items-center gap-1.5 text-xs text-muted">
          <span class="h-2.5 w-2.5 rounded-full {DOT[inst.health]}"></span>
          {inst.health === 'ok' ? 'healthy' : inst.health === 'down' ? 'offline' : 'checking'}
        </span>
      </div>
      <div class="mt-2 space-y-1 text-xs text-muted">
        <div class="truncate">🔗 {inst.url}</div>
        {#if inst.botTag}<div>🤖 {inst.botTag}</div>{/if}
        {#if inst.version}<div>🏷️ v{inst.version}</div>{/if}
        {#if inst.latency != null && inst.health === 'ok'}<div>⚡ {inst.latency}ms</div>{/if}
      </div>
      <div class="mt-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <button class="btn-ghost h-7 px-2 text-xs" onclick={() => openEdit(inst)}>Edit</button>
        <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => remove(inst.id)}>Remove</button>
      </div>
    </Card>
  {/each}
</div>

<p class="mt-4 text-xs text-muted">
  Instances are stored in your browser. The dashboard always controls <em>this</em> bot;
  other instances here are monitored for health only.
</p>
