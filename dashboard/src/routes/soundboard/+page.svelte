<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  let loading = $state(true);
  let error = $state('');
  let sounds = $state<any[]>([]);
  let search = $state('');

  async function load() {
    loading = true; error = '';
    try { sounds = (await api.get<any>('/api/sounds')).sounds ?? []; }
    catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }
  onMount(load);

  async function play(file: string, name: string) {
    try { await api.post('/api/sound/play', { guildId: $guildId, file }); pushToast(`▶ ${name}`, 'success'); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }

  const EMOJIS = ['🔊', '🎵', '🎉', '😂', '💥', '✨', '🎺', '🐱', '👏', '🔔', '⚡', '🎯'];
  let filtered = $derived(search ? sounds.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : sounds);
</script>

<svelte:head><title>Soundboard · MaowCore</title></svelte:head>

<PageHeader title="Soundboard" subtitle="Click to play a clip to voice">
  {#snippet actions()}<input class="input max-w-[180px]" placeholder="Search…" bind:value={search} /><button class="btn-ghost" onclick={load}>↻</button>{/snippet}
</PageHeader>

<States {loading} {error} empty={!loading && sounds.length === 0} emptyText="No sounds yet — drop .mp3/.wav/.ogg files in data/sounds/ on the bot host." emptyIcon="🔉">
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
    {#each filtered as s, i (s.file)}
      <button
        class="card flex flex-col items-center gap-2 p-5 text-center transition hover:-translate-y-1 active:scale-95"
        onclick={() => play(s.file, s.name)}
      >
        <span class="text-3xl">{EMOJIS[i % EMOJIS.length]}</span>
        <span class="truncate text-sm font-semibold">{s.name}</span>
      </button>
    {/each}
  </div>
  <p class="mt-4 text-xs text-muted">The bot must already be in a voice channel (use /play or /sb once to connect).</p>
</States>
