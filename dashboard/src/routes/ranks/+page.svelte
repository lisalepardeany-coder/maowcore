<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { me } from '$lib/stores/user';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtRelative } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let users = $state<any[]>([]);
  let ladder = $state<string[]>(['banned', 'member', 'moderator', 'admin', 'owner']);
  let grantForm = $state({ targetId: '', rank: 'member', notes: '' });

  const RANK_COLOR: Record<string, string> = {
    owner: 'text-warn', admin: 'text-danger', moderator: 'text-accent-2', member: 'text-muted', banned: 'text-danger',
  };

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await api.get<any>('/api/roles/list');
      users = res.users ?? [];
      if (res.ladder) ladder = res.ladder;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function grant() {
    if (!grantForm.targetId.trim()) return;
    try {
      await api.post('/api/roles/grant', grantForm);
      grantForm = { targetId: '', rank: 'member', notes: '' };
      await load();
    } catch (e) { error = (e as Error).message; }
  }

  // Group users by rank for display
  let grouped = $derived.by(() => {
    const g: Record<string, any[]> = {};
    for (const u of users) (g[u.rank] ??= []).push(u);
    return [...ladder].reverse().map((r) => ({ rank: r, users: g[r] ?? [] }));
  });

  onMount(load);
</script>

<svelte:head><title>Ranks · MaowCore</title></svelte:head>

<PageHeader title="Dashboard Ranks" subtitle="Role-based access control for the dashboard" />

<Card class="mb-4">
  <div class="mb-3 font-display text-base font-bold">Grant rank</div>
  <div class="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
    <input class="input" placeholder="Discord user ID" bind:value={grantForm.targetId} />
    <select class="input" bind:value={grantForm.rank}>
      {#each ladder as r}<option value={r}>{r}</option>{/each}
    </select>
    <input class="input" placeholder="Notes (optional)" bind:value={grantForm.notes} />
    <button class="btn-primary" onclick={grant}>Grant</button>
  </div>
</Card>

<States {loading} {error} empty={!loading && users.length === 0} emptyText="No registered users yet." emptyIcon="⭐">
  <div class="space-y-4">
    {#each grouped as group}
      {#if group.users.length}
        <div>
          <div class="mb-1 px-1 text-xs font-bold uppercase tracking-widest {RANK_COLOR[group.rank] ?? 'text-muted'}">
            {group.rank} · {group.users.length}
          </div>
          <Card padding="p-0" class="overflow-hidden">
            {#each group.users as u (u.userId ?? u.user_id)}
              <div
                class="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-2"
                class:bg-surface-2={(u.userId ?? u.user_id) === $me.userId}
              >
                {#if u.avatar}<img src={u.avatar} alt="" class="h-8 w-8 rounded-full" />{/if}
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">
                    {u.tag ?? u.username ?? u.userId ?? u.user_id}
                    {#if (u.userId ?? u.user_id) === $me.userId}<span class="pill ml-1 bg-accent/20 text-accent text-[9px]">you</span>{/if}
                  </div>
                  <div class="truncate text-[11px] text-muted">
                    {u.userId ?? u.user_id}
                    {#if u.grantedBy ?? u.granted_by}· by {u.grantedBy ?? u.granted_by}{/if}
                    {#if u.grantedAt ?? u.granted_at}· {fmtRelative(u.grantedAt ?? u.granted_at)}{/if}
                  </div>
                </div>
                {#if u.notes}<span class="hidden text-[11px] text-muted sm:block">“{u.notes}”</span>{/if}
              </div>
            {/each}
          </Card>
        </div>
      {/if}
    {/each}
  </div>
</States>
