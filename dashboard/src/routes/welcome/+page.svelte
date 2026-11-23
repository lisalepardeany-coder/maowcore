<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';

  let loading = $state(true);
  let error = $state('');
  let saved = $state(false);
  let channels = $state<any[]>([]);
  let form = $state({
    welcomeChannelId: '',
    welcomeMessage: '',
    farewellMessage: '',
    welcomeSoundUrl: '',
    leaveSoundUrl: '',
  });

  async function load(gid: string) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      const res = await api.get<any>(`/api/admin/welcome?guildId=${gid}`);
      channels = res.channels ?? [];
      form = {
        welcomeChannelId: res.welcomeChannelId ?? '',
        welcomeMessage: res.welcomeMessage ?? '',
        farewellMessage: res.farewellMessage ?? '',
        welcomeSoundUrl: res.welcomeSoundUrl ?? '',
        leaveSoundUrl: res.leaveSoundUrl ?? '',
      };
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function save() {
    saved = false;
    try {
      await api.post('/api/admin/welcome', { guildId: $guildId, ...form });
      saved = true;
      setTimeout(() => (saved = false), 2000);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  $effect(() => {
    load($guildId);
  });
</script>

<svelte:head><title>Welcome · MaowCore</title></svelte:head>

<PageHeader title="Welcome & Farewell" subtitle="Greet new members — use {'{user}'} and {'{server}'} tokens">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<States {loading} {error}>
  <div class="grid gap-6 lg:grid-cols-2">
    <Card>
      <div class="mb-3 font-display text-lg font-bold">✨ Welcome</div>
      <label class="mb-1 block text-xs font-semibold text-muted">Channel</label>
      <select class="input mb-3" bind:value={form.welcomeChannelId}>
        <option value="">— none —</option>
        {#each channels as c}<option value={c.id}>#{c.name}</option>{/each}
      </select>
      <label class="mb-1 block text-xs font-semibold text-muted">Welcome message</label>
      <textarea class="input mb-3 min-h-24" placeholder="Welcome {'{user}'} to {'{server}'}!" bind:value={form.welcomeMessage}></textarea>
      <label class="mb-1 block text-xs font-semibold text-muted">Join sound URL</label>
      <input class="input" placeholder="https://…" bind:value={form.welcomeSoundUrl} />
    </Card>

    <Card>
      <div class="mb-3 font-display text-lg font-bold">👋 Farewell</div>
      <label class="mb-1 block text-xs font-semibold text-muted">Farewell message</label>
      <textarea class="input mb-3 min-h-24" placeholder="{'{user}'} just left {'{server}'}." bind:value={form.farewellMessage}></textarea>
      <label class="mb-1 block text-xs font-semibold text-muted">Leave sound URL</label>
      <input class="input" placeholder="https://…" bind:value={form.leaveSoundUrl} />

      <div class="mt-6 rounded-card border border-border bg-bg-soft p-4">
        <div class="text-xs font-semibold text-muted">Live preview</div>
        <div class="mt-2 text-sm">
          {(form.welcomeMessage || 'Welcome {user} to {server}!')
            .replaceAll('{user}', '@NewMember')
            .replaceAll('{server}', 'Your Server')}
        </div>
      </div>
    </Card>
  </div>

  <div class="mt-4 flex items-center gap-3">
    <button class="btn-primary" onclick={save}>Save changes</button>
    {#if saved}<span class="text-sm text-success">✓ Saved</span>{/if}
    <button class="btn-ghost" onclick={() => load($guildId)}>Revert</button>
  </div>
</States>
