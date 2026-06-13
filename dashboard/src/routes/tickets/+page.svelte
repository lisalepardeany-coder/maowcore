<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { me, rankAtLeast } from '$lib/stores/user';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtRelative } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let items = $state<any[]>([]);
  let subject = $state('');
  let filter = $state<'all' | 'open' | 'closed'>('all');
  let isStaff = $derived(rankAtLeast($me.rank, 'moderator'));

  const STATUS: Record<string, string> = { open: 'bg-accent/20 text-accent', claimed: 'bg-warn/20 text-warn', closed: 'bg-surface-2 text-muted' };

  async function load(gid: string) {
    if (!gid) return; loading = true; error = '';
    try { items = (await api.get<any>(`/api/tickets?guildId=${gid}`)).tickets ?? []; }
    catch (e) { error = (e as Error).message; } finally { loading = false; }
  }
  $effect(() => { load($guildId); });

  async function open() { if (!subject.trim()) return; try { await api.post('/api/tickets/open', { guildId: $guildId, subject }); subject = ''; load($guildId); pushToast('Ticket opened', 'success'); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function act(path: string, id: string) { try { await api.post(`/api/tickets/${path}`, { guildId: $guildId, id }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }

  let shown = $derived(filter === 'all' ? items : items.filter((t) => filter === 'closed' ? t.status === 'closed' : t.status !== 'closed'));
</script>

<svelte:head><title>Tickets · MaowCore</title></svelte:head>

<PageHeader title="Tickets" subtitle="Support tickets">
  {#snippet actions()}
    <div class="flex gap-1 rounded-btn bg-surface-2 p-0.5">{#each ['all', 'open', 'closed'] as f}<button class="rounded-[8px] px-2 py-0.5 text-xs font-semibold capitalize" class:bg-accent={filter === f} class:text-on-accent={filter === f} class:text-muted={filter !== f} onclick={() => (filter = f as any)}>{f}</button>{/each}</div>
    <GuildPicker />
  {/snippet}
</PageHeader>

{#if $me.loggedIn}
  <Card class="mb-6"><div class="flex gap-2"><input class="input" placeholder="Open a ticket — describe your issue…" bind:value={subject} onkeydown={(e) => e.key === 'Enter' && open()} /><button class="btn-primary" onclick={open}>Open ticket</button></div></Card>
{/if}

<States {loading} {error} empty={!loading && shown.length === 0} emptyText="No tickets." emptyIcon="🎫">
  <div class="space-y-2">
    {#each shown as t (t.id)}
      <Card>
        <div class="flex items-center gap-3">
          <span class="pill {STATUS[t.status]} capitalize">{t.status}</span>
          <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium">{t.subject}</div><div class="text-[11px] text-muted">by {t.openedTag ?? t.openedBy} · {fmtRelative(t.createdAt)}{t.claimedBy ? ` · claimed by ${t.claimedBy}` : ''}</div></div>
          {#if isStaff}
            <div class="flex gap-1">
              {#if t.status !== 'closed'}{#if t.status !== 'claimed'}<button class="btn-ghost h-7 px-2 text-xs" onclick={() => act('claim', t.id)}>Claim</button>{/if}<button class="btn-ghost h-7 px-2 text-xs" onclick={() => act('close', t.id)}>Close</button>{/if}
              <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => act('remove', t.id)}>✕</button>
            </div>
          {/if}
        </div>
      </Card>
    {/each}
  </div>
</States>
