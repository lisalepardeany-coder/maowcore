<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { me } from '$lib/stores/user';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtNumber } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let playlists = $state<any[]>([]);

  async function load(gid: string) {
    if (!gid || !$me.loggedIn) { loading = false; return; }
    loading = true; error = '';
    try { playlists = (await api.get<any>(`/api/playlists?guildId=${gid}`)).playlists ?? []; }
    catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }
  $effect(() => { load($guildId); });

  async function play(name: string) {
    try { const r = await api.post<any>('/api/playlists/play', { guildId: $guildId, name }); pushToast(`Queued ${r.queued} songs from "${name}"`, 'success'); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }
  async function del(name: string) {
    if (!confirm(`Delete playlist "${name}"?`)) return;
    try { await api.post('/api/playlists/delete', { guildId: $guildId, name }); load($guildId); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }
</script>

<svelte:head><title>Playlists · MaowCore</title></svelte:head>

<PageHeader title="Playlists" subtitle="Your saved playlists for this server">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

{#if !$me.loggedIn}
  <div class="card p-10 text-center text-muted">Sign in to see your playlists.</div>
{:else}
  <States {loading} {error} empty={!loading && playlists.length === 0} emptyText="No playlists yet — save one with /save in Discord." emptyIcon="📋">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each playlists as pl (pl.name)}
        <Card class="group">
          <div class="flex items-start justify-between">
            <div class="grid h-12 w-12 place-items-center rounded-card text-xl" style="background-image:linear-gradient(135deg, var(--accent), var(--accent-3))">📋</div>
            <button class="text-muted opacity-0 transition hover:text-danger group-hover:opacity-100" onclick={() => del(pl.name)}>🗑️</button>
          </div>
          <div class="mt-3 truncate font-display font-bold">{pl.name}</div>
          <div class="text-xs text-muted">{fmtNumber(pl.count ?? pl.songs?.length ?? pl.urls?.length ?? 0)} songs</div>
          <button class="btn-primary mt-3 h-8 w-full text-xs" onclick={() => play(pl.name)}>▶ Play all</button>
        </Card>
      {/each}
    </div>
  </States>
{/if}
