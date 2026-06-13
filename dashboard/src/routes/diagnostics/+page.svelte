<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { liveState, wsConnected, logEntries, statsHistory, type LogEntry } from '$lib/ws';
  import Card from '$lib/components/Card.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import MiniChart from '$lib/components/MiniChart.svelte';
  import { fmtBytes, fmtDuration, fmtNumber, fmtRelative } from '$lib/format';

  type Tab = 'overview' | 'voice' | 'activity' | 'audio' | 'data' | 'console' | 'controls';
  let tab = $state<Tab>('overview');
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'voice', label: 'Voice & Net', icon: '🔊' },
    { id: 'activity', label: 'Activity', icon: '📈' },
    { id: 'audio', label: 'Audio', icon: '🎚️' },
    { id: 'data', label: 'Data', icon: '🗄️' },
    { id: 'console', label: 'Console', icon: '📟' },
    { id: 'controls', label: 'Controls', icon: '🎛️' },
  ];

  // ── Live (WS) ────────────────────────────────────────────────────────────
  let stats = $derived($liveState.stats ?? {});
  let sys = $derived(stats.system ?? {});
  let proc = $derived(stats.process ?? {});
  let disc = $derived(stats.discord ?? {});
  let disk = $derived(stats.disk ?? null);
  let diag = $derived($liveState.diagnostics ?? {});
  let queues = $derived($liveState.queues ?? []);

  let memPct = $derived(sys.memTotal ? Math.round((sys.memUsed / sys.memTotal) * 100) : 0);
  // Heap % is against the true V8 ceiling (heapLimit), not the currently-grown
  // heapTotal — otherwise it reads ~90% when there's actually tons of headroom.
  let heapPct = $derived(
    proc.heapLimit ? Math.round((proc.heapUsed / proc.heapLimit) * 100)
      : proc.heapTotal ? Math.round((proc.heapUsed / proc.heapTotal) * 100) : 0,
  );
  let diskPct = $derived(disk?.total ? Math.round(((disk.total - disk.free) / disk.total) * 100) : 0);
  let cpuSeries = $derived($statsHistory.map((s) => s.cpu));
  let memSeries = $derived($statsHistory.map((s) => s.mem));
  let heapSeries = $derived($statsHistory.map((s) => s.heap));

  let health = $state<any>({});

  // ── Fetched-per-tab state ────────────────────────────────────────────────
  let commands = $state<any[]>([]);
  let rateLimits = $state<any>({ total: 0, recent: [] });
  let versions = $state<any>(null);
  let dbstats = $state<any>(null);
  let scheduled = $state<any>({ crons: [], subs: [], backups: [] });
  let plugins = $state<any[]>([]);
  let integrations = $state<any>(null);
  let errorBudget = $state<any>(null);
  let restartHistory = $state<any[]>([]);
  let speedtest = $state<any>(null);
  let busy = $state('');

  async function loadTab(t: Tab) {
    try {
      if (t === 'activity') {
        commands = (await api.get<any>('/api/diag/commands')).commands ?? [];
        rateLimits = await api.get<any>('/api/diag/ratelimits');
      } else if (t === 'data') {
        versions = await api.get<any>('/api/diag/versions').catch(() => null);
        dbstats = await api.get<any>('/api/diag/dbstats').catch(() => null);
        const [auto, subs, backups, pl, integ, budget] = await Promise.all([
          api.get<any>('/api/automation/list').catch(() => ({})),
          api.get<any>('/api/admin/playlist-subs').catch(() => ({})),
          api.get<any>('/api/backup/list').catch(() => ({})),
          api.get<any>('/api/dev/plugins').catch(() => ({})),
          api.get<any>('/api/integrations/status').catch(() => null),
          api.get<any>('/api/observability/status').catch(() => null),
        ]);
        scheduled = { crons: auto.crons ?? [], subs: subs.subs ?? subs.subscriptions ?? [], backups: backups.snapshots ?? [] };
        plugins = pl.plugins ?? [];
        integrations = integ;
        errorBudget = budget;
      } else if (t === 'console') {
        restartHistory = (await api.get<any>('/api/diag/restart-history')).events ?? [];
      }
    } catch (e) {
      console.warn('[diag] tab load failed', e);
    }
  }

  $effect(() => { loadTab(tab); });
  onMount(async () => { try { health = await api.get<any>('/api/health'); } catch { /* */ } });

  // ── Controls ─────────────────────────────────────────────────────────────
  async function ctl(path: string, confirmMsg: string, label: string) {
    if (!confirm(confirmMsg)) return;
    busy = label;
    try {
      const r = await api.post<any>(path, {});
      alert(r.message || `${label}: done${r.freedBytes ? ` (freed ${fmtBytes(r.freedBytes)})` : ''}`);
    } catch (e) {
      alert(`${label} failed: ${(e as Error).message}`);
    } finally {
      busy = '';
    }
  }
  async function runSpeedtest() {
    busy = 'speedtest';
    speedtest = null;
    try {
      // Ping: median round-trip to the bot's own health endpoint.
      const pings: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        await fetch('/api/health', { cache: 'no-store' });
        pings.push(performance.now() - t);
      }
      const pingMs = Math.round(pings.sort((a, b) => a - b)[2]);

      // Download: pull ~8 MB from Cloudflare's speed endpoint and measure.
      const t0 = performance.now();
      const resp = await fetch('https://speed.cloudflare.com/__down?bytes=8000000', { cache: 'no-store' });
      const buf = await resp.arrayBuffer();
      const secs = (performance.now() - t0) / 1000;
      const downloadMbps = (buf.byteLength * 8) / 1e6 / secs;

      speedtest = { downloadMbps, pingMs, uploadMbps: null };
      // Persist the result to the bot so it shows in the classic view too.
      api.post('/api/admin/speedtest', { tool: 'browser', downloadMbps, pingMs }).catch(() => {});
    } catch (e) {
      alert(`Speedtest failed: ${(e as Error).message}`);
    } finally {
      busy = '';
    }
  }

  // ── Diagnostic report export ─────────────────────────────────────────────
  function exportReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      health, system: sys, process: proc, discord: disc, disk,
      diagnostics: diag, versions, dbstats,
      recentErrors: diag.recentErrors,
      logTail: $logEntries.slice(-100),
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    a.download = `maowcore-diagnostic-${Date.now()}.json`;
    a.click();
  }

  // ── Desktop error alerts ─────────────────────────────────────────────────
  let alertsOn = $state(false);
  let lastAlertTs = 0;
  onMount(() => { alertsOn = localStorage.getItem('maow.v2.deskalerts') === 'on'; });
  async function toggleAlerts() {
    if (!alertsOn) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { alert('Notification permission denied.'); return; }
    }
    alertsOn = !alertsOn;
    localStorage.setItem('maow.v2.deskalerts', alertsOn ? 'on' : 'off');
  }
  $effect(() => {
    if (!alertsOn) return;
    const latest = $logEntries[$logEntries.length - 1];
    if (latest && latest.level === 'error' && latest.ts > lastAlertTs) {
      lastAlertTs = latest.ts;
      try { new Notification('MaowCore — error', { body: latest.text.slice(0, 160) }); } catch { /* */ }
    }
  });

  // ── Console controls (live log) ──────────────────────────────────────────
  let levelFilter = $state<'all' | 'warn' | 'error'>('all');
  let search = $state('');
  let consoleEl = $state<HTMLDivElement | null>(null);
  let shown = $derived(
    $logEntries.filter((e) => {
      if (levelFilter === 'error' && e.level !== 'error') return false;
      if (levelFilter === 'warn' && e.level !== 'warn' && e.level !== 'error') return false;
      if (search && !e.text.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
  );
  $effect(() => { shown.length; if (consoleEl) consoleEl.scrollTop = consoleEl.scrollHeight; });

  const CAT_COLOR: Record<string, string> = {
    startup: '#9d5cff', discord: '#5865F2', command: '#21e6c1', search: '#ffd23f',
    play: '#ff3d9a', voice: '#3ce6a6', install: '#ff8c42', upload: '#ff8c42',
    library: '#00CED1', http: '#8b8b92', ws: '#8b8b92', system: '#b794d6',
  };
  const LEVEL_COLOR: Record<string, string> = {
    error: 'var(--danger)', warn: 'var(--warn)', success: 'var(--success)', info: 'var(--muted)',
  };
  const HEALTH_DOT: Record<string, string> = { ok: 'bg-success', degraded: 'bg-warn', down: 'bg-danger' };
  const BOOT_ICON: Record<string, string> = { ok: '✓', fail: '✕', running: '⏱', skip: '–', pending: '◌' };

  // Pipeline nodes mapped to health subsystems.
  let pipeline = $derived([
    { name: 'Discord', key: 'discord', icon: '🛰️' },
    { name: 'DisTube', key: 'distube', icon: '🎶' },
    { name: 'yt-dlp', key: 'ytdlp', icon: '⬇️' },
    { name: 'ffmpeg', key: 'ffmpeg', icon: '🎬' },
    { name: 'Voice', key: 'voice', icon: '🔊' },
  ].map((n) => ({ ...n, status: diag.health?.[n.key] ?? 'ok' })));

  function tsLabel(t: number) {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }
  const voiceBwKbps = $derived((disc.voiceConnections ?? 0) * 256);
</script>

<svelte:head><title>Diagnostics · MaowCore</title></svelte:head>

<PageHeader title="Diagnostics" subtitle="Live system, runtime & event telemetry">
  {#snippet actions()}
    <span class="pill border border-border bg-surface">
      <span class="h-2 w-2 rounded-full {$wsConnected ? 'bg-success' : 'bg-warn animate-pulse-glow'}"></span>
      {$wsConnected ? 'live' : 'reconnecting'}
    </span>
  {/snippet}
</PageHeader>

<!-- Tabs -->
<div class="mb-4 flex gap-1 overflow-x-auto rounded-btn bg-surface-2 p-1">
  {#each TABS as t}
    <button
      class="flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-semibold transition"
      class:bg-accent={tab === t.id}
      class:text-on-accent={tab === t.id}
      class:text-muted={tab !== t.id}
      onclick={() => (tab = t.id)}
    >{t.icon} {t.label}</button>
  {/each}
</div>

<!-- ════════════════════════ OVERVIEW ════════════════════════ -->
{#if tab === 'overview'}
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {#each [['CPU', Math.round(sys.cpuPct ?? 0), '🖥️'], ['Memory', memPct, '💾'], ['Heap', heapPct, '🔥'], ['Disk', diskPct, '🗄️']] as [label, pct, icon]}
      <Card padding="p-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
          <span class="opacity-70">{icon}</span>
        </div>
        <div class="mt-1 font-display text-2xl font-extrabold">{pct}%</div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-2">
          <div class="h-full rounded-pill transition-all duration-700" style="width:{Math.min(100, pct as number)}%; background-image: linear-gradient(90deg, var(--accent), {(pct as number) > 85 ? 'var(--danger)' : 'var(--accent-3)'})"></div>
        </div>
      </Card>
    {/each}
  </div>

  <!-- History charts -->
  <Card class="mt-6">
    <div class="mb-3 font-display text-lg font-bold">Live history <span class="text-xs font-normal text-muted">· last ~4 min</span></div>
    <div class="grid gap-6 sm:grid-cols-3">
      <MiniChart data={cpuSeries} label="CPU" color="var(--accent)" />
      <MiniChart data={memSeries} label="Memory" color="var(--accent-3)" />
      <MiniChart data={heapSeries} label="Heap" color="var(--accent-2)" />
    </div>
  </Card>

  <!-- Pipeline -->
  <Card class="mt-6">
    <div class="mb-4 font-display text-lg font-bold">🔗 Audio Pipeline</div>
    <div class="flex flex-wrap items-center gap-2">
      {#each pipeline as node, i}
        <div class="flex flex-col items-center gap-1 rounded-card border border-border bg-surface-2 px-4 py-3">
          <span class="text-xl">{node.icon}</span>
          <span class="text-xs font-semibold">{node.name}</span>
          <span class="h-2 w-2 rounded-full {HEALTH_DOT[node.status]} {node.status === 'down' ? 'animate-pulse-glow' : ''}"></span>
        </div>
        {#if i < pipeline.length - 1}<span class="text-muted">→</span>{/if}
      {/each}
    </div>
  </Card>

  <div class="mt-6 grid gap-6 lg:grid-cols-2">
    <Card>
      <div class="mb-3 font-display text-lg font-bold">🖥️ System</div>
      <dl class="space-y-1.5 text-sm">
        {#each [['Platform', `${sys.platform ?? '—'} ${sys.release ?? ''} (${sys.arch ?? '—'})`], ['Hostname', sys.hostname ?? '—'], ['CPU', sys.cpuModel ?? '—'], ['Cores', `${sys.cpus ?? '—'} @ ${sys.cpuSpeedMHz ?? 0} MHz`], ['Total RAM', fmtBytes(sys.memTotal)], ['Disk', disk ? `${fmtBytes(disk.total - disk.free)} / ${fmtBytes(disk.total)}` : 'n/a'], ['OS uptime', fmtDuration(sys.uptime)]] as [k, v]}
          <div class="flex justify-between gap-4 border-b border-border/50 pb-1.5"><dt class="text-muted">{k}</dt><dd class="truncate text-right font-medium">{v}</dd></div>
        {/each}
      </dl>
    </Card>
    <Card>
      <div class="mb-3 font-display text-lg font-bold">⚙️ Runtime</div>
      <dl class="space-y-1.5 text-sm">
        {#each [['Bot', health.botTag ?? '—'], ['Version', `v${health.version ?? '—'}`], ['Node.js', proc.nodeVersion ?? '—'], ['Uptime', fmtDuration(proc.uptime)], ['Heap', `${fmtBytes(proc.heapUsed)} / ${fmtBytes(proc.heapLimit ?? proc.heapTotal)}`], ['Event-loop lag', proc.eventLoopLagMs != null ? `${proc.eventLoopLagMs.toFixed(2)} ms` : '—'], ['Servers / Users', `${fmtNumber(disc.guilds)} / ${fmtNumber(disc.users)}`], ['Gateway ping', $liveState.ping?.websocket != null ? `${$liveState.ping.websocket} ms` : '—']] as [k, v]}
          <div class="flex justify-between gap-4 border-b border-border/50 pb-1.5"><dt class="text-muted">{k}</dt><dd class="truncate text-right font-medium">{v}</dd></div>
        {/each}
      </dl>
    </Card>
  </div>

  <div class="mt-6 grid gap-6 lg:grid-cols-2">
    <Card>
      <div class="mb-3 font-display text-lg font-bold">🩺 Subsystem Health</div>
      {#if diag.health}
        <div class="grid grid-cols-2 gap-2">
          {#each Object.entries(diag.health) as [name, st]}
            <div class="flex items-center gap-2 rounded-btn bg-surface-2 px-3 py-2 text-sm">
              <span class="h-2.5 w-2.5 rounded-full {HEALTH_DOT[st as string]}"></span>
              <span class="capitalize">{name}</span><span class="ml-auto text-[11px] capitalize text-muted">{st}</span>
            </div>
          {/each}
        </div>
      {/if}
    </Card>
    <Card>
      <div class="mb-3 font-display text-lg font-bold">🚀 Boot Timeline</div>
      {#if diag.boot}
        <ul class="space-y-0.5 text-sm">
          {#each diag.boot as step}
            <li class="flex items-center gap-3 rounded-btn px-2 py-1">
              <span class="w-4 text-center font-bold {step.status === 'ok' ? 'text-success' : step.status === 'fail' ? 'text-danger' : 'text-muted'}">{BOOT_ICON[step.status] ?? '◌'}</span>
              <span class="flex-1">{step.label}</span>
              {#if step.durationMs != null}<span class="text-[11px] tabular-nums text-muted">{step.durationMs}ms</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  </div>

<!-- ════════════════════════ VOICE & NETWORK ════════════════════════ -->
{:else if tab === 'voice'}
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {#each [['Voice connections', disc.voiceConnections ?? 0, '🔊'], ['Active queues', disc.activeQueues ?? 0, '🎶'], ['Est. voice bandwidth', `${voiceBwKbps} kbps`, '📡'], ['Gateway ping', $liveState.ping?.websocket != null ? `${$liveState.ping.websocket} ms` : '—', '🏓']] as [label, val, icon]}
      <Card padding="p-4">
        <div class="flex items-center justify-between"><span class="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span><span class="opacity-70">{icon}</span></div>
        <div class="mt-1 font-display text-xl font-extrabold">{val}</div>
      </Card>
    {/each}
  </div>

  <Card class="mt-6">
    <div class="mb-3 font-display text-lg font-bold">Active voice sessions</div>
    {#if queues.length === 0}
      <p class="text-sm text-muted">No active voice connections.</p>
    {:else}
      <div class="space-y-2">
        {#each queues as q (q.guildId)}
          <div class="flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2.5">
            {#if q.currentSong?.thumbnail}<img src={q.currentSong.thumbnail} alt="" class="h-10 w-10 shrink-0 rounded-md object-cover" />{:else}<div class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-bg-soft">🎵</div>{/if}
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{q.guildName}</div>
              <div class="truncate text-[11px] text-muted">🔊 {q.voiceChannelName ?? '—'} · {q.currentSong?.name ?? 'idle'}</div>
            </div>
            <span class="pill bg-bg-soft text-muted">{q.paused ? '⏸ paused' : '▶ playing'}</span>
            <span class="pill bg-bg-soft text-muted">vol {q.volume ?? 100}%</span>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card class="mt-6">
    <div class="mb-3 font-display text-lg font-bold">Network</div>
    <dl class="space-y-1.5 text-sm">
      {#each [['Est. voice bandwidth', `${voiceBwKbps} kbps (≈${(voiceBwKbps / 8 / 1024).toFixed(2)} MB/s)`], ['Gateway (WS) ping', $liveState.ping?.websocket != null ? `${$liveState.ping.websocket} ms` : '—'], ['REST ping', $liveState.ping?.rest != null ? `${$liveState.ping.rest} ms` : '—'], ['Event-loop lag', proc.eventLoopLagMs != null ? `${proc.eventLoopLagMs.toFixed(2)} ms` : '—']] as [k, v]}
        <div class="flex justify-between gap-4 border-b border-border/50 pb-1.5"><dt class="text-muted">{k}</dt><dd class="text-right font-medium">{v}</dd></div>
      {/each}
    </dl>
    <p class="mt-2 text-[11px] text-muted">Voice bandwidth is estimated at ≈256 kbps per active connection.</p>
  </Card>

<!-- ════════════════════════ ACTIVITY ════════════════════════ -->
{:else if tab === 'activity'}
  <Card>
    <div class="mb-3 font-display text-lg font-bold">⌘ Command Analytics</div>
    {#if commands.length === 0}
      <p class="text-sm text-muted">No commands run since the bot started.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-muted"><tr><th class="py-1">Command</th><th class="py-1 text-right">Runs</th><th class="py-1 text-right">Errors</th><th class="py-1 text-right">Err %</th><th class="py-1 text-right">Avg</th></tr></thead>
          <tbody>
            {#each commands as c (c.name)}
              <tr class="border-t border-border">
                <td class="py-1.5 font-medium">/{c.name}</td>
                <td class="py-1.5 text-right tabular-nums">{fmtNumber(c.runs)}</td>
                <td class="py-1.5 text-right tabular-nums {c.errors ? 'text-danger' : 'text-muted'}">{c.errors}</td>
                <td class="py-1.5 text-right tabular-nums">{Math.round(c.errorRate * 100)}%</td>
                <td class="py-1.5 text-right tabular-nums text-muted">{c.avgMs}ms</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card>

  <Card class="mt-6">
    <div class="mb-3 flex items-center justify-between">
      <span class="font-display text-lg font-bold">⏱ Rate-limit Monitor</span>
      <span class="pill bg-surface-2 text-muted">{rateLimits.total} hits</span>
    </div>
    {#if !rateLimits.recent?.length}
      <p class="text-sm text-success">No rate-limit hits — you're well within Discord's limits. 🎉</p>
    {:else}
      <div class="max-h-72 space-y-1 overflow-y-auto">
        {#each rateLimits.recent as r}
          <div class="flex items-center gap-2 rounded-btn bg-surface-2 px-3 py-1.5 text-xs">
            <span class="pill bg-warn/20 text-warn">{r.method}</span>
            <code class="min-w-0 flex-1 truncate text-muted">{r.path}</code>
            {#if r.global}<span class="pill bg-danger/20 text-danger">global</span>{/if}
            <span class="text-muted">{r.timeout}ms · {fmtRelative(r.ts)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card class="mt-6">
    <div class="mb-3 font-display text-lg font-bold">📈 Activity (1m / 5m)</div>
    {#if diag.counters}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {#each ['command', 'play', 'search', 'voice', 'install', 'library', 'warn', 'error'] as k}
          <div class="rounded-btn bg-surface-2 px-2 py-2 text-center">
            <div class="text-[10px] uppercase tracking-wide text-muted">{k}</div>
            <div class="font-display text-lg font-bold {k === 'error' && diag.counters.m5[k] ? 'text-danger' : k === 'warn' && diag.counters.m5[k] ? 'text-warn' : ''}">{diag.counters.m1[k] ?? 0}<span class="text-xs text-muted"> / {diag.counters.m5[k] ?? 0}</span></div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

<!-- ════════════════════════ AUDIO ════════════════════════ -->
{:else if tab === 'audio'}
  <Card>
    <div class="mb-3 font-display text-lg font-bold">🎚️ Audio Stream Inspector</div>
    {#if queues.length === 0}
      <p class="text-sm text-muted">No active audio streams. Play something to inspect it.</p>
    {:else}
      <div class="space-y-4">
        {#each queues as q (q.guildId)}
          {#if q.currentSong}
            <div class="rounded-card border border-border bg-surface-2 p-4">
              <div class="mb-2 flex items-center gap-2">
                <span class="font-display font-bold">{q.guildName}</span>
                <span class="pill bg-bg-soft text-muted">{q.paused ? 'paused' : 'streaming'}</span>
              </div>
              <div class="truncate text-sm font-medium">{q.currentSong.name}</div>
              <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                {#each [['Codec', 'Opus'], ['Bitrate', '256 kbps'], ['Sample rate', '48 kHz'], ['Channels', 'Stereo (2)'], ['Volume', `${q.volume ?? 100}%`], ['Loop', ['off', 'track', 'queue'][q.loop ?? 0]], ['Requested by', q.currentSong.requestedBy ?? '—'], ['Duration', q.currentSong.formattedDuration ?? fmtDuration(q.currentSong.duration)]] as [k, v]}
                  <div><dt class="text-muted">{k}</dt><dd class="font-medium">{v}</dd></div>
                {/each}
              </dl>
              {#if q.currentSong.url}
                <div class="mt-2 truncate text-[11px] text-muted">🔗 <a href={q.currentSong.url} target="_blank" rel="noreferrer" class="text-accent hover:underline">{q.currentSong.url}</a></div>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
    <p class="mt-3 text-[11px] text-muted">ffmpeg output: <code>-ar 48000 -ac 2 -b:a 256k</code> · source format prefers Opus/webm from yt-dlp.</p>
  </Card>

<!-- ════════════════════════ DATA ════════════════════════ -->
{:else if tab === 'data'}
  <div class="grid gap-6 lg:grid-cols-2">
    <Card>
      <div class="mb-3 font-display text-lg font-bold">📦 Versions</div>
      {#if versions}
        <dl class="space-y-1 text-sm">
          {#each Object.entries(versions.deps ?? {}) as [k, v]}
            <div class="flex justify-between border-b border-border/50 pb-1"><dt class="text-muted">{k}</dt><dd class="font-mono font-medium">{v ?? '—'}</dd></div>
          {/each}
          {#each Object.entries(versions.binaries ?? {}) as [k, v]}
            <div class="flex justify-between border-b border-border/50 pb-1"><dt class="text-muted">{k}</dt><dd class="font-mono font-medium">{v ?? 'not found'}</dd></div>
          {/each}
        </dl>
      {:else}<p class="text-sm text-muted">Loading…</p>{/if}
    </Card>

    <Card>
      <div class="mb-3 font-display text-lg font-bold">🗄️ Database</div>
      {#if dbstats?.available}
        <div class="mb-3 flex flex-wrap gap-2 text-xs">
          <span class="pill bg-surface-2 text-muted">file {fmtBytes(dbstats.sizeBytes)}</span>
          <span class="pill bg-surface-2 text-muted">WAL {fmtBytes(dbstats.walBytes)}</span>
        </div>
        <div class="max-h-60 space-y-0.5 overflow-y-auto">
          {#each dbstats.tables.sort((a, b) => b.rows - a.rows) as t}
            <div class="flex justify-between rounded-btn px-2 py-1 text-sm hover:bg-surface-2"><span class="text-muted">{t.name}</span><span class="tabular-nums">{fmtNumber(t.rows)}</span></div>
          {/each}
        </div>
      {:else}<p class="text-sm text-muted">SQLite not available (running on JSON storage).</p>{/if}
    </Card>

    <Card>
      <div class="mb-3 font-display text-lg font-bold">🧩 Plugins & Integrations</div>
      <div class="space-y-1.5">
        {#each plugins as p}
          <div class="flex items-center gap-2 rounded-btn bg-surface-2 px-3 py-1.5 text-sm"><span class="h-2 w-2 rounded-full bg-success"></span>{p.name ?? p.id}<span class="ml-auto text-[11px] text-muted">v{p.version ?? '?'}</span></div>
        {/each}
        {#if integrations}
          {#each Object.entries(integrations) as [name, st]}
            <div class="flex items-center gap-2 rounded-btn bg-surface-2 px-3 py-1.5 text-sm">
              <span class="h-2 w-2 rounded-full {st && (st === true || (st as any).enabled || (st as any).ok) ? 'bg-success' : 'bg-muted'}"></span>
              <span class="capitalize">{name}</span>
              <span class="ml-auto text-[11px] text-muted">{typeof st === 'object' ? ((st as any).enabled ? 'enabled' : 'off') : String(st)}</span>
            </div>
          {/each}
        {/if}
        {#if plugins.length === 0 && !integrations}<p class="text-sm text-muted">No plugins or integrations loaded.</p>{/if}
      </div>
    </Card>

    <Card>
      <div class="mb-3 font-display text-lg font-bold">⏰ Scheduled Tasks</div>
      <div class="space-y-1.5 text-sm">
        {#each scheduled.crons as c}
          <div class="flex items-center gap-2 rounded-btn bg-surface-2 px-3 py-1.5"><code class="text-accent-2 text-xs">{c.expr ?? c.expression}</code><span class="ml-auto truncate text-[11px] text-muted">{c.action?.line ?? c.name ?? 'cron'}</span></div>
        {/each}
        {#each scheduled.subs as s}
          <div class="flex items-center gap-2 rounded-btn bg-surface-2 px-3 py-1.5"><span>📻</span><span class="truncate">{s.name ?? s.url}</span><span class="ml-auto text-[11px] text-muted">playlist sub</span></div>
        {/each}
        {#if scheduled.crons.length === 0 && scheduled.subs.length === 0}<p class="text-muted">No scheduled tasks.</p>{/if}
        <div class="pt-1 text-[11px] text-muted">{scheduled.backups.length} backup snapshot(s) retained.</div>
      </div>
    </Card>
  </div>

  {#if errorBudget}
    <Card class="mt-6">
      <div class="mb-3 font-display text-lg font-bold">🚨 Error Budget</div>
      <div class="flex flex-wrap gap-3 text-sm">
        <span class="pill bg-surface-2 text-muted">errors (5m): <strong class="text-text">{errorBudget.errors ?? errorBudget.count ?? 0}</strong></span>
        <span class="pill bg-surface-2 text-muted">budget: {errorBudget.budget ?? errorBudget.limit ?? '—'}</span>
        {#if errorBudget.breached}<span class="pill bg-danger/20 text-danger">⚠ budget breached</span>{:else}<span class="pill bg-success/20 text-success">within budget</span>{/if}
      </div>
      <button class="btn-ghost mt-3" onclick={() => ctl('/api/observability/alert', 'Fire a test alert to the configured webhook?', 'Test alert')}>Fire test alert</button>
    </Card>
  {/if}

<!-- ════════════════════════ CONSOLE ════════════════════════ -->
{:else if tab === 'console'}
  <Card padding="p-0" class="mb-6 overflow-hidden">
    <div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
      <span class="font-display font-bold">📟 Console</span>
      <div class="flex gap-1 rounded-btn bg-surface-2 p-0.5">
        {#each ['all', 'warn', 'error'] as lvl}
          <button class="rounded-[8px] px-2 py-0.5 text-xs font-semibold capitalize transition" class:bg-accent={levelFilter === lvl} class:text-on-accent={levelFilter === lvl} class:text-muted={levelFilter !== lvl} onclick={() => (levelFilter = lvl as any)}>{lvl}</button>
        {/each}
      </div>
      <input class="input h-8 max-w-[180px]" placeholder="Filter…" bind:value={search} />
      <span class="ml-auto text-[11px] text-muted">{shown.length} lines</span>
    </div>
    <div bind:this={consoleEl} class="h-80 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed">
      {#if shown.length === 0}<div class="grid h-full place-items-center text-muted">No log activity.</div>{:else}
        {#each shown as e}
          <div class="flex gap-2 py-0.5"><span class="shrink-0 text-muted">{tsLabel(e.ts)}</span><span class="shrink-0 font-bold uppercase" style="color:{CAT_COLOR[e.category] ?? 'var(--muted)'}">{e.category.slice(0, 4)}</span><span class="min-w-0 break-words" style="color:{LEVEL_COLOR[e.level] ?? 'var(--text)'}">{e.text}</span></div>
        {/each}
      {/if}
    </div>
  </Card>

  <Card>
    <div class="mb-3 font-display text-lg font-bold">📜 Crash & Restart History</div>
    {#if restartHistory.length === 0}
      <p class="text-sm text-muted">No recorded events yet.</p>
    {:else}
      <div class="space-y-1">
        {#each restartHistory as e}
          <div class="flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-1.5 text-sm">
            <span class="pill {e.type === 'crash' ? 'bg-danger/20 text-danger' : e.type === 'boot' ? 'bg-success/20 text-success' : 'bg-surface-2 text-muted'}">{e.type}</span>
            <span class="min-w-0 flex-1 truncate text-muted">{e.detail ?? ''}</span>
            <span class="text-[11px] text-muted">{fmtRelative(e.ts)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

<!-- ════════════════════════ CONTROLS ════════════════════════ -->
{:else if tab === 'controls'}
  <div class="grid gap-4 sm:grid-cols-2">
    <Card>
      <div class="mb-1 font-display text-base font-bold">↻ Restart bot</div>
      <p class="mb-3 text-xs text-muted">Relaunches the bot process (runs in the background — check your terminal). Music sessions drop briefly.</p>
      <button class="btn-primary" disabled={busy === 'Restart'} onclick={() => ctl('/api/diag/restart', 'Restart the bot now? Playback will stop briefly.', 'Restart')}>{busy === 'Restart' ? 'Restarting…' : 'Restart bot'}</button>
    </Card>
    <Card>
      <div class="mb-1 font-display text-base font-bold">🔌 Force Discord reconnect</div>
      <p class="mb-3 text-xs text-muted">Re-establish the gateway without a full restart. Useful when the bot goes unresponsive.</p>
      <button class="btn-ghost" disabled={busy === 'Reconnect'} onclick={() => ctl('/api/diag/reconnect', 'Force a Discord reconnect?', 'Reconnect')}>{busy === 'Reconnect' ? 'Reconnecting…' : 'Reconnect'}</button>
    </Card>
    <Card>
      <div class="mb-1 font-display text-base font-bold">🧹 Clear caches / GC</div>
      <p class="mb-3 text-xs text-muted">Trigger garbage collection (if enabled) and clear in-memory caches to free RAM.</p>
      <button class="btn-ghost" disabled={busy === 'GC'} onclick={() => ctl('/api/diag/gc', 'Run garbage collection and clear caches?', 'GC')}>{busy === 'GC' ? 'Clearing…' : 'Clear & GC'}</button>
    </Card>
    <Card>
      <div class="mb-1 font-display text-base font-bold">⚡ Network speedtest</div>
      <p class="mb-3 text-xs text-muted">Run a download/upload/ping test from the host.</p>
      <button class="btn-ghost" disabled={busy === 'speedtest'} onclick={runSpeedtest}>{busy === 'speedtest' ? 'Testing…' : 'Run speedtest'}</button>
      {#if speedtest}
        <div class="mt-3 flex flex-wrap gap-3 text-sm">
          <span class="pill bg-surface-2">↓ {speedtest.downloadMbps != null ? speedtest.downloadMbps.toFixed(1) : '—'} Mbps</span>
          <span class="pill bg-surface-2">↑ {speedtest.uploadMbps != null ? speedtest.uploadMbps.toFixed(1) : '— (n/a)'}</span>
          <span class="pill bg-surface-2">🏓 {speedtest.pingMs ?? '—'} ms</span>
        </div>
        <p class="mt-1 text-[10px] text-muted">Measured from your browser via Cloudflare. Upload isn't measured.</p>
      {/if}
    </Card>
    <Card>
      <div class="mb-1 font-display text-base font-bold">📤 Diagnostic report</div>
      <p class="mb-3 text-xs text-muted">Bundle specs + health + versions + recent errors + log tail into a shareable file.</p>
      <button class="btn-ghost" onclick={exportReport}>Export report</button>
    </Card>
    <Card>
      <div class="mb-1 font-display text-base font-bold">🔔 Desktop error alerts</div>
      <p class="mb-3 text-xs text-muted">Browser notifications when the bot logs an error, even in a background tab.</p>
      <button class="btn-ghost" onclick={toggleAlerts}>{alertsOn ? '✓ Alerts on — click to disable' : 'Enable desktop alerts'}</button>
    </Card>
  </div>
{/if}
