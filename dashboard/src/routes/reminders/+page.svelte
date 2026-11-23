<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtRelative } from '$lib/format';

  let loading = $state(true);
  let error = $state('');
  let reminders = $state<any[]>([]);
  let channels = $state<any[]>([]);
  let form = $state({ text: '', when: '', channelId: '' });

  async function load() {
    loading = true; error = '';
    try {
      reminders = (await api.get<any>('/api/reminders')).reminders ?? [];
      const res = await api.get<any>(`/api/admin/channels?guildId=${$guildId}`).catch(() => ({ groups: [] }));
      channels = (res.groups ?? []).flatMap((g: any) => g.channels).filter((c: any) => c.type === 0);
      if (!form.channelId && channels[0]) form.channelId = channels[0].id;
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }
  onMount(load);

  async function add() {
    if (!form.text.trim() || !form.when) { pushToast('Text + time required', 'warn'); return; }
    const fireAt = Date.parse(form.when);
    if (fireAt < Date.now()) { pushToast('Pick a future time', 'warn'); return; }
    try {
      await api.post('/api/reminders/add', { text: form.text, fireAt, channelId: form.channelId, guildId: $guildId });
      form = { text: '', when: '', channelId: form.channelId };
      load();
      pushToast('Reminder set', 'success');
    } catch (e) { pushToast((e as Error).message, 'error'); }
  }
  async function remove(id: string) {
    try { await api.post('/api/reminders/remove', { id }); load(); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }

  let sorted = $derived([...reminders].sort((a, b) => a.fireAt - b.fireAt));
</script>

<svelte:head><title>Reminders · MaowCore</title></svelte:head>

<PageHeader title="Reminders" subtitle="Schedule reminders to fire in a channel">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<Card class="mb-6">
  <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
    <input class="input" placeholder="Remind us to…" bind:value={form.text} />
    <input type="datetime-local" class="input" bind:value={form.when} />
    <select class="input" bind:value={form.channelId}>{#each channels as c}<option value={c.id}>#{c.name}</option>{/each}</select>
    <button class="btn-primary" onclick={add}>Set</button>
  </div>
</Card>

<States {loading} {error} empty={!loading && reminders.length === 0} emptyText="No reminders scheduled." emptyIcon="⏰">
  <div class="space-y-2">
    {#each sorted as r (r.id)}
      <Card class="group flex items-center gap-3">
        <span class="text-lg">⏰</span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{r.text}</div>
          <div class="text-[11px] text-muted">fires {fmtRelative(r.fireAt)} · {new Date(r.fireAt).toLocaleString()}</div>
        </div>
        <button class="text-muted opacity-0 transition hover:text-danger group-hover:opacity-100" onclick={() => remove(r.id)}>✕</button>
      </Card>
    {/each}
  </div>
</States>
