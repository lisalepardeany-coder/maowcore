<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Card from '$lib/components/Card.svelte';
  import { ALL_BOOTS } from '$lib/boot-profiles';
  import { bootOverride, setBootOverride, previewBoot } from '$lib/stores/boot';
  import { currentTheme } from '$lib/stores/theme';
  import { resumeAudio } from '$lib/boot-sounds';
  import { pushToast } from '$lib/stores/toast';

  const GROUPS = ['Built-in', 'Machine', 'Backrooms', 'Matrix', 'Server', 'Hacker', 'Cinematic'] as const;
  const GROUP_BLURB: Record<string, string> = {
    'Built-in': 'The original boots — each is also tied to one or more themes.',
    Machine: 'Surveillance ASIs assessing whether you are relevant.',
    Backrooms: 'Analog-horror VHS — no-clip into the liminal.',
    Matrix: 'Code-rain variants. Follow the white rabbit.',
    Server: 'Rack POST, clusters, mainframes spinning up.',
    Hacker: 'Intrusion logs — breach, decrypt, exfil.',
    Cinematic: 'Sci-fi AIs and ship computers waking up.',
  };

  // What actually plays on load: an explicit override, else the theme's boot.
  let currentBootId = $derived($bootOverride !== 'auto' ? $bootOverride : $currentTheme.boot);
  let currentName = $derived(ALL_BOOTS.find((b) => b.id === currentBootId)?.name ?? currentBootId);

  function doPreview(id: string) {
    resumeAudio(); // unlock audio inside the click gesture
    previewBoot(id);
  }
  function setDefault(id: string) {
    setBootOverride(id);
    pushToast(`Boot screen set · ${ALL_BOOTS.find((b) => b.id === id)?.name ?? id}`, 'success');
  }
  function resetAuto() {
    setBootOverride('auto');
    pushToast('Boot screen follows your theme again', 'info');
  }
</script>

<svelte:head><title>Boot Lab · MaowCore</title></svelte:head>

<PageHeader title="Boot Lab" subtitle="Preview every cinematic boot sequence — then pick the one that plays on load" />

<!-- Current selection -->
<Card class="mb-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <div class="text-xs font-bold uppercase tracking-widest text-muted">Plays on load</div>
      <div class="mt-0.5 font-display text-lg font-bold">
        {#if $bootOverride === 'auto'}
          Auto · follows your theme <span class="text-muted">(currently {currentName})</span>
        {:else}
          {currentName} <span class="pill ml-1 bg-accent text-on-accent text-[10px]">forced</span>
        {/if}
      </div>
    </div>
    <div class="flex gap-2">
      <button class="btn-ghost h-9 text-sm" onclick={() => doPreview(currentBootId)}>▶ Preview current</button>
      {#if $bootOverride !== 'auto'}<button class="btn-ghost h-9 text-sm" onclick={resetAuto}>↺ Follow theme</button>{/if}
    </div>
  </div>
  <p class="mt-2 text-[11px] text-muted">Preview replays the boot right over this page (press any key or click to skip). “Set default” makes it play every time the dashboard loads, regardless of theme.</p>
</Card>

{#each GROUPS as group}
  {@const boots = ALL_BOOTS.filter((b) => b.group === group)}
  {#if boots.length}
    <Card class="mb-6">
      <div class="mb-1 font-display text-lg font-bold">{group} <span class="text-xs font-normal text-muted">· {boots.length}</span></div>
      <div class="mb-3 text-xs text-muted">{GROUP_BLURB[group]}</div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each boots as b (b.id)}
          <div class="card relative overflow-hidden p-4" style={currentBootId === b.id ? 'box-shadow: var(--shadow-glow)' : ''}>
            <div class="absolute right-0 top-0 h-16 w-16 opacity-20 blur-2xl" style="background:{b.accent}"></div>
            <div class="flex items-center gap-2">
              <span class="h-4 w-4 shrink-0 rounded-full" style="background:{b.accent}; box-shadow:0 0 10px {b.accent}"></span>
              <div class="min-w-0 font-display text-sm font-bold">{b.name}</div>
              {#if currentBootId === b.id}<span class="pill ml-auto bg-accent text-on-accent text-[9px]">default</span>{/if}
            </div>
            <div class="mt-1.5 min-h-[32px] text-[11px] leading-snug text-muted">{b.desc}</div>
            <div class="mt-3 flex gap-1.5">
              <button class="btn-primary h-8 flex-1 text-xs" onclick={() => doPreview(b.id)}>▶ Preview</button>
              {#if currentBootId === b.id}
                <button class="btn-ghost h-8 px-2 text-xs" disabled>✓ Default</button>
              {:else}
                <button class="btn-ghost h-8 px-2 text-xs" onclick={() => setDefault(b.id)}>Set default</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </Card>
  {/if}
{/each}
