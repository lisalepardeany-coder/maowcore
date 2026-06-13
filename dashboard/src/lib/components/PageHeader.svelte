<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    title,
    subtitle = '',
    actions,
  }: { title: string; subtitle?: string; actions?: Snippet } = $props();
</script>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
  <div>
    <h1 class="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
    {#if subtitle}<p class="text-sm text-muted">{subtitle}</p>{/if}
  </div>
  {#if actions}<div class="flex items-center gap-2">{@render actions()}</div>{/if}
</div>
