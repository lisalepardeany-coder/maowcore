<script lang="ts">
  // Horizontal "HUD" navigation used by the top-layout themes (Cyberdeck).
  // Brand on the left, scrollable nav row in the middle, controls on the right.
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { NAV } from '$lib/nav';
  import { me, rankAtLeast } from '$lib/stores/user';
  import TopbarControls from './TopbarControls.svelte';

  let current = $derived($page.url.pathname.replace(base, '') || '/');
  // Flatten all visible nav items into one row.
  let items = $derived(
    NAV.flatMap((g) => g.items).filter((i) => !i.minRank || rankAtLeast($me.rank, i.minRank)),
  );
</script>

<header class="hud-bar sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
  <div class="flex h-14 items-center gap-3 px-4">
    <!-- Brand -->
    <a href="{base}/" class="flex shrink-0 items-center gap-2 no-underline">
      <div
        class="grid h-8 w-8 place-items-center rounded-btn text-on-accent"
        style="background-image: linear-gradient(135deg, var(--accent), var(--accent-3)); box-shadow: var(--shadow-glow)"
      >◆</div>
      <span class="hud-brand hidden font-display text-sm font-extrabold tracking-widest sm:block">MAOWCORE</span>
    </a>

    <div class="ml-auto flex items-center gap-2">
      <TopbarControls showNowPlaying={false} />
    </div>
  </div>

  <!-- Nav row -->
  <nav class="hud-nav flex items-center gap-1 overflow-x-auto px-3 pb-1.5">
    {#each items as item}
      <a
        href="{base}{item.href}"
        class="hud-link flex shrink-0 items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-semibold"
        class:active={current === item.href}
      >
        <span>{item.icon}</span>
        <span class="whitespace-nowrap">{item.label}</span>
      </a>
    {/each}
  </nav>
</header>
