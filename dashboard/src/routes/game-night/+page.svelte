<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  let loading = $state(true);
  let error = $state('');
  let sessions = $state<any[]>([]);

  async function load(gid: string) {
    loading = true;
    error = '';
    try {
      const res = await api.get<any>(`/api/game/sessions${gid ? `?guildId=${gid}` : ''}`);
      sessions = res.sessions ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load($guildId);
  });
</script>

<svelte:head><title>Game Night · MaowCore</title></svelte:head>

<PageHeader title="Game Night" subtitle="Active quiz & name-that-tune sessions">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<States {loading} {error} empty={!loading && sessions.length === 0} emptyText="No active game sessions. Start one with /quiz in Discord." emptyIcon="🎮">
  <div class="grid gap-4 sm:grid-cols-2">
    {#each sessions as s}
      <Card>
        <div class="flex items-center justify-between">
          <span class="pill bg-accent/20 text-accent capitalize">{s.type ?? 'game'}</span>
          <span class="text-xs text-muted">{s.channelName ?? s.channelId ?? ''}</span>
        </div>
        <div class="mt-2 font-display text-lg font-bold">
          {s.question ?? s.title ?? 'In progress…'}
        </div>
        {#if s.scores}
          <div class="mt-3 space-y-1">
            {#each Object.entries(s.scores) as [name, score]}
              <div class="flex justify-between text-sm">
                <span class="truncate">{name}</span><span class="font-bold text-accent">{score}</span>
              </div>
            {/each}
          </div>
        {/if}
      </Card>
    {/each}
  </div>
</States>
