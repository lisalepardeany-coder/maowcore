<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  let loading = $state(true);
  let error = $state('');
  let groups = $state<any[]>([]);

  // Discord channel type → glyph
  const TYPE_ICON: Record<number, string> = { 0: '#', 2: '🔊', 5: '📢', 13: '🎤', 15: '🗂️', 4: '🗂️' };

  async function load(gid: string) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      const res = await api.get<any>(`/api/admin/channels?guildId=${gid}`);
      groups = res.groups ?? [];
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

<svelte:head><title>Channels · MaowCore</title></svelte:head>

<PageHeader title="Channels" subtitle="Server channels grouped by category">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<States {loading} {error} empty={!loading && groups.length === 0} emptyText="No channels." emptyIcon="#️⃣">
  <div class="space-y-4">
    {#each groups as group}
      <Card padding="p-0" class="overflow-hidden">
        <div class="border-b border-border bg-surface-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted">
          {group.name}
        </div>
        {#each group.channels as ch (ch.id)}
          <div class="flex items-center gap-3 border-b border-border px-4 py-2 last:border-0 hover:bg-surface-2">
            <span class="w-5 text-center text-muted">{TYPE_ICON[ch.type] ?? '#'}</span>
            <span class="text-sm font-medium">{ch.name}</span>
            {#if ch.nsfw}<span class="pill bg-danger/20 text-danger text-[9px]">NSFW</span>{/if}
            {#if ch.slowmode}<span class="pill bg-surface-2 text-[9px] text-muted">slow {ch.slowmode}s</span>{/if}
            {#if ch.topic}<span class="ml-2 hidden min-w-0 truncate text-xs text-muted md:block">{ch.topic}</span>{/if}
            {#if ch.memberCount != null}<span class="ml-auto text-xs text-muted">👤 {ch.memberCount}</span>{/if}
          </div>
        {/each}
      </Card>
    {/each}
  </div>
</States>
