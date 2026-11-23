<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  let loading = $state(true);
  let error = $state('');
  let commands = $state<any[]>([]);
  let form = $state({ name: '', template: '' });
  let testOutput = $state('');

  async function load(gid: string) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      commands = (await api.get<any>(`/api/custom-cmds/list?guildId=${gid}`)).commands ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function add() {
    if (!form.name.trim() || !form.template.trim()) return;
    try {
      await api.post('/api/custom-cmds/add', { guildId: $guildId, ...form });
      form = { name: '', template: '' };
      await load($guildId);
    } catch (e) { error = (e as Error).message; }
  }

  async function remove(name: string) {
    try { await api.post('/api/custom-cmds/remove', { guildId: $guildId, name }); await load($guildId); }
    catch (e) { error = (e as Error).message; }
  }

  async function run(name: string) {
    try {
      const res = await api.post<any>('/api/custom-cmds/run', { guildId: $guildId, name, args: [] });
      testOutput = `${name} → ${res.text}`;
    } catch (e) { testOutput = (e as Error).message; }
  }

  $effect(() => {
    load($guildId);
  });
</script>

<svelte:head><title>Custom Commands · MaowCore</title></svelte:head>

<PageHeader title="Custom Commands" subtitle="No-code command templates · tokens: {'{user}'} {'{server}'} {'{arg1}'}">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<Card class="mb-4">
  <div class="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
    <input class="input" placeholder="command name" bind:value={form.name} />
    <input class="input" placeholder="Response template with {'{user}'} etc." bind:value={form.template} />
    <button class="btn-primary" onclick={add}>Add</button>
  </div>
</Card>

{#if testOutput}
  <div class="card mb-4 border-accent/30 p-3 text-sm"><span class="text-accent">▶</span> {testOutput}</div>
{/if}

<States {loading} {error} empty={!loading && commands.length === 0} emptyText="No custom commands yet." emptyIcon="⚒️">
  <Card padding="p-0" class="overflow-hidden">
    {#each commands as c (c.name)}
      <div class="group flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-2">
        <code class="pill bg-surface-2 text-accent">/{c.name}</code>
        <span class="min-w-0 flex-1 truncate text-sm text-muted">{c.template}</span>
        {#if c.runCount}<span class="text-[11px] text-muted">{c.runCount}×</span>{/if}
        <div class="flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button class="btn-ghost h-7 px-2 text-xs" onclick={() => run(c.name)}>Test</button>
          <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => remove(c.name)}>Delete</button>
        </div>
      </div>
    {/each}
  </Card>
</States>
