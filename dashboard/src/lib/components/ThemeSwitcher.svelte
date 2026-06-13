<script lang="ts">
  import { theme, setTheme, THEMES } from '$lib/stores/theme';

  const NAV_LABEL: Record<string, string> = { side: 'Side nav', top: 'Top HUD', rail: 'Icon rail' };
  const GROUPS = ['Signature', 'Cinematic', 'Brand', 'Atmosphere', 'Backrooms', 'Technical', 'Minimal'] as const;
</script>

<div class="space-y-5">
  {#each GROUPS as group}
    <div>
      <div class="mb-2 text-xs font-bold uppercase tracking-widest text-muted">{group}</div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each THEMES.filter((t) => t.group === group) as t (t.id)}
          <button
            type="button"
            onclick={() => setTheme(t.id)}
            class="card group relative overflow-hidden p-4 text-left transition-all duration-200 hover:-translate-y-0.5"
            style={$theme === t.id ? 'box-shadow: var(--shadow-glow)' : ''}
          >
            <div class="mb-3 flex gap-1.5">
              {#each t.swatches as c}
                <span class="h-6 w-6 rounded-full" style="background:{c}"></span>
              {/each}
            </div>
            <div class="font-display text-base font-bold">{t.name}</div>
            <div class="text-xs text-muted">{t.tagline}</div>
            <div class="mt-2 flex items-center gap-2">
              <span class="pill bg-surface-2 text-[9px] text-muted">{NAV_LABEL[t.nav]}</span>
              {#if $theme === t.id}
                <span class="pill bg-accent text-on-accent text-[9px]">✓ active</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/each}
</div>

<p class="mt-4 text-xs text-muted">
  Themes change more than color — each one restyles the shapes, density, fonts, and even the
  navigation layout. Try <strong>Cyberdeck</strong> for a top HUD bar, or <strong>Terminal</strong>
  for a compact monospace rail.
</p>
