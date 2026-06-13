<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';

  let building = $state(false);
  let error = $state('');
  let template = $state<any>(null);

  async function build() {
    if (!$guildId) return;
    building = true;
    error = '';
    template = null;
    try {
      const res = await api.get<any>(`/api/templates/build?guildId=${$guildId}`);
      template = res.template;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      building = false;
    }
  }

  function download() {
    if (!template) return;
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `maowcore-template-${$guildId}.json`;
    a.click();
  }
</script>

<svelte:head><title>Templates · MaowCore</title></svelte:head>

<PageHeader title="Server Template" subtitle="Export your server config as a portable bundle">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<Card>
  <p class="text-sm text-muted">
    Build a portable JSON snapshot of this server's welcome, automod, reaction-roles,
    quick-playlists, custom commands, shop items, and locale. Apply it to another server
    to clone the setup.
  </p>
  <div class="mt-4 flex gap-2">
    <button class="btn-primary" onclick={build} disabled={building}>
      {building ? 'Building…' : '🧩 Build template'}
    </button>
    {#if template}<button class="btn-ghost" onclick={download}>⬇ Download JSON</button>{/if}
  </div>

  {#if error}<div class="mt-4 text-sm text-danger">⚠ {error}</div>{/if}

  {#if template}
    <pre class="mt-4 max-h-[420px] overflow-auto rounded-card bg-bg-soft p-4 text-xs text-muted">{JSON.stringify(template, null, 2)}</pre>
  {/if}
</Card>
