<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtNumber, fmtRelative } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let users = $state<any[]>([]);
  let search = $state('');

  async function load(gid: string) {
    if (!gid) return;
    loading = true; error = '';
    try { users = (await api.get<any>(`/api/mod/warns?guildId=${gid}`)).users ?? []; }
    catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }
  $effect(() => { load($guildId); });

  async function clear(userId: string) {
    if (!confirm('Clear all warnings for this user?')) return;
    try { await api.post('/api/mod/warn-clear', { guildId: $guildId, userId }); load($guildId); }
    catch (e) { alert((e as Error).message); }
  }

  let filtered = $derived(search ? users.filter((u) => (u.tag ?? u.userId).toLowerCase().includes(search.toLowerCase())) : users);
  let totalWarns = $derived(users.reduce((a, u) => a + (u.count ?? 0), 0));
</script>

<svelte:head><title>Infractions · MaowCore</title></svelte:head>

<PageHeader title="Infractions" subtitle={`${fmtNumber(totalWarns)} warnings across ${users.length} members`}>
  {#snippet actions()}
    <input class="input max-w-[180px]" placeholder="Search…" bind:value={search} />
    <GuildPicker />
  {/snippet}
</PageHeader>

<States {loading} {error} empty={!loading && users.length === 0} emptyText="No infractions — a well-behaved server. 🎉" emptyIcon="✅">
  <div class="space-y-2">
    {#each filtered as u (u.userId)}
      <Card>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{u.tag ?? u.userId}</span>
            <span class="pill bg-warn/20 text-warn">{u.count} warning{u.count === 1 ? '' : 's'}</span>
          </div>
          <button class="btn-ghost h-7 px-2 text-xs" onclick={() => clear(u.userId)}>Clear all</button>
        </div>
        <ul class="mt-2 space-y-1">
          {#each u.entries ?? [] as e}
            <li class="flex items-start gap-2 rounded-btn bg-surface-2 px-3 py-1.5 text-xs">
              <span class="text-warn">⚠</span>
              <span class="min-w-0 flex-1">{e.reason ?? e}</span>
              {#if e.at}<span class="shrink-0 text-muted">{fmtRelative(e.at)}</span>{/if}
              {#if e.by}<span class="shrink-0 text-muted">by {e.by}</span>{/if}
            </li>
          {/each}
        </ul>
      </Card>
    {/each}
  </div>
</States>
