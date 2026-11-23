<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';

  let channels = $state<any[]>([]);
  let channelId = $state('');
  let content = $state('');
  let embed = $state<any>({ title: '', description: '', color: '#8b5cf6', author: '', footer: '', image: '', thumbnail: '', fields: [] as any[] });
  let sending = $state(false);

  async function loadChannels(gid: string) {
    if (!gid) return;
    try {
      const res = await api.get<any>(`/api/admin/channels?guildId=${gid}`);
      channels = (res.groups ?? []).flatMap((g: any) => g.channels).filter((c: any) => c.type === 0 || c.type === 5);
      if (!channelId && channels[0]) channelId = channels[0].id;
    } catch { channels = []; }
  }
  $effect(() => { loadChannels($guildId); });

  function addField() { embed.fields = [...embed.fields, { name: '', value: '', inline: false }]; }
  function removeField(i: number) { embed.fields = embed.fields.filter((_: any, idx: number) => idx !== i); }

  async function send() {
    if (!channelId) { pushToast('Pick a channel', 'warn'); return; }
    sending = true;
    try {
      await api.post('/api/channel/send', { guildId: $guildId, channelId, content, embed });
      pushToast('Embed sent ✓', 'success');
    } catch (e) { pushToast((e as Error).message, 'error'); }
    finally { sending = false; }
  }
</script>

<svelte:head><title>Embed Builder · MaowCore</title></svelte:head>

<PageHeader title="Embed Builder" subtitle="Design a Discord embed and send it to a channel">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-2">
  <!-- Editor -->
  <Card>
    <div class="space-y-3">
      <div>
        <div class="mb-1 text-sm font-medium">Channel</div>
        <select class="input" bind:value={channelId}>{#each channels as c}<option value={c.id}>#{c.name}</option>{/each}</select>
      </div>
      <div><div class="mb-1 text-sm font-medium">Message (above embed, optional)</div><input class="input" bind:value={content} /></div>
      <hr class="border-border" />
      <div class="grid gap-2 sm:grid-cols-2">
        <div><div class="mb-1 text-xs font-medium text-muted">Title</div><input class="input" bind:value={embed.title} /></div>
        <div><div class="mb-1 text-xs font-medium text-muted">Color</div><div class="flex gap-1"><input type="color" class="h-9 w-12 rounded-btn border border-border" bind:value={embed.color} /><input class="input" bind:value={embed.color} /></div></div>
      </div>
      <div><div class="mb-1 text-xs font-medium text-muted">Description</div><textarea class="input min-h-24" bind:value={embed.description}></textarea></div>
      <div class="grid gap-2 sm:grid-cols-2">
        <div><div class="mb-1 text-xs font-medium text-muted">Author</div><input class="input" bind:value={embed.author} /></div>
        <div><div class="mb-1 text-xs font-medium text-muted">Footer</div><input class="input" bind:value={embed.footer} /></div>
        <div><div class="mb-1 text-xs font-medium text-muted">Image URL</div><input class="input" bind:value={embed.image} /></div>
        <div><div class="mb-1 text-xs font-medium text-muted">Thumbnail URL</div><input class="input" bind:value={embed.thumbnail} /></div>
      </div>
      <div>
        <div class="mb-1 flex items-center justify-between"><span class="text-xs font-medium text-muted">Fields</span><button class="btn-ghost h-7 px-2 text-xs" onclick={addField}>+ Field</button></div>
        <div class="space-y-2">
          {#each embed.fields as f, i}
            <div class="rounded-btn bg-surface-2 p-2">
              <div class="flex gap-2"><input class="input" placeholder="Name" bind:value={f.name} /><input class="input" placeholder="Value" bind:value={f.value} /><button class="text-muted hover:text-danger" onclick={() => removeField(i)}>✕</button></div>
              <label class="mt-1 flex items-center gap-2 text-xs text-muted"><input type="checkbox" bind:checked={f.inline} /> inline</label>
            </div>
          {/each}
        </div>
      </div>
      <button class="btn-primary w-full" onclick={send} disabled={sending}>{sending ? 'Sending…' : '📤 Send embed'}</button>
    </div>
  </Card>

  <!-- Live preview -->
  <div>
    <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Live preview</div>
    {#if content}<div class="mb-2 text-sm">{content}</div>{/if}
    <div class="overflow-hidden rounded border-l-4 bg-[#2b2d31] p-4 text-white" style="border-color:{embed.color}">
      {#if embed.author}<div class="mb-1 text-xs font-semibold">{embed.author}</div>{/if}
      <div class="flex gap-3">
        <div class="min-w-0 flex-1">
          {#if embed.title}<div class="font-semibold text-[#00a8fc]">{embed.title}</div>{/if}
          {#if embed.description}<div class="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">{embed.description}</div>{/if}
          {#if embed.fields.length}
            <div class="mt-2 grid grid-cols-2 gap-2">
              {#each embed.fields as f}{#if f.name || f.value}<div class="{f.inline ? '' : 'col-span-2'}"><div class="text-xs font-semibold">{f.name}</div><div class="text-xs text-[#dbdee1]">{f.value}</div></div>{/if}{/each}
            </div>
          {/if}
        </div>
        {#if embed.thumbnail}<img src={embed.thumbnail} alt="" class="h-16 w-16 shrink-0 rounded object-cover" />{/if}
      </div>
      {#if embed.image}<img src={embed.image} alt="" class="mt-3 max-h-48 rounded object-cover" />{/if}
      {#if embed.footer}<div class="mt-2 text-xs text-[#a3a6aa]">{embed.footer}</div>{/if}
    </div>
  </div>
</div>
