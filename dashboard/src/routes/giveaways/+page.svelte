<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { me, rankAtLeast } from '$lib/stores/user';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtRelative, fmtNumber } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let items = $state<any[]>([]);
  let showNew = $state(false);
  let draft = $state({ prize: '', winners: 1, when: '' });
  let isAdmin = $derived(rankAtLeast($me.rank, 'admin'));

  async function load(gid: string) {
    if (!gid) return; loading = true; error = '';
    try { items = (await api.get<any>(`/api/giveaways?guildId=${gid}`)).giveaways ?? []; }
    catch (e) { error = (e as Error).message; } finally { loading = false; }
  }
  $effect(() => { load($guildId); });

  async function create() {
    if (!draft.prize.trim() || !draft.when) { pushToast('Prize + end time needed', 'warn'); return; }
    try { await api.post('/api/giveaways/create', { guildId: $guildId, prize: draft.prize, winners: draft.winners, endsAt: Date.parse(draft.when) }); draft = { prize: '', winners: 1, when: '' }; showNew = false; load($guildId); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }
  async function enter(id: string) { try { await api.post('/api/giveaways/enter', { guildId: $guildId, id }); load($guildId); pushToast('Entered! 🎉', 'success'); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function draw(id: string) { try { const r = await api.post<any>('/api/giveaways/draw', { guildId: $guildId, id }); load($guildId); pushToast(`Winners drawn: ${r.giveaway?.winnersList?.length ?? 0}`, 'success'); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function remove(id: string) { try { await api.post('/api/giveaways/remove', { guildId: $guildId, id }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }
</script>

<svelte:head><title>Giveaways · MaowCore</title></svelte:head>

<PageHeader title="Giveaways" subtitle="Run giveaways and draw winners">
  {#snippet actions()}{#if isAdmin}<button class="btn-primary" onclick={() => (showNew = !showNew)}>{showNew ? '✕' : '+ New giveaway'}</button>{/if}<GuildPicker />{/snippet}
</PageHeader>

{#if showNew}
  <Card class="mb-6 animate-fade-up">
    <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
      <input class="input" placeholder="Prize" bind:value={draft.prize} />
      <input type="number" min="1" class="input w-24" placeholder="Winners" bind:value={draft.winners} />
      <input type="datetime-local" class="input" bind:value={draft.when} />
      <button class="btn-primary" onclick={create}>Create</button>
    </div>
  </Card>
{/if}

<States {loading} {error} empty={!loading && items.length === 0} emptyText="No giveaways." emptyIcon="🎉">
  <div class="grid gap-4 sm:grid-cols-2">
    {#each items as g (g.id)}
      <Card class="group">
        <div class="flex items-start justify-between">
          <div class="grid h-12 w-12 place-items-center rounded-card text-2xl" style="background-image:linear-gradient(135deg, var(--accent), var(--accent-3))">🎁</div>
          {#if isAdmin}<button class="text-muted opacity-0 transition hover:text-danger group-hover:opacity-100" onclick={() => remove(g.id)}>🗑️</button>{/if}
        </div>
        <div class="mt-3 font-display text-lg font-bold">{g.prize}</div>
        <div class="text-xs text-muted">{g.winners} winner{g.winners === 1 ? '' : 's'} · {fmtNumber(g.entries.length)} entries · {g.ended ? 'ended' : `ends ${fmtRelative(g.endsAt)}`}</div>
        {#if g.ended && g.winnersList.length}
          <div class="mt-2 rounded-btn bg-success/10 p-2 text-xs text-success">🏆 Winners: {g.winnersList.map((w: string) => `<@${w}>`).join(', ')}</div>
        {/if}
        <div class="mt-3 flex gap-2">
          {#if !g.ended}
            <button class="btn-primary h-8 flex-1 text-xs {g.entries.includes($me.userId) ? 'opacity-60' : ''}" onclick={() => enter(g.id)}>{g.entries.includes($me.userId) ? '✓ Entered' : '🎉 Enter'}</button>
            {#if isAdmin}<button class="btn-ghost h-8 px-3 text-xs" onclick={() => draw(g.id)}>Draw now</button>{/if}
          {:else}
            <span class="pill bg-surface-2 text-muted">Ended</span>
          {/if}
        </div>
      </Card>
    {/each}
  </div>
</States>
