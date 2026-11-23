<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtRelative } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let logs = $state<any[]>([]);
  let filter = $state<'all' | 'delete' | 'edit'>('all');

  async function load(gid: string) {
    if (!gid) return; loading = true; error = '';
    try { logs = (await api.get<any>(`/api/message-logs?guildId=${gid}`)).logs ?? []; }
    catch (e) { error = (e as Error).message; } finally { loading = false; }
  }
  $effect(() => { load($guildId); });
  onMount(() => { const t = setInterval(() => load($guildId), 10000); return () => clearInterval(t); });

  let shown = $derived(filter === 'all' ? logs : logs.filter((l) => l.type === filter));
</script>

<svelte:head><title>Message Logs · MaowCore</title></svelte:head>

<PageHeader title="Message Logs" subtitle="Edited & deleted messages (recent)">
  {#snippet actions()}
    <div class="flex gap-1 rounded-btn bg-surface-2 p-0.5">{#each ['all', 'delete', 'edit'] as f}<button class="rounded-[8px] px-2 py-0.5 text-xs font-semibold capitalize" class:bg-accent={filter === f} class:text-on-accent={filter === f} class:text-muted={filter !== f} onclick={() => (filter = f as any)}>{f}</button>{/each}</div>
    <button class="btn-ghost" onclick={() => load($guildId)}>↻</button>
    <GuildPicker />
  {/snippet}
</PageHeader>

<States {loading} {error} empty={!loading && shown.length === 0} emptyText="No message events captured yet. Edits/deletes will appear here." emptyIcon="📜">
  <div class="space-y-2">
    {#each shown as l (l.ts + l.authorId)}
      <Card>
        <div class="flex items-start gap-3">
          <span class="text-lg">{l.type === 'delete' ? '🗑️' : '✏️'}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-xs text-muted">
              <span class="font-medium text-text">{l.authorTag ?? l.authorId ?? 'unknown'}</span>
              <span>· #{l.channelName ?? l.channelId}</span>
              <span>· {fmtRelative(l.ts)}</span>
              <span class="pill {l.type === 'delete' ? 'bg-danger/20 text-danger' : 'bg-warn/20 text-warn'} text-[9px]">{l.type}</span>
            </div>
            {#if l.type === 'edit'}
              <div class="mt-1 text-sm"><span class="text-muted line-through">{l.content || '(empty)'}</span></div>
              <div class="text-sm">→ {l.newContent || '(empty)'}</div>
            {:else}
              <div class="mt-1 break-words text-sm">{l.content || '(content not cached)'}</div>
            {/if}
          </div>
        </div>
      </Card>
    {/each}
  </div>
  <p class="mt-3 text-[11px] text-muted">Only recently-active (cached) messages are captured, and logs reset on bot restart.</p>
</States>
