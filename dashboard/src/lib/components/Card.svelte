<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    class: cls = '',
    glass = false,
    padding = 'p-5',
  }: { children: Snippet; class?: string; glass?: boolean; padding?: string } = $props();
</script>

<div class="card {glass ? 'surface-glass' : ''} {padding} {cls}">
  {@render children()}
</div>
