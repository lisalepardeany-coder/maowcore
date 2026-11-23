<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { NAV } from '$lib/nav';
  import { THEMES, setTheme } from '$lib/stores/theme';
  import { liveState, sendAction } from '$lib/ws';
  import { setGuild } from '$lib/stores/guild';

  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  interface Cmd { label: string; hint: string; run: () => void; icon: string }

  let commands = $derived.by<Cmd[]>(() => {
    const out: Cmd[] = [];
    // Pages
    for (const g of NAV) for (const i of g.items) {
      out.push({ label: i.label, hint: 'Page', icon: i.icon, run: () => goto(`${base}${i.href}`) });
    }
    // Themes
    for (const t of THEMES) {
      out.push({ label: `Theme: ${t.name}`, hint: 'Theme', icon: '🎨', run: () => setTheme(t.id) });
    }
    // Servers
    for (const s of $liveState.guilds ?? []) {
      out.push({ label: `Server: ${s.name}`, hint: 'Switch', icon: '🌐', run: () => setGuild(s.id) });
    }
    // Quick actions
    out.push({ label: 'Play / Pause', hint: 'Action', icon: '⏯', run: () => sendAction($liveState.queues?.[0]?.paused ? 'resume' : 'pause') });
    out.push({ label: 'Skip', hint: 'Action', icon: '⏭', run: () => sendAction('skip') });
    out.push({ label: 'Stop', hint: 'Action', icon: '⏹', run: () => sendAction('stop') });
    return out;
  });

  let filtered = $derived(
    query
      ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())).slice(0, 40)
      : commands.slice(0, 40),
  );

  function openPalette() {
    open = true;
    query = '';
    active = 0;
    setTimeout(() => inputEl?.focus(), 0);
  }
  function close() { open = false; }
  function choose(c: Cmd) { c.run(); close(); }

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open ? close() : openPalette();
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, filtered.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); }
    else if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
  }

  onMount(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

{#if open}
  <div class="fixed inset-0 z-[95] grid place-items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm" onclick={close} role="presentation">
    <div class="w-full max-w-lg overflow-hidden rounded-card border border-border bg-surface shadow-card" onclick={(e) => e.stopPropagation()} role="presentation">
      <input
        bind:this={inputEl}
        bind:value={query}
        oninput={() => (active = 0)}
        placeholder="Jump to a page, theme, server, or action…"
        class="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
      />
      <div class="max-h-80 overflow-y-auto p-1">
        {#each filtered as c, i}
          <button
            class="flex w-full items-center gap-3 rounded-btn px-3 py-2 text-left text-sm transition"
            class:bg-surface-2={i === active}
            onmouseenter={() => (active = i)}
            onclick={() => choose(c)}
          >
            <span>{c.icon}</span>
            <span class="flex-1">{c.label}</span>
            <span class="pill bg-surface-2 text-[9px] text-muted">{c.hint}</span>
          </button>
        {/each}
        {#if filtered.length === 0}
          <div class="px-3 py-6 text-center text-sm text-muted">No matches</div>
        {/if}
      </div>
    </div>
  </div>
{/if}
