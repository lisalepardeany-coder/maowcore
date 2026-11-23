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
  let members = $state<any[]>([]);
  let total = $state(0);
  let page = $state(1);
  let perPage = $state(50);
  let search = $state('');
  let notice = $state('');

  function hex(color: number) {
    return color ? '#' + color.toString(16).padStart(6, '0') : 'var(--muted)';
  }

  async function load(gid: string) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      const res = await api.get<any>(
        `/api/admin/members?guildId=${gid}&page=${page}&perPage=${perPage}&search=${encodeURIComponent(search)}`,
      );
      members = res.members ?? [];
      total = res.total ?? 0;
      notice = res.cacheNotice ?? '';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function modAction(kind: 'kick' | 'ban', m: any) {
    const reason = prompt(`Reason for ${kind} of ${m.tag}?`) ?? '';
    if (reason === null) return;
    try {
      await api.post(`/api/mod/${kind}`, { guildId: $guildId, userId: m.id, reason });
      await load($guildId);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  $effect(() => {
    page;
    load($guildId);
  });

  let pages = $derived(Math.max(1, Math.ceil(total / perPage)));
</script>

<svelte:head><title>Members · MaowCore</title></svelte:head>

<PageHeader title="Members" subtitle={`${fmtNumber(total)} members`}>
  {#snippet actions()}
    <input
      class="input max-w-[180px]"
      placeholder="Search…"
      bind:value={search}
      onkeydown={(e) => e.key === 'Enter' && ((page = 1), load($guildId))}
    />
    <GuildPicker />
  {/snippet}
</PageHeader>

{#if notice}
  <div class="card mb-3 border-warn/30 p-3 text-xs text-warn">ℹ {notice}</div>
{/if}

<States {loading} {error} empty={!loading && members.length === 0} emptyText="No members found." emptyIcon="👥">
  <Card padding="p-0" class="overflow-hidden">
    {#each members as m (m.id)}
      <div class="group flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-2">
        <img src={m.avatar} alt="" class="h-9 w-9 rounded-full" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{m.displayName}</span>
            {#if m.bot}<span class="pill bg-accent-3/20 text-accent-3 text-[9px]">BOT</span>{/if}
            {#if m.voiceChannel}<span class="text-xs" title={m.voiceChannel.name}>🔊</span>{/if}
          </div>
          <div class="truncate text-[11px] text-muted">{m.tag} · {m.id}</div>
        </div>
        <div class="hidden gap-1 sm:flex">
          {#each m.roles ?? [] as r}
            <span class="pill text-[9px]" style="background:{hex(r.color)}22; color:{hex(r.color)}">{r.name}</span>
          {/each}
        </div>
        {#if !m.bot}
          <div class="flex gap-1 opacity-0 transition group-hover:opacity-100">
            <button class="btn-ghost h-7 px-2 text-xs" onclick={() => modAction('kick', m)}>Kick</button>
            <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => modAction('ban', m)}>Ban</button>
          </div>
        {/if}
      </div>
    {/each}
  </Card>

  {#if pages > 1}
    <div class="mt-3 flex items-center justify-center gap-2">
      <button class="btn-ghost h-8" disabled={page <= 1} onclick={() => page--}>‹ Prev</button>
      <span class="text-sm text-muted">Page {page} / {pages}</span>
      <button class="btn-ghost h-8" disabled={page >= pages} onclick={() => page++}>Next ›</button>
    </div>
  {/if}
</States>
