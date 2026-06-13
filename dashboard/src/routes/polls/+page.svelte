<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { me, rankAtLeast } from '$lib/stores/user';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  let loading = $state(true);
  let error = $state('');
  let polls = $state<any[]>([]);
  let showNew = $state(false);
  let draft = $state({ question: '', options: ['', ''] });
  let isAdmin = $derived(rankAtLeast($me.rank, 'admin'));

  async function load(gid: string) {
    if (!gid) return; loading = true; error = '';
    try { polls = (await api.get<any>(`/api/polls?guildId=${gid}`)).polls ?? []; }
    catch (e) { error = (e as Error).message; } finally { loading = false; }
  }
  $effect(() => { load($guildId); });

  async function create() {
    const options = draft.options.map((o) => o.trim()).filter(Boolean);
    if (!draft.question.trim() || options.length < 2) { pushToast('Question + 2 options needed', 'warn'); return; }
    try { await api.post('/api/polls/create', { guildId: $guildId, question: draft.question, options }); draft = { question: '', options: ['', ''] }; showNew = false; load($guildId); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }
  async function vote(id: string, idx: number) { try { await api.post('/api/polls/vote', { guildId: $guildId, id, optionIdx: idx }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function close(id: string) { try { await api.post('/api/polls/close', { guildId: $guildId, id }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function remove(id: string) { try { await api.post('/api/polls/remove', { guildId: $guildId, id }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }

  const totalVotes = (p: any) => p.options.reduce((a: number, o: any) => a + o.votes.length, 0);
</script>

<svelte:head><title>Polls · MaowCore</title></svelte:head>

<PageHeader title="Polls" subtitle="Create polls and watch live results">
  {#snippet actions()}{#if $me.loggedIn}<button class="btn-primary" onclick={() => (showNew = !showNew)}>{showNew ? '✕' : '+ New poll'}</button>{/if}<GuildPicker />{/snippet}
</PageHeader>

{#if showNew}
  <Card class="mb-6 animate-fade-up">
    <input class="input mb-2" placeholder="Poll question" bind:value={draft.question} />
    {#each draft.options as _, i}
      <div class="mb-2 flex gap-2"><input class="input" placeholder={`Option ${i + 1}`} bind:value={draft.options[i]} />{#if draft.options.length > 2}<button class="text-muted hover:text-danger" onclick={() => (draft.options = draft.options.filter((_, j) => j !== i))}>✕</button>{/if}</div>
    {/each}
    <div class="flex gap-2"><button class="btn-ghost" onclick={() => (draft.options = [...draft.options, ''])}>+ Option</button><button class="btn-primary ml-auto" onclick={create}>Create poll</button></div>
  </Card>
{/if}

<States {loading} {error} empty={!loading && polls.length === 0} emptyText="No polls yet." emptyIcon="🗳️">
  <div class="space-y-4">
    {#each polls as p (p.id)}
      {@const total = totalVotes(p)}
      <Card>
        <div class="mb-3 flex items-start justify-between">
          <div class="font-display text-lg font-bold">{p.question}</div>
          <div class="flex items-center gap-2">
            {#if p.closed}<span class="pill bg-surface-2 text-muted">closed</span>{/if}
            {#if isAdmin}{#if !p.closed}<button class="btn-ghost h-7 px-2 text-xs" onclick={() => close(p.id)}>Close</button>{/if}<button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => remove(p.id)}>✕</button>{/if}
          </div>
        </div>
        <div class="space-y-2">
          {#each p.options as o, i}
            {@const pct = total ? Math.round((o.votes.length / total) * 100) : 0}
            <button class="relative block w-full overflow-hidden rounded-btn border border-border p-2 text-left disabled:opacity-100" disabled={p.closed} onclick={() => vote(p.id, i)}>
              <div class="absolute inset-y-0 left-0 rounded-btn opacity-25 transition-all" style="width:{pct}%; background:var(--accent)"></div>
              <div class="relative flex items-center justify-between text-sm"><span>{o.votes.includes($me.userId) ? '✓ ' : ''}{o.text}</span><span class="tabular-nums text-muted">{pct}% · {o.votes.length}</span></div>
            </button>
          {/each}
        </div>
        <div class="mt-2 text-[11px] text-muted">{total} vote{total === 1 ? '' : 's'}</div>
      </Card>
    {/each}
  </div>
</States>
