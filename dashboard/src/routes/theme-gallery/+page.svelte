<script lang="ts">
  import { theme, currentTheme, THEMES, setTheme } from '$lib/stores/theme';
  import { prefs, setPref } from '$lib/stores/prefs';
  import { pushToast } from '$lib/stores/toast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';

  let importCode = $state('');

  function applyBuiltin(id: any) { setTheme(id); setPref('varOverrides', {}); setPref('accent', ''); }
  function applyCustom(ct: any) {
    setTheme(ct.nav === 'top' ? 'cyberdeck' : ct.nav === 'rail' ? 'terminal' : 'neko');
    setPref('varOverrides', { ...ct.vars });
    setPref('accent', '');
    pushToast(`Applied "${ct.name}"`, 'success');
  }
  function importTheme() {
    try {
      const t = JSON.parse(importCode);
      const list = Array.isArray(t) ? t : [t];
      setPref('customThemes', [...$prefs.customThemes, ...list]);
      importCode = '';
      pushToast('Theme imported', 'success');
    } catch { pushToast('Invalid theme code', 'error'); }
  }
  function copyCode(ct: any) {
    navigator.clipboard.writeText(JSON.stringify(ct));
    pushToast('Theme code copied', 'success');
  }
  function del(id: string) { setPref('customThemes', $prefs.customThemes.filter((c) => c.id !== id)); }

  const NAV_LABEL: Record<string, string> = { side: 'Side nav', top: 'Top HUD', rail: 'Icon rail' };
  const GROUPS = ['Signature', 'Cinematic', 'Brand', 'Atmosphere', 'Backrooms', 'Technical', 'Minimal'] as const;
</script>

<svelte:head><title>Theme Gallery · MaowCore</title></svelte:head>

<PageHeader title="Theme Gallery" subtitle="Browse, apply, and share themes" />

{#each GROUPS as group}
  {@const themes = THEMES.filter((t) => t.group === group)}
  {#if themes.length}
    <Card class="mb-6">
      <div class="mb-3 font-display text-lg font-bold">{group} <span class="text-xs font-normal text-muted">· {themes.length}</span></div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each themes as t (t.id)}
          <button class="card p-4 text-left transition hover:-translate-y-0.5" style={$theme === t.id ? 'box-shadow: var(--shadow-glow)' : ''} onclick={() => applyBuiltin(t.id)}>
            <div class="mb-3 flex gap-1.5">{#each t.swatches as c}<span class="h-7 w-7 rounded-full" style="background:{c}"></span>{/each}</div>
            <div class="font-display font-bold">{t.name}</div>
            <div class="text-xs text-muted">{t.tagline}</div>
            <div class="mt-2 flex flex-wrap items-center gap-1.5"><span class="pill bg-surface-2 text-[9px] text-muted">{NAV_LABEL[t.nav]}</span><span class="pill bg-surface-2 text-[9px] text-muted">⚡ {t.boot} boot</span>{#if $theme === t.id}<span class="pill bg-accent text-on-accent text-[9px]">active</span>{/if}</div>
          </button>
        {/each}
      </div>
    </Card>
  {/if}
{/each}

<Card class="mb-6">
  <div class="mb-3 font-display text-lg font-bold">My themes</div>
  {#if $prefs.customThemes.length === 0}
    <p class="text-sm text-muted">No custom themes yet — build one in <a class="text-accent hover:underline" href="settings">Settings → Themes</a>.</p>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each $prefs.customThemes as ct (ct.id)}
        <div class="card p-4">
          <div class="mb-3 flex gap-1.5">{#each Object.values(ct.vars).slice(0, 5) as c}<span class="h-7 w-7 rounded-full" style="background:{c}"></span>{/each}</div>
          <div class="font-display font-bold">{ct.name}</div>
          <div class="mt-2 flex gap-1">
            <button class="btn-primary h-7 flex-1 text-xs" onclick={() => applyCustom(ct)}>Apply</button>
            <button class="btn-ghost h-7 px-2 text-xs" onclick={() => copyCode(ct)} title="Copy code">📋</button>
            <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => del(ct.id)}>✕</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</Card>

<Card>
  <div class="mb-2 font-display text-lg font-bold">Import a theme</div>
  <p class="mb-2 text-xs text-muted">Paste a theme code shared by someone else.</p>
  <textarea class="input mb-2 min-h-20 font-mono text-xs" placeholder={'{"id":"...","name":"...","vars":{...},"nav":"side"}'} bind:value={importCode}></textarea>
  <button class="btn-primary" onclick={importTheme}>Import</button>
</Card>
