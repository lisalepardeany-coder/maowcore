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
  let text = $state('');
  let isAdmin = $derived(rankAtLeast($me.rank, 'admin'));

  const STATUS_COLOR: Record<string, string> = { open: 'text-muted', approved: 'text-success', denied: 'text-danger', implemented: 'text-accent' };

  async function load(gid: string) {
    if (!gid) return; loading = true; error = '';
    try { items = (await api.get<any>(`/api/suggestions?guildId=${gid}`)).suggestions ?? []; }
    catch (e) { error = (e as Error).message; } finally { loading = false; }
  }
  $effect(() => { load($guildId); });

  async function add() { if (!text.trim()) return; try { await api.post('/api/suggestions/add', { guildId: $guildId, text }); text = ''; load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function vote(id: string, dir: string) { try { await api.post('/api/suggestions/vote', { guildId: $guildId, id, dir }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function setStatus(id: string, status: string) { try { await api.post('/api/suggestions/status', { guildId: $guildId, id, status }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function remove(id: string) { try { await api.post('/api/suggestions/remove', { guildId: $guildId, id }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }
</script>

<svelte:head><title>Suggestions · MaowCore</title></svelte:head>

<PageHeader title="Suggestions" subtitle="Community ideas — vote and review">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

{#if $me.loggedIn}
  <Card class="mb-6"><div class="flex gap-2"><input class="input" placeholder="Suggest something…" bind:value={text} onkeydown={(e) => e.key === 'Enter' && add()} /><button class="btn-primary" onclick={add}>Suggest</button></div></Card>
{/if}

<States {loading} {error} empty={!loading && items.length === 0} emptyText="No suggestions yet." emptyIcon="💡">
  <div class="space-y-2">
    {#each items as s (s.id)}
      <Card>
        <div class="flex items-start gap-3">
          <div class="flex flex-col items-center gap-1">
            <button class="text-lg hover:text-success {s.up?.includes($me.userId) ? 'text-success' : 'text-muted'}" onclick={() => vote(s.id, 'up')}>▲</button>
            <span class="text-sm font-bold tabular-nums">{(s.up?.length ?? 0) - (s.down?.length ?? 0)}</span>
            <button class="text-lg hover:text-danger {s.down?.includes($me.userId) ? 'text-danger' : 'text-muted'}" onclick={() => vote(s.id, 'down')}>▼</button>
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm">{s.text}</div>
            <div class="mt-1 flex items-center gap-2 text-[11px] text-muted">
              <span class="capitalize {STATUS_COLOR[s.status]}">● {s.status}</span>
              <span>by {s.authorTag ?? 'anon'}</span><span>{fmtRelative(s.createdAt)}</span>
            </div>
          </div>
          {#if isAdmin}
            <div class="flex flex-col gap-1">
              <select class="input h-7 py-0 text-xs" value={s.status} onchange={(e) => setStatus(s.id, e.currentTarget.value)}><option value="open">Open</option><option value="approved">Approved</option><option value="denied">Denied</option><option value="implemented">Implemented</option></select>
              <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => remove(s.id)}>Delete</button>
            </div>
          {/if}
        </div>
      </Card>
    {/each}
  </div>
</States>
