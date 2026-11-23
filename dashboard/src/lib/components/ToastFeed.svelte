<script lang="ts">
  import { toasts, dismissToast, type Toast } from '$lib/stores/toast';

  const ICON: Record<Toast['kind'], string> = { info: 'ℹ️', success: '✓', warn: '⚠', error: '✕' };
  const COLOR: Record<Toast['kind'], string> = {
    info: 'var(--accent)', success: 'var(--success)', warn: 'var(--warn)', error: 'var(--danger)',
  };
</script>

<div class="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
  {#each $toasts as t (t.id)}
    <div
      class="pointer-events-auto flex items-start gap-2 rounded-card border border-border bg-surface p-3 shadow-card animate-fade-up"
      style="border-left: 3px solid {COLOR[t.kind]}"
    >
      <span class="text-sm" style="color:{COLOR[t.kind]}">{ICON[t.kind]}</span>
      <span class="min-w-0 flex-1 text-sm">{t.text}</span>
      <button class="text-muted hover:text-text" onclick={() => dismissToast(t.id)}>✕</button>
    </div>
  {/each}
</div>
