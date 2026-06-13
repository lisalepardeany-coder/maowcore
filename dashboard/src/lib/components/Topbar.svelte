<script lang="ts">
  import TopbarControls from './TopbarControls.svelte';

  let { onToggleSidebar }: { onToggleSidebar: () => void } = $props();
</script>

<header
  class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-md"
>
  <button class="btn-ghost h-9 w-9 !px-0 md:hidden" onclick={onToggleSidebar} aria-label="Toggle sidebar">
    ☰
  </button>
  <button class="btn-ghost hidden h-9 w-9 !px-0 md:inline-flex" onclick={onToggleSidebar} aria-label="Collapse sidebar">
    «
  </button>

  <div class="ml-auto flex items-center gap-2">
    <TopbarControls />
  </div>
</header>
