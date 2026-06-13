<script lang="ts">
  // Lightweight SVG line+area chart for a numeric series (no chart library).
  let {
    data = [],
    color = 'var(--accent)',
    max = 100,
    height = 56,
    label = '',
    unit = '%',
  }: { data?: number[]; color?: string; max?: number; height?: number; label?: string; unit?: string } = $props();

  const W = 100;
  let line = $derived.by(() => {
    if (data.length < 2) return '';
    return data
      .map((v, i) => `${(i / (data.length - 1)) * W},${height - (Math.min(v, max) / max) * height}`)
      .join(' ');
  });
  let area = $derived(line ? `0,${height} ${line} ${W},${height}` : '');
  let latest = $derived(data.length ? data[data.length - 1] : 0);
  let uid = $derived(`g${label}${color}`.replace(/[^a-z0-9]/gi, ''));
</script>

<div>
  {#if label}
    <div class="mb-1 flex items-center justify-between text-xs">
      <span class="text-muted">{label}</span>
      <span class="font-display font-bold" style="color:{color}">{latest}{unit}</span>
    </div>
  {/if}
  <svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" class="w-full" style="height:{height}px">
    <defs>
      <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color={color} stop-opacity="0.35" />
        <stop offset="100%" stop-color={color} stop-opacity="0" />
      </linearGradient>
    </defs>
    {#if data.length >= 2}
      <polygon points={area} fill="url(#{uid})" />
      <polyline points={line} fill="none" stroke={color} stroke-width="1.5" vector-effect="non-scaling-stroke" />
    {:else}
      <text x="50" y={height / 2} text-anchor="middle" font-size="7" fill="var(--muted)">collecting…</text>
    {/if}
  </svg>
</div>
