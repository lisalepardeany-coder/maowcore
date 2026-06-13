'use strict';
// lib/ops.js — lightweight operational trackers for the diagnostics console:
// command analytics, rate-limit events, crash/restart history, and versions.
// Pure module (no Discord/control deps) so both index.js and the control
// server can use it without circular imports.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'restart-history.json');
const MAX_RL = 120;
const MAX_HISTORY = 100;

// ── Command analytics ────────────────────────────────────────────────────────
const commands = new Map(); // name → { name, runs, errors, totalMs, lastAt }

function recordCommand(name, ok, durMs) {
  if (!name) return;
  const c = commands.get(name) || { name, runs: 0, errors: 0, totalMs: 0, lastAt: 0 };
  c.runs++;
  if (!ok) c.errors++;
  c.totalMs += Number(durMs) || 0;
  c.lastAt = Date.now();
  commands.set(name, c);
}

function commandStats() {
  return [...commands.values()]
    .map((c) => ({
      name: c.name,
      runs: c.runs,
      errors: c.errors,
      avgMs: c.runs ? Math.round(c.totalMs / c.runs) : 0,
      errorRate: c.runs ? c.errors / c.runs : 0,
      lastAt: c.lastAt,
    }))
    .sort((a, b) => b.runs - a.runs);
}

// ── Rate-limit events ────────────────────────────────────────────────────────
const rateLimitRing = [];

function recordRateLimit(info) {
  rateLimitRing.push({
    ts: Date.now(),
    method: info?.method || '?',
    path: info?.path || info?.route || info?.url || '?',
    timeout: info?.timeout || info?.retryAfter || 0,
    global: !!info?.global,
  });
  if (rateLimitRing.length > MAX_RL) rateLimitRing.shift();
}

function rateLimits() {
  return { total: rateLimitRing.length, recent: [...rateLimitRing].reverse() };
}

// ── Crash / restart history (persisted to disk) ──────────────────────────────
function loadHistory() {
  try {
    const arr = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistory(arr) {
  try {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(arr.slice(-MAX_HISTORY)));
  } catch {
    /* best-effort */
  }
}

// type: 'boot' | 'shutdown' | 'crash'
function recordEvent(type, detail) {
  const arr = loadHistory();
  arr.push({ ts: Date.now(), type, detail: detail ? String(detail).slice(0, 600) : null });
  saveHistory(arr);
}

function history() {
  return loadHistory().reverse();
}

// ── Versions ─────────────────────────────────────────────────────────────────
function depVersions() {
  const safe = (mod) => {
    try { return require(`${mod}/package.json`).version; } catch { return null; }
  };
  let botVersion = null;
  try { botVersion = require('../package.json').version; } catch { /* */ }
  return {
    MaowCore: botVersion,
    node: process.version.replace(/^v/, ''),
    'discord.js': safe('discord.js'),
    distube: safe('distube'),
    '@discordjs/voice': safe('@discordjs/voice'),
    '@distube/ytdl-core': safe('@distube/ytdl-core'),
    'better-sqlite3': safe('better-sqlite3'),
  };
}

let _binCache = null;
function binaryVersions() {
  if (_binCache) return Promise.resolve(_binCache);
  const run = (cmd, args) =>
    new Promise((res) => {
      try {
        execFile(cmd, args, { timeout: 5000 }, (err, stdout) => {
          res(err ? null : String(stdout).trim().split('\n')[0]);
        });
      } catch {
        res(null);
      }
    });

  let ffmpegPath = process.env.FFMPEG_PATH;
  if (!ffmpegPath) { try { ffmpegPath = require('ffmpeg-static'); } catch { ffmpegPath = 'ffmpeg'; } }
  const ytdlpPath = path.join(
    __dirname, '..', 'node_modules', '@distube', 'yt-dlp', 'bin',
    process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
  );

  return Promise.all([run(ffmpegPath, ['-version']), run(ytdlpPath, ['--version'])]).then(([ff, yt]) => {
    _binCache = {
      ffmpeg: ff ? ff.replace(/ffmpeg version/i, '').trim().split(' ')[0] : null,
      'yt-dlp': yt || null,
    };
    return _binCache;
  });
}

module.exports = {
  recordCommand, commandStats,
  recordRateLimit, rateLimits,
  recordEvent, history,
  depVersions, binaryVersions,
};
