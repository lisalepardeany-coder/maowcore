<script lang="ts">
  import { browser } from '$app/environment';
  import { api } from '$lib/api';
  import { me, startLogin, logout } from '$lib/stores/user';
  import { guildId } from '$lib/stores/guild';
  import { theme, currentTheme, THEMES, setTheme } from '$lib/stores/theme';
  import { prefs, setPref, resetPrefs, exportPrefs, importPrefs } from '$lib/stores/prefs';
  import { pushToast } from '$lib/stores/toast';
  import { NAV } from '$lib/nav';
  import { base } from '$app/paths';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GuildPicker from '$lib/components/GuildPicker.svelte';
  import Card from '$lib/components/Card.svelte';

  type Tab = 'appearance' | 'themes' | 'access' | 'behavior' | 'notifs' | 'nav' | 'bot' | 'integrations' | 'data';
  let tab = $state<Tab>('appearance');
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'themes', label: 'Themes', icon: '✨' },
    { id: 'access', label: 'Accessibility', icon: '♿' },
    { id: 'behavior', label: 'Behavior', icon: '⚙️' },
    { id: 'notifs', label: 'Notifications', icon: '🔔' },
    { id: 'nav', label: 'Navigation', icon: '🧭' },
    { id: 'bot', label: 'Player & Bot', icon: '🎵' },
    { id: 'integrations', label: 'Integrations', icon: '🔌' },
    { id: 'data', label: 'Account & Data', icon: '💾' },
  ];

  const ALL_PAGES = NAV.flatMap((g) => g.items);

  // Boot screen toggle (separate pref key from before).
  let bootScreen = $state(browser ? localStorage.getItem('maow.v2.bootscreen') !== 'off' : true);
  function toggleBoot() {
    bootScreen = !bootScreen;
    localStorage.setItem('maow.v2.bootscreen', bootScreen ? 'on' : 'off');
  }

  // ── Themes builder ─────────────────────────────────────────────────────────
  const VARS = [
    ['--accent', 'Accent'], ['--accent-2', 'Accent 2'], ['--accent-3', 'Accent 3'],
    ['--bg', 'Background'], ['--surface', 'Surface'], ['--text', 'Text'],
  ];
  let builderName = $state('My Theme');
  function tweakVar(v: string, value: string) {
    setPref('varOverrides', { ...$prefs.varOverrides, [v]: value });
  }
  function clearTweaks() { setPref('varOverrides', {}); }
  function curVar(v: string): string {
    if ($prefs.varOverrides?.[v]) return $prefs.varOverrides[v];
    if (browser) return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888888';
    return '#888888';
  }
  function saveTheme() {
    const vars: Record<string, string> = {};
    for (const [v] of VARS) vars[v] = curVar(v);
    const ct = { id: `c-${Date.now()}`, name: builderName || 'Custom', vars, nav: $currentTheme.nav };
    setPref('customThemes', [...$prefs.customThemes, ct]);
    pushToast(`Saved theme "${ct.name}"`, 'success');
  }
  function applyCustom(ct: any) {
    setTheme(ct.nav === 'top' ? 'cyberdeck' : ct.nav === 'rail' ? 'terminal' : 'neko');
    setPref('varOverrides', { ...ct.vars });
    setPref('accent', '');
    pushToast(`Applied "${ct.name}"`, 'success');
  }
  function deleteCustom(id: string) {
    setPref('customThemes', $prefs.customThemes.filter((c) => c.id !== id));
  }
  function exportThemes() {
    download('maowcore-themes.json', JSON.stringify($prefs.customThemes, null, 2));
  }

  // ── Export / import prefs ──────────────────────────────────────────────────
  function download(name: string, content: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    a.download = name;
    a.click();
  }
  function doExport() { download('maowcore-settings.json', exportPrefs()); }
  function doImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      try { importPrefs(txt); pushToast('Settings imported', 'success'); }
      catch { pushToast('Invalid settings file', 'error'); }
    });
  }
  function doReset() {
    if (confirm('Reset all dashboard preferences to defaults?')) { resetPrefs(); pushToast('Reset to defaults', 'info'); }
  }
  function clearLocal() {
    if (confirm('Clear ALL locally-stored data (sessions, prefs, themes)? You may need to sign in again.')) {
      localStorage.clear();
      location.reload();
    }
  }

  // ── Nav customization ──────────────────────────────────────────────────────
  function toggleHidden(href: string) {
    const h = $prefs.navHidden ?? [];
    setPref('navHidden', h.includes(href) ? h.filter((x) => x !== href) : [...h, href]);
  }
  function togglePinned(href: string) {
    const p = $prefs.navPinned ?? [];
    setPref('navPinned', p.includes(href) ? p.filter((x) => x !== href) : [...p, href]);
  }

  // ── Player & bot config ────────────────────────────────────────────────────
  let bot = $state<any>(null);
  let botSaved = $state(false);
  async function loadBot(gid: string) {
    if (!gid) return;
    try { bot = await api.get<any>(`/api/guild-config?guildId=${gid}`); } catch { bot = null; }
  }
  async function saveBot() {
    if (!bot) return;
    try {
      await api.post('/api/guild-config', { guildId: $guildId, ...bot });
      botSaved = true; setTimeout(() => (botSaved = false), 1800);
    } catch (e) { pushToast((e as Error).message, 'error'); }
  }
  $effect(() => { if (tab === 'bot') loadBot($guildId); });

  // ── Profile ────────────────────────────────────────────────────────────────
  let profile = $state({ bio: '', favoriteSong: '' });
  async function saveProfile() {
    try {
      await api.post('/api/social/profile', { guildId: $guildId, ...profile });
      pushToast('Profile saved', 'success');
    } catch (e) { pushToast((e as Error).message, 'error'); }
  }

  // ── Bot presence editor ────────────────────────────────────────────────────
  let presence = $state<any>(null);
  let presenceSaved = $state(false);
  async function loadPresence() {
    try { presence = await api.get<any>('/api/presence'); }
    catch { presence = { enabled: false, status: 'online', type: 'Listening', text: '', staticMode: false }; }
  }
  async function savePresence() {
    try { await api.post('/api/presence', presence); presenceSaved = true; setTimeout(() => (presenceSaved = false), 1800); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }

  // ── Last.fm ────────────────────────────────────────────────────────────────
  let lastfm = $state<any>(null);
  let lastfmForm = $state({ apiKey: '', apiSecret: '', sessionKey: '' });
  async function loadLastfm() { try { lastfm = await api.get<any>('/api/integrations/lastfm'); } catch { lastfm = null; } }
  async function saveLastfm() {
    try {
      const r = await api.post<any>('/api/integrations/lastfm', lastfmForm);
      lastfm = r.status;
      lastfmForm = { apiKey: '', apiSecret: '', sessionKey: '' };
      pushToast('Last.fm credentials saved', 'success');
    } catch (e) { pushToast((e as Error).message, 'error'); }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────
  let sessions = $state<any[]>([]);
  async function loadSessions() { try { sessions = (await api.get<any>('/api/auth/sessions')).sessions ?? []; } catch { sessions = []; } }
  async function revokeSession(id: string) { await api.post('/api/auth/sessions/revoke', { id }); loadSessions(); }
  async function revokeAllSessions() {
    if (!confirm('Sign out everywhere except this device?')) return;
    await api.post('/api/auth/sessions/revoke-all', {});
    loadSessions();
    pushToast('Other sessions signed out', 'success');
  }

  // ── API tokens ─────────────────────────────────────────────────────────────
  let tokens = $state<any[]>([]);
  let newTokenName = $state('');
  let newTokenValue = $state('');
  async function loadTokens() { try { tokens = (await api.get<any>('/api/tokens')).tokens ?? []; } catch { tokens = []; } }
  async function createToken() {
    if (!newTokenName.trim()) return;
    const r = await api.post<any>('/api/tokens/create', { name: newTokenName });
    newTokenValue = r.token;
    newTokenName = '';
    loadTokens();
  }
  async function revokeToken(id: string) { await api.post('/api/tokens/revoke', { id }); loadTokens(); }

  // ── Settings sync (server-side) ───────────────────────────────────────────
  async function syncUp() {
    try { await api.post('/api/prefs', { prefs: $prefs, theme: $theme }); pushToast('Settings synced to your account', 'success'); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }
  async function syncDown() {
    try {
      const d = await api.get<any>('/api/prefs');
      if (d?.prefs) { importPrefs(JSON.stringify({ prefs: d.prefs, theme: d.theme })); pushToast('Settings restored from account', 'success'); }
      else pushToast('No synced settings found', 'info');
    } catch (e) { pushToast((e as Error).message, 'error'); }
  }

  $effect(() => {
    if (tab === 'integrations') { loadPresence(); loadLastfm(); }
    if (tab === 'data' && $me.loggedIn) { loadSessions(); loadTokens(); }
  });
</script>

<svelte:head><title>Settings · MaowCore</title></svelte:head>

<PageHeader title="Settings" subtitle="Personalize the dashboard and configure your bot" />

<div class="mb-4 flex gap-1 overflow-x-auto rounded-btn bg-surface-2 p-1">
  {#each TABS as t}
    <button class="flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-semibold transition"
      class:bg-accent={tab === t.id} class:text-on-accent={tab === t.id} class:text-muted={tab !== t.id}
      onclick={() => (tab = t.id)}>{t.icon} {t.label}</button>
  {/each}
</div>

<!-- ════════ APPEARANCE ════════ -->
{#if tab === 'appearance'}
  <Card class="mb-6">
    <div class="mb-1 font-display text-lg font-bold">Theme</div>
    <p class="mb-4 text-sm text-muted">{THEMES.length} themes — each changes colors, shapes, fonts, layout, atmosphere, and its own cinematic boot screen.</p>
    <div class="flex flex-wrap items-center gap-4 rounded-card bg-surface-2 p-4">
      <div class="flex gap-1.5">{#each $currentTheme.swatches as c}<span class="h-9 w-9 rounded-full" style="background:{c}"></span>{/each}</div>
      <div class="min-w-0 flex-1">
        <div class="font-display font-bold">{$currentTheme.name}</div>
        <div class="text-xs text-muted">{$currentTheme.tagline}</div>
      </div>
      <a href="{base}/theme-gallery" class="btn-primary">🖼️ Browse all {THEMES.length} themes →</a>
    </div>
  </Card>

  <Card class="mb-6">
    <div class="mb-3 font-display text-lg font-bold">Personalize</div>
    <div class="space-y-4">
      <label class="flex items-center justify-between gap-4">
        <div><div class="text-sm font-medium">Custom accent color</div><div class="text-xs text-muted">Override the theme's accent.</div></div>
        <div class="flex items-center gap-2">
          {#if $prefs.accent}<button class="btn-ghost h-8 px-2 text-xs" onclick={() => setPref('accent', '')}>Reset</button>{/if}
          <input type="color" class="h-9 w-12 rounded-btn border border-border bg-bg-soft" value={$prefs.accent || '#ff3d9a'} onchange={(e) => setPref('accent', e.currentTarget.value)} />
        </div>
      </label>
      <label class="flex items-center justify-between gap-4">
        <div><div class="text-sm font-medium">Density</div><div class="text-xs text-muted">Spacing across the whole UI.</div></div>
        <select class="input max-w-[160px]" value={$prefs.density} onchange={(e) => setPref('density', e.currentTarget.value as any)}>
          <option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option>
        </select>
      </label>
      <div>
        <div class="mb-1 text-sm font-medium">Custom background image</div>
        <input class="input" placeholder="https://image-url… (leave blank for none)" value={$prefs.bgImage} onchange={(e) => setPref('bgImage', e.currentTarget.value)} />
        {#if $prefs.bgImage}
          <div class="mt-2 flex items-center gap-3"><span class="text-xs text-muted">Dim</span>
            <input type="range" min="0" max="90" value={$prefs.bgDim} class="accent-accent flex-1" oninput={(e) => setPref('bgDim', +e.currentTarget.value)} />
            <span class="text-xs tabular-nums text-muted">{$prefs.bgDim}%</span>
          </div>
        {/if}
      </div>
      <label class="flex items-center justify-between gap-4">
        <div><div class="text-sm font-medium">Reduce motion</div><div class="text-xs text-muted">Disable animations & atmosphere.</div></div>
        <input type="checkbox" checked={$prefs.reduceMotion} onchange={(e) => setPref('reduceMotion', e.currentTarget.checked)} />
      </label>
      <label class="flex items-center justify-between gap-4">
        <div><div class="text-sm font-medium">Boot screen</div><div class="text-xs text-muted">Cinematic terminal boot on load.</div></div>
        <input type="checkbox" checked={bootScreen} onchange={toggleBoot} />
      </label>
    </div>
  </Card>

<!-- ════════ THEMES BUILDER ════════ -->
{:else if tab === 'themes'}
  <Card class="mb-6">
    <div class="mb-3 font-display text-lg font-bold">Theme Builder</div>
    <p class="mb-4 text-sm text-muted">Tweak the current theme's colors live, then save it as your own.</p>
    <div class="grid gap-3 sm:grid-cols-3">
      {#each VARS as [v, label]}
        <label class="flex items-center justify-between rounded-btn bg-surface-2 px-3 py-2">
          <span class="text-sm">{label}</span>
          <input type="color" class="h-7 w-10 rounded border border-border" value={curVar(v)} oninput={(e) => tweakVar(v, e.currentTarget.value)} />
        </label>
      {/each}
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-2">
      <input class="input max-w-[200px]" placeholder="Theme name" bind:value={builderName} />
      <button class="btn-primary" onclick={saveTheme}>Save theme</button>
      <button class="btn-ghost" onclick={clearTweaks}>Clear tweaks</button>
      <label class="btn-outline cursor-pointer">Import<input type="file" accept="application/json" class="hidden" onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; f?.text().then((t) => { try { setPref('customThemes', [...$prefs.customThemes, ...JSON.parse(t)]); pushToast('Themes imported', 'success'); } catch { pushToast('Bad file', 'error'); } }); }} /></label>
      {#if $prefs.customThemes.length}<button class="btn-ghost" onclick={exportThemes}>Export all</button>{/if}
    </div>
  </Card>

  {#if $prefs.customThemes.length}
    <Card class="mb-6">
      <div class="mb-3 font-display text-lg font-bold">My Themes</div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each $prefs.customThemes as ct (ct.id)}
          <div class="card p-3">
            <div class="mb-2 flex gap-1.5">{#each Object.values(ct.vars).slice(0, 4) as c}<span class="h-5 w-5 rounded-full" style="background:{c}"></span>{/each}</div>
            <div class="font-display font-bold">{ct.name}</div>
            <div class="mt-2 flex gap-1">
              <button class="btn-primary h-7 flex-1 text-xs" onclick={() => applyCustom(ct)}>Apply</button>
              <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => deleteCustom(ct.id)}>✕</button>
            </div>
          </div>
        {/each}
      </div>
    </Card>
  {/if}

  <Card>
    <label class="flex items-center justify-between gap-4">
      <div><div class="text-sm font-medium">Auto theme (day / night)</div><div class="text-xs text-muted">Light theme by day, dark by night.</div></div>
      <input type="checkbox" checked={$prefs.autoTheme === 'daynight'} onchange={(e) => setPref('autoTheme', e.currentTarget.checked ? 'daynight' : 'off')} />
    </label>
  </Card>

<!-- ════════ ACCESSIBILITY ════════ -->
{:else if tab === 'access'}
  <Card>
    <div class="mb-3 font-display text-lg font-bold">Accessibility</div>
    <div class="space-y-4">
      <label class="flex items-center justify-between gap-4"><div><div class="text-sm font-medium">High-contrast mode</div><div class="text-xs text-muted">Stronger text & borders.</div></div><input type="checkbox" checked={$prefs.highContrast} onchange={(e) => setPref('highContrast', e.currentTarget.checked)} /></label>
      <div>
        <div class="mb-1 flex items-center justify-between"><span class="text-sm font-medium">Font size</span><span class="text-xs tabular-nums text-muted">{Math.round($prefs.fontScale * 100)}%</span></div>
        <input type="range" min="0.85" max="1.3" step="0.05" value={$prefs.fontScale} class="accent-accent w-full" oninput={(e) => setPref('fontScale', +e.currentTarget.value)} />
      </div>
      <label class="flex items-center justify-between gap-4"><div><div class="text-sm font-medium">Dyslexia-friendly font</div><div class="text-xs text-muted">Atkinson Hyperlegible typeface.</div></div><input type="checkbox" checked={$prefs.dyslexiaFont} onchange={(e) => setPref('dyslexiaFont', e.currentTarget.checked)} /></label>
      <label class="flex items-center justify-between gap-4"><div><div class="text-sm font-medium">Always-visible focus</div><div class="text-xs text-muted">Strong keyboard-focus outlines.</div></div><input type="checkbox" checked={$prefs.focusOutlines} onchange={(e) => setPref('focusOutlines', e.currentTarget.checked)} /></label>
    </div>
  </Card>

<!-- ════════ BEHAVIOR ════════ -->
{:else if tab === 'behavior'}
  <Card>
    <div class="mb-3 font-display text-lg font-bold">Behavior</div>
    <div class="space-y-4">
      <label class="flex items-center justify-between gap-4">
        <div><div class="text-sm font-medium">Default landing page</div><div class="text-xs text-muted">Opens on load.</div></div>
        <select class="input max-w-[200px]" value={$prefs.landingPage} onchange={(e) => setPref('landingPage', e.currentTarget.value)}>
          {#each ALL_PAGES as p}<option value={p.href}>{p.label}</option>{/each}
        </select>
      </label>
      <label class="flex items-center justify-between gap-4">
        <div><div class="text-sm font-medium">Confirm destructive actions</div><div class="text-xs text-muted">Show confirm dialogs for deletes/bans/restart.</div></div>
        <input type="checkbox" checked={$prefs.confirmActions} onchange={(e) => setPref('confirmActions', e.currentTarget.checked)} />
      </label>
      <label class="flex items-center justify-between gap-4">
        <div><div class="text-sm font-medium">Clock format</div></div>
        <select class="input max-w-[140px]" value={$prefs.timeFormat} onchange={(e) => setPref('timeFormat', e.currentTarget.value as any)}><option value="24">24-hour</option><option value="12">12-hour</option></select>
      </label>
      <label class="flex items-center justify-between gap-4">
        <div><div class="text-sm font-medium">Timestamps</div></div>
        <select class="input max-w-[140px]" value={$prefs.timestamps} onchange={(e) => setPref('timestamps', e.currentTarget.value as any)}><option value="relative">Relative</option><option value="absolute">Absolute</option></select>
      </label>
    </div>
  </Card>

<!-- ════════ NOTIFICATIONS ════════ -->
{:else if tab === 'notifs'}
  <Card>
    <div class="mb-3 font-display text-lg font-bold">Notifications & Sound</div>
    <div class="space-y-4">
      <label class="flex items-center justify-between gap-4"><div><div class="text-sm font-medium">UI sound effects</div><div class="text-xs text-muted">Subtle blips on actions.</div></div><input type="checkbox" checked={$prefs.sounds} onchange={(e) => setPref('sounds', e.currentTarget.checked)} /></label>
      {#if $prefs.sounds}
        <div class="flex items-center gap-3"><span class="text-xs text-muted">Volume</span><input type="range" min="0" max="1" step="0.05" value={$prefs.soundVolume} class="accent-accent flex-1" oninput={(e) => setPref('soundVolume', +e.currentTarget.value)} /></div>
      {/if}
      <label class="flex items-center justify-between gap-4"><div><div class="text-sm font-medium">Now-playing notifications</div><div class="text-xs text-muted">Toast + desktop when a new track starts.</div></div><input type="checkbox" checked={$prefs.notifyNowPlaying} onchange={(e) => { setPref('notifyNowPlaying', e.currentTarget.checked); if (e.currentTarget.checked) Notification?.requestPermission(); }} /></label>
      <label class="flex items-center justify-between gap-4"><div><div class="text-sm font-medium">Error alerts</div><div class="text-xs text-muted">Notify when the bot logs an error.</div></div><input type="checkbox" checked={$prefs.notifyErrors} onchange={(e) => setPref('notifyErrors', e.currentTarget.checked)} /></label>
    </div>
    <p class="mt-4 text-xs text-muted">The in-app toast feed appears bottom-right automatically.</p>
  </Card>

<!-- ════════ NAVIGATION ════════ -->
{:else if tab === 'nav'}
  <Card class="mb-6">
    <div class="mb-3 font-display text-lg font-bold">Branding</div>
    <div class="grid gap-3 sm:grid-cols-2">
      <div><div class="mb-1 text-sm font-medium">Brand name</div><input class="input" value={$prefs.brandName} onchange={(e) => setPref('brandName', e.currentTarget.value)} /></div>
      <div><div class="mb-1 text-sm font-medium">Brand icon</div><input class="input" maxlength="2" value={$prefs.brandIcon} onchange={(e) => setPref('brandIcon', e.currentTarget.value)} /></div>
    </div>
  </Card>
  <Card>
    <div class="mb-3 font-display text-lg font-bold">Sidebar pages</div>
    <p class="mb-3 text-xs text-muted">Hide pages you don't use, or pin favorites to the top. Press <kbd class="rounded bg-surface-2 px-1">Ctrl/⌘ + K</kbd> anywhere for the command palette.</p>
    <div class="space-y-1">
      {#each ALL_PAGES as p}
        <div class="flex items-center gap-3 rounded-btn px-2 py-1.5 hover:bg-surface-2">
          <span class="w-5 text-center">{p.icon}</span>
          <span class="flex-1 text-sm">{p.label}</span>
          <button class="text-xs {($prefs.navPinned ?? []).includes(p.href) ? 'text-accent' : 'text-muted'}" title="Pin" onclick={() => togglePinned(p.href)}>📌</button>
          <button class="text-xs {($prefs.navHidden ?? []).includes(p.href) ? 'text-danger' : 'text-muted'}" title="Hide" onclick={() => toggleHidden(p.href)}>{($prefs.navHidden ?? []).includes(p.href) ? '🚫' : '👁'}</button>
        </div>
      {/each}
    </div>
  </Card>

<!-- ════════ PLAYER & BOT ════════ -->
{:else if tab === 'bot'}
  <div class="mb-4 flex justify-end"><GuildPicker /></div>
  {#if !bot}
    <Card><p class="text-sm text-muted">Loading server config…</p></Card>
  {:else}
    <Card>
      <div class="mb-3 font-display text-lg font-bold">Player & Bot — this server</div>
      <div class="space-y-4">
        <div><div class="mb-1 flex justify-between text-sm font-medium"><span>Default volume</span><span class="text-muted">{bot.volume}%</span></div><input type="range" min="0" max="150" bind:value={bot.volume} class="accent-accent w-full" /></div>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex items-center justify-between rounded-btn bg-surface-2 px-3 py-2.5"><span class="text-sm">24/7 stay in voice</span><input type="checkbox" bind:checked={bot.stay247} /></label>
          <label class="flex items-center justify-between rounded-btn bg-surface-2 px-3 py-2.5"><span class="text-sm">SponsorBlock</span><input type="checkbox" bind:checked={bot.sponsorblock} /></label>
          <label class="flex items-center justify-between rounded-btn bg-surface-2 px-3 py-2.5"><span class="text-sm">DJ-only controls</span><input type="checkbox" bind:checked={bot.djOnly} /></label>
          <label class="flex items-center justify-between rounded-btn bg-surface-2 px-3 py-2.5"><span class="text-sm">Announce now-playing</span><input type="checkbox" bind:checked={bot.announceNowPlaying} /></label>
          <label class="flex items-center justify-between rounded-btn bg-surface-2 px-3 py-2.5"><span class="text-sm">Anonymous requesters</span><input type="checkbox" bind:checked={bot.hideRequester} /></label>
          <label class="flex items-center justify-between rounded-btn bg-surface-2 px-3 py-2.5"><span class="text-sm">Prevent duplicate songs</span><input type="checkbox" bind:checked={bot.preventDuplicates} /></label>
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <div><div class="mb-1 text-sm font-medium">Prefix</div><input class="input" bind:value={bot.prefix} /></div>
          <div><div class="mb-1 text-sm font-medium">Language</div><select class="input" bind:value={bot.language}><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option></select></div>
          <div><div class="mb-1 text-sm font-medium">Max queue (0 = ∞)</div><input type="number" class="input" bind:value={bot.maxQueue} /></div>
        </div>
        <div><div class="mb-1 text-sm font-medium">Vote-skip threshold (% of listeners, 0 = off)</div><input type="number" min="0" max="100" class="input max-w-[160px]" bind:value={bot.voteSkip} /></div>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <button class="btn-primary" onclick={saveBot}>Save server settings</button>
        {#if botSaved}<span class="text-sm text-success">✓ Saved</span>{/if}
      </div>
      <p class="mt-2 text-[11px] text-muted">Some rules (vote-skip, max-queue, dj-only) are stored now and enforced by the bot as those features ship.</p>
    </Card>
  {/if}

<!-- ════════ INTEGRATIONS ════════ -->
{:else if tab === 'integrations'}
  <Card class="mb-6">
    <div class="mb-3 font-display text-lg font-bold">🎭 Bot Presence</div>
    {#if presence}
      <div class="space-y-4">
        <div class="flex items-center gap-2 text-sm">
          <span class="h-2.5 w-2.5 rounded-full {presence.enabled ? 'bg-success' : 'bg-muted'}"></span>
          {presence.enabled ? 'Custom presence is active' : 'Using default presence — click Apply to enable yours'}
        </div>
        <div class="grid gap-3 sm:grid-cols-3">
          <div><div class="mb-1 text-sm font-medium">Status</div>
            <select class="input" bind:value={presence.status}><option value="online">🟢 Online</option><option value="idle">🌙 Idle</option><option value="dnd">⛔ Do Not Disturb</option><option value="invisible">⚫ Invisible</option></select>
          </div>
          <div><div class="mb-1 text-sm font-medium">Activity</div>
            <select class="input" bind:value={presence.type}><option>Playing</option><option>Listening</option><option>Watching</option><option>Competing</option></select>
          </div>
          <div><div class="mb-1 text-sm font-medium">Text</div><input class="input" placeholder="cosmic transmissions" bind:value={presence.text} /></div>
        </div>
        <label class="flex items-center justify-between gap-4">
          <div><div class="text-sm font-medium">Static mode</div><div class="text-xs text-muted">Always show this text (don't switch to the current song).</div></div>
          <input type="checkbox" checked={presence.staticMode} onchange={(e) => (presence.staticMode = e.currentTarget.checked)} />
        </label>
        <div class="rounded-card border border-border bg-bg-soft p-3 text-sm">
          Preview: <span class="text-muted">{presence.type}</span> <strong>{presence.text || 'cosmic transmissions · /help'}</strong>
        </div>
        <div class="flex items-center gap-3">
          <button class="btn-primary" onclick={() => { presence.enabled = true; savePresence(); }}>Apply presence</button>
          {#if presence.enabled}<button class="btn-ghost" onclick={() => { presence.enabled = false; savePresence(); }}>Reset to default</button>{/if}
          {#if presenceSaved}<span class="text-sm text-success">✓ Applied</span>{/if}
        </div>
        <p class="text-[11px] text-muted">When playing music the bot shows the current song; your custom text shows while idle (or always, with Static mode on).</p>
      </div>
    {:else}<p class="text-sm text-muted">Loading…</p>{/if}
  </Card>

  <Card>
    <div class="mb-3 font-display text-lg font-bold">🎵 Last.fm Scrobbling</div>
    {#if lastfm}
      <div class="mb-3 flex items-center gap-2 text-sm">
        <span class="h-2.5 w-2.5 rounded-full {lastfm.enabled ? 'bg-success' : 'bg-muted'}"></span>
        {lastfm.enabled ? 'Connected & scrobbling' : 'Not fully configured'}
        {#if lastfm.apiKeyPreview && lastfm.hasApiKey}<span class="text-muted">· key {lastfm.apiKeyPreview}</span>{/if}
      </div>
    {/if}
    <form class="space-y-2" autocomplete="off" onsubmit={(e) => { e.preventDefault(); saveLastfm(); }}>
      <input class="input" placeholder="API key" autocomplete="off" bind:value={lastfmForm.apiKey} />
      <input class="input" placeholder="API secret" type="password" autocomplete="new-password" bind:value={lastfmForm.apiSecret} />
      <input class="input" placeholder="Session key" type="password" autocomplete="new-password" bind:value={lastfmForm.sessionKey} />
      <button class="btn-primary" type="submit">Save Last.fm credentials</button>
    </form>
    <p class="mt-2 text-[11px] text-muted">Get keys at <a class="text-accent hover:underline" href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">last.fm/api</a>. Stored on the bot host; existing fields are left unchanged if blank.</p>
  </Card>

<!-- ════════ ACCOUNT & DATA ════════ -->
{:else if tab === 'data'}
  <Card class="mb-6">
    <div class="mb-3 font-display text-lg font-bold">Account</div>
    {#if $me.loggedIn}
      <div class="flex items-center gap-3">
        {#if $me.avatar}<img src={$me.avatar} alt="" class="h-12 w-12 rounded-full" />{/if}
        <div class="flex-1"><div class="font-semibold">{$me.username}</div><div class="text-xs capitalize text-muted">Rank: {$me.rank ?? 'member'}</div></div>
        <button class="btn-outline" onclick={logout}>Sign out</button>
      </div>
    {:else}
      <button class="btn-primary" onclick={startLogin}>Sign in with Discord</button>
    {/if}
  </Card>

  {#if $me.loggedIn}
    <Card class="mb-6">
      <div class="mb-3 font-display text-lg font-bold">Profile</div>
      <div class="space-y-3">
        <div><div class="mb-1 text-sm font-medium">Bio</div><textarea class="input min-h-20" bind:value={profile.bio}></textarea></div>
        <div><div class="mb-1 text-sm font-medium">Favorite song</div><input class="input" bind:value={profile.favoriteSong} /></div>
        <button class="btn-primary" onclick={saveProfile}>Save profile</button>
      </div>
    </Card>
  {/if}

  {#if $me.loggedIn}
    <Card class="mb-6">
      <div class="mb-3 flex items-center justify-between">
        <span class="font-display text-lg font-bold">Active sessions</span>
        {#if sessions.length > 1}<button class="btn-ghost h-8 px-2 text-xs" onclick={revokeAllSessions}>Sign out others</button>{/if}
      </div>
      {#if sessions.length === 0}<p class="text-sm text-muted">No active sessions.</p>{:else}
        <div class="space-y-1">
          {#each sessions as s (s.id)}
            <div class="flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2 text-sm">
              <span>🔑</span>
              <div class="min-w-0 flex-1"><div class="truncate font-mono text-xs">{s.id}…</div><div class="text-[11px] text-muted">created {new Date(s.createdAt).toLocaleString()}</div></div>
              {#if s.current}<span class="pill bg-accent/20 text-accent text-[9px]">this device</span>{:else}<button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => revokeSession(s.id)}>Revoke</button>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </Card>

    <Card class="mb-6">
      <div class="mb-3 font-display text-lg font-bold">API tokens</div>
      <p class="mb-3 text-xs text-muted">Personal tokens to script against the bot's API. Send as the <code class="rounded bg-surface-2 px-1">X-Api-Token</code> header.</p>
      {#if newTokenValue}
        <div class="mb-3 rounded-card border border-success/40 bg-success/10 p-3">
          <div class="text-xs font-semibold text-success">New token — copy it now, it won't be shown again:</div>
          <div class="mt-1 flex items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded bg-bg-soft px-2 py-1 text-xs">{newTokenValue}</code>
            <button class="btn-ghost h-7 px-2 text-xs" onclick={() => { navigator.clipboard.writeText(newTokenValue); pushToast('Copied', 'success'); }}>Copy</button>
            <button class="btn-ghost h-7 px-2 text-xs" onclick={() => (newTokenValue = '')}>✕</button>
          </div>
        </div>
      {/if}
      <div class="mb-3 flex gap-2">
        <input class="input" placeholder="Token name (e.g. my-script)" bind:value={newTokenName} />
        <button class="btn-primary" onclick={createToken}>Generate</button>
      </div>
      {#if tokens.length}
        <div class="space-y-1">
          {#each tokens as t (t.id)}
            <div class="flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2 text-sm">
              <div class="min-w-0 flex-1"><div class="truncate font-medium">{t.name}</div><div class="font-mono text-[11px] text-muted">{t.prefix} · {new Date(t.createdAt).toLocaleDateString()}{t.lastUsedAt ? ` · used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ''}</div></div>
              <button class="btn-ghost h-7 px-2 text-xs text-danger" onclick={() => revokeToken(t.id)}>Revoke</button>
            </div>
          {/each}
        </div>
      {/if}
    </Card>

    <Card class="mb-6">
      <div class="mb-1 font-display text-lg font-bold">Sync settings to account</div>
      <p class="mb-3 text-xs text-muted">Store your dashboard settings on the bot so they follow you across devices.</p>
      <div class="flex gap-2">
        <button class="btn-ghost" onclick={syncUp}>⬆ Sync to account</button>
        <button class="btn-ghost" onclick={syncDown}>⬇ Restore from account</button>
      </div>
    </Card>
  {/if}

  <Card class="mb-6">
    <div class="mb-3 font-display text-lg font-bold">Preferences backup</div>
    <div class="flex flex-wrap gap-2">
      <button class="btn-ghost" onclick={doExport}>⬇ Export settings</button>
      <label class="btn-ghost cursor-pointer">⬆ Import settings<input type="file" accept="application/json" class="hidden" onchange={doImport} /></label>
      <button class="btn-ghost" onclick={doReset}>↺ Reset to defaults</button>
      <button class="btn-ghost text-danger" onclick={clearLocal}>🗑 Clear local data</button>
    </div>
  </Card>

  <Card>
    <div class="mb-3 font-display text-lg font-bold">Experimental features</div>
    <div class="space-y-2">
      {#each [['liveWaveform', 'Live audio waveform'], ['denseTables', 'Denser data tables'], ['betaCharts', 'Beta chart styles']] as [key, label]}
        <label class="flex items-center justify-between rounded-btn bg-surface-2 px-3 py-2"><span class="text-sm">{label}</span><input type="checkbox" checked={$prefs.experimental?.[key]} onchange={(e) => setPref('experimental', { ...$prefs.experimental, [key]: e.currentTarget.checked })} /></label>
      {/each}
    </div>
    <p class="mt-2 text-[11px] text-muted">Flags for upcoming features — toggles are saved; behavior lands as features ship.</p>
  </Card>
{/if}
