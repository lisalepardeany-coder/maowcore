<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';

  let channels = $state<any[]>([]);
  let channelId = $state('');
  let title = $state('');
  let message = $state('');
  let mention = $state('none');
  let asEmbed = $state(true);
  let color = $state('#8b5cf6');
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

  const MENTIONS: Record<string, string> = { none: '', everyone: '@everyone', here: '@here' };

  async function send() {
    if (!channelId || !message.trim()) { pushToast('Channel + message required', 'warn'); return; }
    sending = true;
    try {
      const payload: any = { guildId: $guildId, channelId, mention: MENTIONS[mention] || '' };
      if (asEmbed) payload.embed = { title, description: message, color };
      else payload.content = (title ? `**${title}**\n` : '') + message;
      await api.post('/api/channel/send', payload);
      pushToast('Announcement sent 📣', 'success');
      message = '';
    } catch (e) { pushToast((e as Error).message, 'error'); }
    finally { sending = false; }
  }
</script>

<svelte:head><title>Announce · MaowCore</title></svelte:head>

<PageHeader title="Announcement Composer" subtitle="Broadcast a message to a channel">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<Card>
  <div class="space-y-3">
    <div class="grid gap-3 sm:grid-cols-2">
      <div><div class="mb-1 text-sm font-medium">Channel</div><select class="input" bind:value={channelId}>{#each channels as c}<option value={c.id}>#{c.name}</option>{/each}</select></div>
      <div><div class="mb-1 text-sm font-medium">Mention</div><select class="input" bind:value={mention}><option value="none">No mention</option><option value="here">@here</option><option value="everyone">@everyone</option></select></div>
    </div>
    <div><div class="mb-1 text-sm font-medium">Title (optional)</div><input class="input" bind:value={title} /></div>
    <div><div class="mb-1 text-sm font-medium">Message</div><textarea class="input min-h-32" placeholder="Write your announcement… (markdown supported)" bind:value={message}></textarea></div>
    <div class="flex flex-wrap items-center gap-4">
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={asEmbed} /> Send as embed</label>
      {#if asEmbed}<div class="flex items-center gap-2"><span class="text-sm text-muted">Color</span><input type="color" class="h-8 w-10 rounded-btn border border-border" bind:value={color} /></div>{/if}
      <button class="btn-primary ml-auto" onclick={send} disabled={sending}>{sending ? 'Sending…' : '📣 Send announcement'}</button>
    </div>
  </div>
</Card>

{#if message}
  <div class="mt-4">
    <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Preview</div>
    {#if asEmbed}
      <div class="rounded border-l-4 bg-[#2b2d31] p-4 text-white" style="border-color:{color}">
        {#if mention !== 'none'}<div class="mb-2 text-sm text-[#00a8fc]">{MENTIONS[mention]}</div>{/if}
        {#if title}<div class="font-semibold text-[#00a8fc]">{title}</div>{/if}
        <div class="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">{message}</div>
      </div>
    {:else}
      <div class="rounded bg-[#2b2d31] p-4 text-sm text-white"><span class="whitespace-pre-wrap">{(mention !== 'none' ? MENTIONS[mention] + ' ' : '') + (title ? `**${title}**\n` : '') + message}</span></div>
    {/if}
  </div>
{/if}
