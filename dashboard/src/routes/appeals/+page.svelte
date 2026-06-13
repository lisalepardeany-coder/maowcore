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
  let form = $state({ type: 'ban', reason: '' });
  let isStaff = $derived(rankAtLeast($me.rank, 'moderator'));

  const STATUS: Record<string, string> = { pending: 'bg-warn/20 text-warn', approved: 'bg-success/20 text-success', denied: 'bg-danger/20 text-danger' };

  async function load(gid: string) {
    if (!gid) return; loading = true; error = '';
    try { items = (await api.get<any>(`/api/appeals?guildId=${gid}`)).appeals ?? []; }
    catch (e) { error = (e as Error).message; } finally { loading = false; }
  }
  $effect(() => { load($guildId); });

  async function submit() { if (!form.reason.trim()) return; try { await api.post('/api/appeals/submit', { guildId: $guildId, ...form }); form = { type: 'ban', reason: '' }; load($guildId); pushToast('Appeal submitted', 'success'); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function resolve(id: string, status: string) { try { await api.post('/api/appeals/resolve', { guildId: $guildId, id, status }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }
  async function remove(id: string) { try { await api.post('/api/appeals/remove', { guildId: $guildId, id }); load($guildId); } catch (e) { pushToast((e as Error).message, 'error'); } }
</script>

<svelte:head><title>Appeals · MaowCore</title></svelte:head>

<PageHeader title="Appeals" subtitle="Ban / mute appeal review">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

{#if $me.loggedIn}
  <Card class="mb-6">
    <div class="mb-2 font-display font-bold">Submit an appeal</div>
    <div class="flex gap-2">
      <select class="input max-w-[140px]" bind:value={form.type}><option value="ban">Ban</option><option value="mute">Mute</option><option value="timeout">Timeout</option><option value="kick">Kick</option><option value="other">Other</option></select>
      <input class="input" placeholder="Why should this be reversed?" bind:value={form.reason} onkeydown={(e) => e.key === 'Enter' && submit()} />
      <button class="btn-primary" onclick={submit}>Submit</button>
    </div>
  </Card>
{/if}

<States {loading} {error} empty={!loading && items.length === 0} emptyText="No appeals." emptyIcon="📬">
  <div class="space-y-2">
    {#each items as a (a.id)}
      <Card>
        <div class="flex items-start gap-3">
          <span class="pill {STATUS[a.status]} capitalize">{a.status}</span>
          <div class="min-w-0 flex-1">
            <div class="text-sm"><span class="font-medium capitalize">{a.type} appeal</span> · {a.reason}</div>
            <div class="mt-1 text-[11px] text-muted">by {a.userTag ?? a.userId} · {fmtRelative(a.createdAt)}{a.resolvedBy ? ` · resolved by ${a.resolvedBy}` : ''}</div>
          </div>
          {#if isStaff && a.status === 'pending'}
            <div class="flex gap-1"><button class="btn-ghost h-7 px-2 text-xs text-success" onclick={() => resolve(a.id, 'approved')}>Approve</button><button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => resolve(a.id, 'denied')}>Deny</button></div>
          {:else if isStaff}
            <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => remove(a.id)}>✕</button>
          {/if}
        </div>
      </Card>
    {/each}
  </div>
</States>
