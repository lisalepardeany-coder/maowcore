<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  let loading = $state(true);
  let error = $state('');
  let entries = $state<any[]>([]);
  let roles = $state<any[]>([]);
  let channels = $state<any[]>([]);
  let form = $state({ channelId: '', roleId: '', emoji: '', title: '' });

  async function load(gid: string) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      const res = await api.get<any>(`/api/admin/reaction-roles?guildId=${gid}`);
      entries = res.entries ?? [];
      roles = res.roles ?? [];
      channels = res.channels ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function create() {
    if (!form.channelId || !form.roleId || !form.emoji) return;
    try {
      await api.post('/api/admin/reaction-roles/create', { guildId: $guildId, ...form });
      form = { channelId: '', roleId: '', emoji: '', title: '' };
      await load($guildId);
    } catch (e) { error = (e as Error).message; }
  }

  async function remove(messageId: string) {
    if (!confirm('Remove this reaction role?')) return;
    try {
      await api.post('/api/admin/reaction-roles/delete', { guildId: $guildId, messageId });
      await load($guildId);
    } catch (e) { error = (e as Error).message; }
  }

  $effect(() => {
    load($guildId);
  });
</script>

<svelte:head><title>Reaction Roles · MaowCore</title></svelte:head>

<PageHeader title="Reaction Roles" subtitle="React to a message → get a role">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<Card class="mb-4">
  <div class="mb-3 font-display text-base font-bold">+ Create</div>
  <div class="grid gap-2 sm:grid-cols-4">
    <select class="input" bind:value={form.channelId}>
      <option value="">Channel…</option>
      {#each channels as c}<option value={c.id}>#{c.name}</option>{/each}
    </select>
    <select class="input" bind:value={form.roleId}>
      <option value="">Role…</option>
      {#each roles as r}<option value={r.id}>{r.name}</option>{/each}
    </select>
    <input class="input" placeholder="Emoji (✅)" bind:value={form.emoji} />
    <input class="input" placeholder="Title" bind:value={form.title} />
  </div>
  <button class="btn-primary mt-3" onclick={create}>Create reaction role</button>
</Card>

<States {loading} {error} empty={!loading && entries.length === 0} emptyText="No reaction roles set up." emptyIcon="❉">
  <Card padding="p-0" class="overflow-hidden">
    {#each entries as e (e.messageId)}
      <div class="group flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-2">
        <span class="text-lg">{e.emoji}</span>
        <span class="text-sm font-medium" style={e.roleColor ? `color:${e.roleColor}` : ''}>
          {e.roleName ?? e.roleId ?? '(role)'}
        </span>
        {#if e.stale}<span class="pill bg-danger/20 text-danger text-[9px]">stale</span>{/if}
        <span class="ml-auto text-[11px] text-muted">msg {e.messageId}</span>
        <button class="text-muted opacity-0 transition hover:text-danger group-hover:opacity-100" onclick={() => remove(e.messageId)}>✕</button>
      </div>
    {/each}
  </Card>
</States>
