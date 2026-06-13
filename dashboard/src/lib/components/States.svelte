<script lang="ts">
  // Reusable loading / error / empty states.
  import type { Snippet } from 'svelte';
  let {
    loading = false,
    error = '',
    empty = false,
    emptyText = 'Nothing here yet.',
    emptyIcon = '📭',
    rows = 5,
    children,
  }: {
    loading?: boolean;
    error?: string;
    empty?: boolean;
    emptyText?: string;
    emptyIcon?: string;
    rows?: number;
    children: Snippet;
  } = $props();
</script>

{#if error}
  <div class="card border-danger/40 p-4 text-sm text-danger">⚠ {error}</div>
{:else if loading}
  <div class="grid gap-2">
    {#each Array(rows) as _}<div class="skel h-12"></div>{/each}
  </div>
{:else if empty}
  <div class="card p-12 text-center text-muted">
    <div class="mb-2 text-4xl opacity-40">{emptyIcon}</div>
    {emptyText}
  </div>
{:else}
  {@render children()}
{/if}
