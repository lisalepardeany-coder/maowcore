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
  let roles = $state<any[]>([]);

  // Editor state: null = closed, 'new' = create, otherwise editing a role id.
  let editing = $state<null | 'new' | string>(null);
  let form = $state({ name: '', color: '#5865F2', hoist: false, mentionable: false });
  let saving = $state(false);

  async function load(gid: string) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      roles = (await api.get<any>(`/api/admin/roles?guildId=${gid}`)).roles ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function openCreate() {
    editing = 'new';
    form = { name: '', color: '#5865F2', hoist: false, mentionable: false };
  }
  function openEdit(r: any) {
    editing = r.id;
    form = {
      name: r.name,
      color: r.hexColor && r.hexColor !== '#000000' ? r.hexColor : '#99AAB5',
      hoist: !!r.hoist,
      mentionable: !!r.mentionable,
    };
  }

  async function save() {
    if (!form.name.trim()) return;
    saving = true;
    try {
      const payload = { guildId: $guildId, ...form };
      if (editing === 'new') await api.post('/api/admin/role-create', payload);
      else await api.post('/api/admin/role-edit', { ...payload, roleId: editing });
      editing = null;
      await load($guildId);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      saving = false;
    }
  }

  async function del(r: any) {
    if (!confirm(`Delete role "${r.name}"? This cannot be undone.`)) return;
    try {
      await api.post('/api/admin/role-delete', { guildId: $guildId, roleId: r.id });
      await load($guildId);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  $effect(() => {
    load($guildId);
  });
</script>

<svelte:head><title>Roles · MaowCore</title></svelte:head>

<PageHeader title="Roles" subtitle={`${roles.length} roles`}>
  {#snippet actions()}
    <button class="btn-primary" onclick={openCreate}>+ Create role</button>
    <GuildPicker />
  {/snippet}
</PageHeader>

{#if editing}
  <Card class="mb-4 animate-fade-up">
    <div class="mb-3 font-display text-base font-bold">{editing === 'new' ? 'Create role' : 'Edit role'}</div>
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="mb-1 block text-xs font-semibold text-muted">Name</label>
        <input class="input" placeholder="Role name" bind:value={form.name} />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold text-muted">Color</label>
        <div class="flex items-center gap-2">
          <input type="color" class="h-9 w-12 cursor-pointer rounded-btn border border-border bg-bg-soft" bind:value={form.color} />
          <input class="input flex-1" bind:value={form.color} />
        </div>
      </div>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-4">
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={form.hoist} /> Display separately (hoist)</label>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={form.mentionable} /> Allow @mention</label>
      <div class="ml-auto flex gap-2">
        <button class="btn-ghost" onclick={() => (editing = null)}>Cancel</button>
        <button class="btn-primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  </Card>
{/if}

<States {loading} {error} empty={!loading && roles.length === 0} emptyText="No roles." emptyIcon="🎭">
  <Card padding="p-0" class="overflow-hidden">
    {#each roles as r (r.id)}
      <div class="group flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-2">
        <span class="h-4 w-4 shrink-0 rounded-full" style="background:{r.hexColor && r.hexColor !== '#000000' ? r.hexColor : 'var(--muted)'}"></span>
        <span class="text-sm font-medium" style={r.hexColor && r.hexColor !== '#000000' ? `color:${r.hexColor}` : ''}>
          {r.name}
        </span>
        {#if r.managed}<span class="pill bg-accent-3/20 text-accent-3 text-[9px]">managed</span>{/if}
        {#if r.hoist}<span class="pill bg-surface-2 text-[9px] text-muted">hoisted</span>{/if}
        {#if r.mentionable}<span class="pill bg-surface-2 text-[9px] text-muted">@mention</span>{/if}
        <span class="ml-auto text-xs text-muted">👤 {fmtNumber(r.memberCount)}</span>
        <div class="flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button class="btn-ghost h-7 px-2 text-xs" onclick={() => openEdit(r)}>Edit</button>
          {#if !r.managed}
            <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => del(r)}>Delete</button>
          {/if}
        </div>
      </div>
    {/each}
  </Card>
</States>
