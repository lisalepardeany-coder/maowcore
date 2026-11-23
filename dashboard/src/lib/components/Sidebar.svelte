<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { NAV } from '$lib/nav';
  import { me, rankAtLeast } from '$lib/stores/user';
  import { prefs } from '$lib/stores/prefs';

  let { collapsed = false }: { collapsed?: boolean } = $props();

  let current = $derived($page.url.pathname.replace(base, '') || '/');

  function canSee(minRank?: string): boolean {
    if (!minRank) return true;
    return rankAtLeast($me.rank, minRank);
  }
  function visible(item: any): boolean {
    return canSee(item.minRank) && !($prefs.navHidden ?? []).includes(item.href);
  }
  // Pinned items (in pin order) shown as a group on top.
  let pinned = $derived(
    ($prefs.navPinned ?? [])
      .map((href) => NAV.flatMap((g) => g.items).find((i) => i.href === href))
      .filter((i) => i && visible(i)),
  );
</script>

<aside
  class="flex h-full flex-col border-r border-border bg-bg-soft/70 transition-all duration-200 {collapsed
    ? 'w-[68px]'
    : 'w-60'}"
>
  <!-- Brand -->
  <a
    href="{base}/"
    class="flex items-center gap-2.5 px-4 py-4 no-underline"
  >
    <div
      class="grid h-9 w-9 shrink-0 place-items-center rounded-btn text-lg font-black text-on-accent"
      style="background-image: linear-gradient(135deg, var(--accent), var(--accent-3)); box-shadow: var(--shadow-glow)"
    >
      {$prefs.brandIcon || '◆'}
    </div>
    {#if !collapsed}
      <div class="leading-tight">
        <div class="font-display text-base font-extrabold tracking-tight">{$prefs.brandName || 'MaowCore'}</div>
        <div class="text-[10px] font-medium uppercase tracking-widest text-muted">control</div>
      </div>
    {/if}
  </a>

  {#if pinned.length && !collapsed}
    <div class="px-2 pb-1">
      <div class="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted/70">Pinned</div>
      {#each pinned as item}
        <a href="{base}{item.href}" class="nav-item" class:active={current === item.href}>
          <span class="w-5 shrink-0 text-center text-base">{item.icon}</span>
          <span class="truncate">{item.label}</span>
          <span class="ml-auto text-xs">📌</span>
        </a>
      {/each}
    </div>
  {/if}

  <!-- Nav -->
  <nav class="flex-1 space-y-4 overflow-y-auto px-2 py-2">
    {#each NAV as group}
      {@const items = group.items.filter(visible)}
      {#if items.length}
        <div>
          {#if group.title && !collapsed}
            <div class="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted/70">
              {group.title}
            </div>
          {/if}
          {#each items as item}
            {#if item.done}
              <a
                href="{base}{item.href}"
                class="nav-item"
                class:active={current === item.href}
                title={item.label}
              >
                <span class="w-5 shrink-0 text-center text-base">{item.icon}</span>
                {#if !collapsed}<span class="truncate">{item.label}</span>{/if}
              </a>
            {:else}
              <a href="/" class="nav-item opacity-60" title="{item.label} (legacy)">
                <span class="w-5 shrink-0 text-center text-base">{item.icon}</span>
                {#if !collapsed}
                  <span class="truncate">{item.label}</span>
                  <span class="pill ml-auto bg-surface-2 text-[9px] text-muted">soon</span>
                {/if}
              </a>
            {/if}
          {/each}
        </div>
      {/if}
    {/each}
  </nav>

  <!-- Version -->
  <div class="border-t border-border px-4 py-3 text-[10px] text-muted">
    {#if !collapsed}MaowCore Dashboard · v2{:else}v2{/if}
  </div>
</aside>
