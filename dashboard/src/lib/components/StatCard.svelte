<script lang="ts">
  let {
    label,
    value,
    icon = '',
    accent = false,
  }: { label: string; value: string | number; icon?: string; accent?: boolean } = $props();
</script>

<div class="card p-4 animate-fade-up">
  <div class="flex items-center justify-between">
    <span class="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
    {#if icon}<span class="text-lg opacity-70">{icon}</span>{/if}
  </div>
  <div
    class="mt-2 font-display text-2xl font-extrabold {accent ? 'text-accent' : 'text-text'}"
  >
    {value}
  </div>
</div>
