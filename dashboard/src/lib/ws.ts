// Live state store backed by the control server's WebSocket.
// The server broadcasts { type:'state', queues, servers, stats, ping, diagnostics }.
// We NORMALIZE that here into a stable shape the components consume, so the
// rest of the app doesn't care about the wire format.
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { getSession } from './api';

export interface Song {
  name?: string;
  url?: string;
  thumbnail?: string | null;
  duration?: number;
  formattedDuration?: string;
  requestedBy?: string;
}

export interface Queue {
  guildId?: string;
  guildName?: string;
  voiceChannelName?: string | null;
  currentSong?: Song | null;
  songs?: Song[]; // normalized from `upcoming`
  paused?: boolean;
  volume?: number;
  loop?: number; // normalized from `repeatMode`
  currentTime?: number;
  autoplay?: boolean;
}

export interface ServerInfo {
  id: string;
  name: string;
  icon?: string | null;
  memberCount?: number;
}

export interface BotState {
  connected: boolean;
  botTag?: string;
  version?: string;
  guilds: ServerInfo[]; // normalized from `servers`
  queues: Queue[];
  ping?: any;
  stats?: any; // system + process + discord stats (from _collectStats)
  diagnostics?: any; // boot timeline, counters, health, recent errors
}

export interface LogEntry {
  ts: number;
  text: string;
  level: 'info' | 'warn' | 'error' | 'success';
  category: string;
  subsystem?: string | null;
  meta?: any;
}

export const liveState = writable<BotState>({ connected: false, guilds: [], queues: [] });
export const wsConnected = writable(false);
// Rolling buffer of the most recent log lines (newest last). Capped.
export const logEntries = writable<LogEntry[]>([]);
const MAX_LOG = 400;

// Time-series samples of CPU/RAM/heap for the diagnostics history charts.
export interface StatSample { cpu: number; mem: number; heap: number }
export const statsHistory = writable<StatSample[]>([]);
const MAX_SAMPLES = 120; // ~4 min at one sample per state tick
if (browser) {
  liveState.subscribe((s) => {
    const sys = s.stats?.system;
    const proc = s.stats?.process;
    if (!sys && !proc) return;
    statsHistory.update((arr) => {
      const next = [
        ...arr,
        {
          cpu: Math.round(sys?.cpuPct ?? 0),
          mem: sys?.memTotal ? Math.round((sys.memUsed / sys.memTotal) * 100) : 0,
          // Heap against the true V8 ceiling (heapLimit), not the grown heapTotal.
          heap: proc?.heapLimit
            ? Math.round((proc.heapUsed / proc.heapLimit) * 100)
            : proc?.heapTotal ? Math.round((proc.heapUsed / proc.heapTotal) * 100) : 0,
        },
      ];
      return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
    });
  });
}

// Normalize a raw server `state` payload into BotState, MERGING with the
// previous state. The server only includes `servers` every ~7th tick to save
// bandwidth — so when it's absent we must keep the guild list we already have
// instead of wiping it (which would make the server picker flicker + break
// every guild-gated page).
function normalize(raw: any, prev: BotState): BotState {
  // Only replace guilds when this payload actually carries the server list.
  const guilds: ServerInfo[] =
    raw.servers || raw.guilds
      ? (raw.servers ?? raw.guilds).map((s: any) => ({
          id: s.id,
          name: s.name,
          icon: s.iconURL ?? s.icon ?? null,
          memberCount: s.memberCount,
        }))
      : prev.guilds;

  const queues: Queue[] = (raw.queues ?? []).map((q: any) => ({
    guildId: q.guildId,
    guildName: q.guildName,
    voiceChannelName: q.voiceChannelName ?? null,
    currentSong: q.currentSong
      ? {
          name: q.currentSong.name,
          url: q.currentSong.url,
          thumbnail: q.currentSong.thumbnail ?? null,
          duration: q.currentSong.duration,
          formattedDuration: q.currentSong.formattedDuration,
          requestedBy: q.currentSong.user ?? q.currentSong.requestedBy,
        }
      : null,
    // `upcoming` only carries name + formattedDuration.
    songs: (q.upcoming ?? q.songs ?? []).map((s: any) => ({
      name: s.name,
      formattedDuration: s.formattedDuration,
      thumbnail: s.thumbnail ?? null,
      requestedBy: s.user ?? s.requestedBy,
    })),
    paused: q.paused,
    volume: q.volume,
    loop: q.repeatMode ?? q.loop ?? 0,
    currentTime: q.currentSong?.currentTime ?? q.currentTime ?? 0,
    autoplay: q.autoplay,
  }));

  return {
    connected: true,
    botTag: raw.botTag ?? prev.botTag,
    version: raw.version ?? prev.version,
    guilds,
    queues,
    ping: raw.ping ?? prev.ping,
    stats: raw.stats ?? prev.stats,
    diagnostics: raw.diagnostics ?? prev.diagnostics,
  };
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sess = getSession();
  const q = sess ? `?token=${encodeURIComponent(sess)}` : '';
  return `${proto}//${location.host}/ws${q}`;
}

export function connectWs() {
  if (!browser || socket) return;

  try {
    socket = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  socket.addEventListener('open', () => {
    attempts = 0;
    wsConnected.set(true);
  });

  socket.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      // Full state snapshots carry queues/servers/stats/diagnostics.
      if (msg.type === 'state' || msg.queues || msg.servers) {
        liveState.update((prev) => normalize(msg, prev));
      } else if (msg.type === 'diagnostics' && msg.payload) {
        // Initial diagnostics push on connect.
        liveState.update((prev) => ({ ...prev, connected: true, diagnostics: msg.payload }));
      } else if (msg.type === 'log_history' && Array.isArray(msg.entries)) {
        // Persistent log buffer sent on connect — seed the console.
        logEntries.set(msg.entries.slice(-MAX_LOG) as LogEntry[]);
      } else if (msg.type === 'log' && msg.text) {
        // Live log line → append to the rolling console buffer.
        logEntries.update((arr) => {
          const next = [...arr, msg as LogEntry];
          return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
        });
      }
    } catch {
      /* ignore malformed frames */
    }
  });

  socket.addEventListener('close', () => {
    wsConnected.set(false);
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    try {
      socket?.close();
    } catch {
      /* noop */
    }
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(1000 * 2 ** attempts, 15000);
  attempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWs();
  }, delay);
}

// The guild to target with actions. Set from the layout when the selected
// guild changes (kept here to avoid a circular import with the guild store).
let actionGuild = '';
export function setWsGuild(id: string) {
  actionGuild = id;
}

/**
 * Send an action over the socket (play, skip, volume, etc.).
 * The server requires { type:'cmd', action, guildId, ... } — see handleCommand.
 */
export function sendAction(action: string, payload: Record<string, unknown> = {}) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({ type: 'cmd', action, guildId: payload.guildId ?? actionGuild, ...payload }),
    );
  }
}
