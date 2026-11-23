<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import States from '$lib/components/States.svelte';
  import { fmtRelative } from '$lib/format';

  type Tab = 'bans' | 'warns' | 'automod' | 'audit';
  let tab = $state<Tab>('bans');
  let loading = $state(true);
  let error = $state('');
  let bans = $state<any[]>([]);
  let warns = $state<any[]>([]);
  let automod = $state<any>(null);
  let audit = $state<any[]>([]);

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'bans', label: 'Bans', icon: '⊘' },
    { id: 'warns', label: 'Warns', icon: '⚠️' },
    { id: 'automod', label: 'Automod', icon: '🛡️' },
    { id: 'audit', label: 'Audit Log', icon: '📜' },
  ];

  async function load(gid: string, t: Tab) {
    if (!gid) return;
    loading = true;
    error = '';
    try {
      if (t === 'bans') bans = (await api.get<any>(`/api/mod/bans?guildId=${gid}`)).bans ?? [];
      else if (t === 'warns') warns = (await api.get<any>(`/api/mod/warns?guildId=${gid}`)).users ?? [];
      else if (t === 'automod') automod = (await api.get<any>(`/api/mod/automod?guildId=${gid}`)) ?? {};
      else if (t === 'audit') audit = (await api.get<any>(`/api/mod/audit?guildId=${gid}&limit=50`)).entries ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function unban(userId: string) {
    if (!confirm('Unban this user?')) return;
    try {
      await api.post('/api/mod/unban', { guildId: $guildId, userId });
      await load($guildId, 'bans');
    } catch (e) { alert((e as Error).message); }
  }

  async function clearWarns(userId: string) {
    if (!confirm('Clear all warnings for this user?')) return;
    try {
      await api.post('/api/mod/warn-clear', { guildId: $guildId, userId });
      await load($guildId, 'warns');
    } catch (e) { alert((e as Error).message); }
  }

  async function toggleAutomod(key: string, value: boolean) {
    try {
      await api.post('/api/mod/automod', { guildId: $guildId, ...automod, [key]: value });
      automod = { ...automod, [key]: value };
    } catch (e) { alert((e as Error).message); }
  }

  $effect(() => {
    load($guildId, tab);
  });

  const AUTOMOD_KEYS = [
    ['enabled', 'Master switch'],
    ['antiSpam', 'Anti-spam'],
    ['antiLinks', 'Anti-links'],
    ['antiInvites', 'Anti-invites'],
    ['antiCaps', 'Anti-caps'],
    ['antiMentions', 'Anti-mass-mention'],
  ];
</script>

<svelte:head><title>Moderation · MaowCore</title></svelte:head>

<PageHeader title="Moderation" subtitle="Bans, warnings, automod, and the audit log">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<div class="mb-4 flex gap-1 rounded-btn bg-surface-2 p-1">
  {#each TABS as t}
    <button
      class="flex-1 rounded-[10px] px-3 py-1.5 text-sm font-semibold transition"
      class:bg-accent={tab === t.id}
      class:text-on-accent={tab === t.id}
      class:text-muted={tab !== t.id}
      onclick={() => (tab = t.id)}
    >
      {t.icon} {t.label}
    </button>
  {/each}
</div>

<States {loading} {error}>
  {#if tab === 'bans'}
    {#if bans.length === 0}
      <div class="card p-10 text-center text-muted">No bans 🎉</div>
    {:else}
      <Card padding="p-0" class="overflow-hidden">
        {#each bans as b (b.userId)}
          <div class="group flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-2">
            <img src={b.avatar} alt="" class="h-8 w-8 rounded-full" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{b.tag ?? b.username}</div>
              <div class="truncate text-[11px] text-muted">{b.reason ?? 'No reason'} · {b.userId}</div>
            </div>
            <button class="btn-ghost h-7 px-2 text-xs opacity-0 group-hover:opacity-100" onclick={() => unban(b.userId)}>↺ Unban</button>
          </div>
        {/each}
      </Card>
    {/if}
  {:else if tab === 'warns'}
    {#if warns.length === 0}
      <div class="card p-10 text-center text-muted">No warnings.</div>
    {:else}
      <div class="space-y-2">
        {#each warns as u (u.userId)}
          <Card>
            <div class="flex items-center justify-between">
              <div>
                <span class="text-sm font-medium">{u.tag ?? u.userId}</span>
                <span class="pill ml-2 bg-warn/20 text-warn">{u.count} warns</span>
              </div>
              <button class="btn-ghost h-7 px-2 text-xs" onclick={() => clearWarns(u.userId)}>Clear</button>
            </div>
            <ul class="mt-2 space-y-1 text-xs text-muted">
              {#each u.entries ?? [] as e}
                <li>• {e.reason ?? e} {#if e.at}<span class="opacity-60">— {fmtRelative(e.at)}</span>{/if}</li>
              {/each}
            </ul>
          </Card>
        {/each}
      </div>
    {/if}
  {:else if tab === 'automod'}
    <Card>
      <div class="grid gap-2 sm:grid-cols-2">
        {#each AUTOMOD_KEYS as [key, label]}
          <label class="flex items-center justify-between rounded-btn bg-surface-2 px-3 py-2.5">
            <span class="text-sm">{label}</span>
            <input type="checkbox" checked={!!automod?.[key]} onchange={(e) => toggleAutomod(key, e.currentTarget.checked)} />
          </label>
        {/each}
      </div>
    </Card>
  {:else if tab === 'audit'}
    {#if audit.length === 0}
      <div class="card p-10 text-center text-muted">No audit entries.</div>
    {:else}
      <Card padding="p-0" class="overflow-hidden">
        {#each audit as e (e.id)}
          <div class="border-b border-border px-4 py-2 text-sm last:border-0 hover:bg-surface-2">
            <span class="font-medium">{e.executor?.tag ?? 'Unknown'}</span>
            <span class="text-muted"> {e.action} </span>
            {#if e.target}<span class="font-medium">{e.target.tag}</span>{/if}
            <span class="float-right text-[11px] text-muted">{fmtRelative(e.createdAt)}</span>
            {#if e.reason}<div class="text-[11px] text-muted">↳ {e.reason}</div>{/if}
          </div>
        {/each}
      </Card>
    {/if}
  {/if}
</States>
