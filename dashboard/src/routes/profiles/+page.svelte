<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { me } from '$lib/stores/user';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';
  import { fmtNumber, fmtDuration } from '$lib/format';

  let leaderboard = $state<any[]>([]);
  let econ = $state<any>(null);
  let myRow = $derived(leaderboard.find((r) => r.user === $me.username || r.userId === $me.userId) ?? null);

  async function load(gid: string) {
    if (!gid) return;
    try {
      leaderboard = (await api.get<any>(`/api/social/leaderboard?guildId=${gid}`).catch(() => ({}))).leaderboard ?? [];
      econ = $me.loggedIn ? (await api.get<any>(`/api/economy/me?guildId=${gid}`).catch(() => null))?.user : null;
    } catch { /* */ }
  }
  $effect(() => { load($guildId); });

  function shareCard() {
    const lines = [
      `🪪 ${$me.username ?? 'My'} · MaowCore profile`,
      myRow ? `🎧 ${fmtNumber(myRow.plays)} plays · ${fmtDuration(myRow.totalSec)} listened` : '',
      econ ? `⭐ Level ${econ.level} · 🪙 ${fmtNumber(econ.coins)} coins` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines);
    pushToast('Profile card copied to clipboard', 'success');
  }
</script>

<svelte:head><title>Profile Cards · MaowCore</title></svelte:head>

<PageHeader title="Profile Cards" subtitle="Shareable listening profiles">
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

{#if $me.loggedIn}
  <!-- Your card -->
  <Card class="relative mb-6 overflow-hidden" padding="p-0">
    <div class="absolute inset-0 opacity-30" style="background-image:linear-gradient(135deg, var(--accent), var(--accent-3))"></div>
    <div class="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
      {#if $me.avatar}<img src={$me.avatar} alt="" class="h-20 w-20 rounded-full border-2 border-border" />{/if}
      <div class="flex-1">
        <div class="font-display text-2xl font-extrabold">{$me.username}</div>
        <div class="text-sm capitalize text-muted">{$me.rank ?? 'member'}</div>
        <div class="mt-3 flex flex-wrap gap-2">
          {#if myRow}<span class="pill bg-surface text-text">🎧 {fmtNumber(myRow.plays)} plays</span><span class="pill bg-surface text-text">⏱️ {fmtDuration(myRow.totalSec)}</span>{/if}
          {#if econ}<span class="pill bg-surface text-text">⭐ Lvl {econ.level}</span><span class="pill bg-surface text-warn">🪙 {fmtNumber(econ.coins)}</span>{/if}
        </div>
      </div>
      <button class="btn-ghost shrink-0" onclick={shareCard}>📋 Share</button>
    </div>
  </Card>
{:else}
  <Card class="mb-6"><p class="text-sm text-muted">Sign in to see your own profile card.</p></Card>
{/if}

<Card>
  <div class="mb-3 font-display text-lg font-bold">Top listeners</div>
  {#if leaderboard.length === 0}
    <p class="text-sm text-muted">No listening data yet.</p>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each leaderboard.slice(0, 12) as row, i}
        <div class="card flex items-center gap-3 p-3">
          <span class="font-display w-6 text-center font-bold {i < 3 ? 'text-accent' : 'text-muted'}">{['🥇','🥈','🥉'][i] ?? i + 1}</span>
          {#if row.avatar}<img src={row.avatar} alt="" class="h-9 w-9 rounded-full" />{:else}<div class="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-xs">{(row.name ?? row.user ?? '?')[0]}</div>{/if}
          <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium">{row.name ?? row.user ?? row.userId}</div><div class="text-[11px] text-muted">{fmtNumber(row.plays)} plays · {fmtDuration(row.totalSec)}</div></div>
        </div>
      {/each}
    </div>
  {/if}
</Card>
