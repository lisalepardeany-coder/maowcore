<script lang="ts">
  import { api } from '$lib/api';
  import { guildId } from '$lib/stores/guild';
  import { me } from '$lib/stores/user';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';

  let mine = $state<any>(null);
  let stats = $state<any>({});

  async function load(gid: string) {
    if (!gid) return;
    try {
      mine = $me.loggedIn ? (await api.get<any>(`/api/economy/me?guildId=${gid}`).catch(() => null))?.user : null;
      stats = await api.get<any>(`/api/stats?guildId=${gid}`).catch(() => ({}));
    } catch { /* */ }
  }
  $effect(() => { load($guildId); });

  // Achievement definitions with a progress function.
  const ACHIEVEMENTS = [
    { id: 'first', icon: '🎵', name: 'First Spin', desc: 'Play your first song', goal: 1, val: () => stats.total ?? 0 },
    { id: 'listener', icon: '🎧', name: 'Regular Listener', desc: 'Reach 100 server plays', goal: 100, val: () => stats.total ?? 0 },
    { id: 'audiophile', icon: '💿', name: 'Audiophile', desc: 'Reach 1,000 server plays', goal: 1000, val: () => stats.total ?? 0 },
    { id: 'lvl5', icon: '⭐', name: 'Rising Star', desc: 'Reach level 5', goal: 5, val: () => mine?.level ?? 0 },
    { id: 'lvl10', icon: '🌟', name: 'Veteran', desc: 'Reach level 10', goal: 10, val: () => mine?.level ?? 0 },
    { id: 'lvl25', icon: '👑', name: 'Legend', desc: 'Reach level 25', goal: 25, val: () => mine?.level ?? 0 },
    { id: 'rich', icon: '🪙', name: 'Coin Collector', desc: 'Earn 1,000 coins', goal: 1000, val: () => mine?.coins ?? 0 },
    { id: 'wealthy', icon: '💎', name: 'Tycoon', desc: 'Earn 10,000 coins', goal: 10000, val: () => mine?.coins ?? 0 },
    { id: 'variety', icon: '🎨', name: 'Eclectic Taste', desc: 'Hear 50 unique tracks', goal: 50, val: () => (stats.topSongs ?? []).length },
    { id: 'artists', icon: '🎤', name: 'Artist Explorer', desc: 'Hear 25 different artists', goal: 25, val: () => (stats.topArtists ?? []).length },
    { id: 'hours', icon: '⏱️', name: 'Time Well Spent', desc: 'Listen for 10 hours', goal: 36000, val: () => stats.totalListeningSec ?? 0 },
    { id: 'marathon', icon: '🔥', name: 'Marathon', desc: 'Listen for 100 hours', goal: 360000, val: () => stats.totalListeningSec ?? 0 },
  ];

  let computed = $derived(ACHIEVEMENTS.map((a) => {
    const v = a.val();
    return { ...a, current: v, unlocked: v >= a.goal, pct: Math.min(100, Math.round((v / a.goal) * 100)) };
  }));
  let unlockedCount = $derived(computed.filter((a) => a.unlocked).length);
</script>

<svelte:head><title>Achievements · MaowCore</title></svelte:head>

<PageHeader title="Achievements" subtitle={`${unlockedCount} / ${ACHIEVEMENTS.length} unlocked`}>
  {#snippet actions()}<GuildPicker />{/snippet}
</PageHeader>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
  {#each computed as a (a.id)}
    <Card class="{a.unlocked ? '' : 'opacity-70'}">
      <div class="flex items-start gap-3">
        <div class="grid h-12 w-12 shrink-0 place-items-center rounded-card text-2xl {a.unlocked ? '' : 'grayscale'}" style={a.unlocked ? 'background-image:linear-gradient(135deg, var(--accent), var(--accent-3))' : 'background:var(--surface-2)'}>{a.icon}</div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2"><span class="font-display font-bold">{a.name}</span>{#if a.unlocked}<span class="pill bg-success/20 text-success text-[9px]">✓</span>{/if}</div>
          <div class="text-xs text-muted">{a.desc}</div>
          {#if !a.unlocked}
            <div class="mt-2 h-1 overflow-hidden rounded-pill bg-surface-2"><div class="h-full rounded-pill bg-accent" style="width:{a.pct}%"></div></div>
            <div class="mt-0.5 text-[10px] tabular-nums text-muted">{a.current} / {a.goal}</div>
          {/if}
        </div>
      </div>
    </Card>
  {/each}
</div>
{#if !$me.loggedIn}<p class="mt-4 text-xs text-muted">Sign in to track level/coin achievements; play-count ones use server-wide stats.</p>{/if}
