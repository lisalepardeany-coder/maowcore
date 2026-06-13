<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { api } from '$lib/api';
  import { me } from '$lib/stores/user';
  import { liveState, wsConnected } from '$lib/ws';
  import { prefs } from '$lib/stores/prefs';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';

  let health = $state<any>({});
  let authConfigured = $state(true);
  onMount(async () => {
    try { health = await api.get<any>('/api/health'); } catch { /* */ }
    try { const m = await api.get<any>('/api/auth/me'); authConfigured = m.configured !== false; } catch { /* */ }
  });

  let steps = $derived([
    { done: !!health.botTag && $wsConnected, title: 'Bot is online & connected', desc: 'Your bot is running and the dashboard is linked.', href: '/status', cta: 'View status' },
    { done: ($liveState.guilds?.length ?? 0) > 0, title: 'Bot is in a server', desc: 'Invite the bot to at least one Discord server.', href: '/settings', cta: 'Get invite' },
    { done: authConfigured, title: 'Discord login configured', desc: 'Set DISCORD_CLIENT_ID + SECRET in .env to enable dashboard login.', href: '/settings', cta: 'Settings' },
    { done: $me.loggedIn, title: 'Sign in', desc: 'Log in with Discord to unlock admin features.', href: '/settings', cta: 'Sign in' },
    { done: $me.rank === 'owner' || $me.rank === 'admin', title: 'Claim owner/admin', desc: 'The first user (or OWNER_USER_ID) becomes owner.', href: '/ranks', cta: 'Ranks' },
    { done: $prefs.brandName !== 'MaowCore' || $prefs.accent !== '', title: 'Personalize your dashboard', desc: 'Pick a theme, accent color, and brand name.', href: '/settings', cta: 'Customize' },
    { done: false, title: 'Build your server', desc: 'Run /setup in Discord to auto-create channels, roles & permissions.', href: '/commands', cta: 'See /setup' },
    { done: false, title: 'Queue your first song', desc: 'Use /play in Discord or the Player page to start the music.', href: '/player', cta: 'Open player' },
  ]);

  let completed = $derived(steps.filter((s) => s.done).length);
  let pct = $derived(Math.round((completed / steps.length) * 100));
</script>

<svelte:head><title>Getting Started · MaowCore</title></svelte:head>

<PageHeader title="Getting Started" subtitle="Set up MaowCore step by step" />

<Card class="mb-6">
  <div class="mb-2 flex items-center justify-between"><span class="font-display font-bold">Setup progress</span><span class="text-sm text-muted">{completed} / {steps.length}</span></div>
  <div class="h-2 overflow-hidden rounded-pill bg-surface-2"><div class="h-full rounded-pill transition-all" style="width:{pct}%; background-image:linear-gradient(90deg, var(--accent), var(--accent-3))"></div></div>
</Card>

<div class="space-y-2">
  {#each steps as s, i}
    <Card>
      <div class="flex items-center gap-4">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-full {s.done ? 'bg-success text-on-accent' : 'bg-surface-2 text-muted'} font-bold">{s.done ? '✓' : i + 1}</div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold {s.done ? 'text-muted line-through' : ''}">{s.title}</div>
          <div class="text-xs text-muted">{s.desc}</div>
        </div>
        <a href="{base}{s.href}" class="btn-ghost h-8 shrink-0 px-3 text-xs">{s.cta}</a>
      </div>
    </Card>
  {/each}
</div>
