<script lang="ts">
  // The right-hand cluster shared by both layouts: now-playing chip, server
  // picker, live indicator, and the user/login control.
  import { liveState, wsConnected } from '$lib/ws';
  import { me, startLogin } from '$lib/stores/user';
  import GuildPicker from './GuildPicker.svelte';

  let { showNowPlaying = true }: { showNowPlaying?: boolean } = $props();
  let nowPlaying = $derived($liveState.queues?.[0]?.currentSong ?? null);
</script>

{#if showNowPlaying && nowPlaying}
  <div class="hidden min-w-0 items-center gap-2 rounded-pill border border-border bg-surface px-2.5 py-1 lg:flex">
    {#if nowPlaying.thumbnail}
      <img src={nowPlaying.thumbnail} alt="" class="h-7 w-7 shrink-0 rounded-md object-cover" />
    {/if}
    <div class="min-w-0">
      <div class="max-w-[160px] truncate text-xs font-semibold">{nowPlaying.name}</div>
      <div class="truncate text-[10px] text-muted">{$liveState.queues?.[0]?.paused ? '⏸ paused' : '▶ playing'}</div>
    </div>
  </div>
{/if}

<GuildPicker />

<span class="pill shrink-0 border border-border bg-surface" title={$wsConnected ? 'Connected' : 'Reconnecting…'}>
  <span class="h-2 w-2 rounded-full {$wsConnected ? 'bg-success' : 'bg-warn animate-pulse-glow'}"></span>
  <span class="hidden sm:inline">{$wsConnected ? 'live' : 'offline'}</span>
</span>

{#if $me.loggedIn}
  <div class="flex shrink-0 items-center gap-2 rounded-pill border border-border bg-surface px-2 py-1">
    {#if $me.avatar}
      <img src={$me.avatar} alt="" class="h-6 w-6 shrink-0 rounded-full object-cover" />
    {:else}
      <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-on-accent text-xs">
        {($me.username ?? '?')[0]?.toUpperCase()}
      </span>
    {/if}
    <span class="hidden whitespace-nowrap text-xs font-semibold sm:inline">{$me.username ?? 'User'}</span>
    {#if $me.rank}<span class="pill shrink-0 bg-surface-2 text-[9px] capitalize text-muted">{$me.rank}</span>{/if}
  </div>
{:else}
  <button class="btn-primary h-9" onclick={startLogin}>Sign in</button>
{/if}
