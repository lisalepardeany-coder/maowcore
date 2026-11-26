'use strict';
// lib/rollback.js — go back to the last version that worked when an update
// breaks the bot (Pterodactyl, with git). Two halves:
//
//  1. Before the bot starts (deploy/pterodactyl/start.sh runs
//     `node lib/rollback.js pre-start` right after the update pulled the code):
//       • the code is a version marked bad → reset to the last good version
//       • the same new version was started 3 times without passing its start
//         check (it keeps crashing) → mark it bad and reset
//  2. In the bot, after the start check (lib/self-check.js):
//       • passed → this version is the new "last good" one
//       • failed on a new version → marked bad; the next start goes back
//
// A new push to GitHub is a different commit, so it's tried again normally.
// After a rollback the owner gets a DM saying why. AUTO_ROLLBACK=0 turns it off.
// State: data/rollback.json { good:{commit,version}, attempts:{commit,count}, bad:[commit], last:event }

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'data', 'rollback.json');
const MAX_ATTEMPTS = 3;
const MAX_BAD = 20;

const enabled = () => process.env.AUTO_ROLLBACK !== '0';
const readState = (file = FILE) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { return {}; } };
const writeState = (s, file = FILE) => {
  if (process.env.NODE_TEST_CONTEXT && file === FILE) return;
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(s, null, 2)); } catch (e) { console.warn('[rollback] save failed:', e.message); }
};
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }).trim();
const headCommit = () => { try { return git(['rev-parse', 'HEAD']); } catch { return null; } };
const version = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } };
const short = (c) => String(c || '').slice(0, 7);

/**
 * Pure: what to do before starting. Returns { action: 'start'|'rollback', state, event? }.
 * `state` is the new state to save (attempts counted).
 */
function decide(state, head, currentVersion, now = Date.now()) {
  const s = { bad: [], ...state };
  const good = s.good?.commit;
  if (!head) return { action: 'start', state: s };
  const rollback = (reason) => {
    const event = { at: now, from: { commit: head, version: currentVersion }, to: { ...s.good }, reason, reported: false };
    return { action: 'rollback', event, state: { ...s, bad: [...new Set([...s.bad, head])].slice(-MAX_BAD), attempts: { commit: good, count: 1 }, last: event } };
  };
  if (s.bad.includes(head) && good && good !== head) return rollback(s.badReasons?.[head] || 'its start check failed');
  const count = s.attempts?.commit === head ? (s.attempts.count || 0) + 1 : 1;
  if (count > MAX_ATTEMPTS && good && good !== head) return rollback(`it was started ${MAX_ATTEMPTS} times without finishing its start (crashing?)`);
  return { action: 'start', state: { ...s, attempts: { commit: head, count } } };
}

/** Pure: after the start check. Returns the new state and whether this version is now marked bad. */
function afterCheck(state, head, currentVersion, ok, summary = '') {
  const s = { bad: [], ...state };
  if (!head) return { state: s, markedBad: false };
  if (ok) {
    return { state: { ...s, good: { commit: head, version: currentVersion }, attempts: { commit: head, count: 0 }, bad: s.bad.filter((c) => c !== head) }, markedBad: false };
  }
  // Only a new version is blamed: if the last good one fails too, it's the
  // server (disk, Discord, network), and going back wouldn't help.
  if (!s.good?.commit || s.good.commit === head) return { state: s, markedBad: false };
  const reasons = { ...(s.badReasons || {}), [head]: `its start check failed: ${String(summary).slice(0, 300)}` };
  return { state: { ...s, bad: [...new Set([...s.bad, head])].slice(-MAX_BAD), badReasons: reasons }, markedBad: true };
}

// ── In the bot ───────────────────────────────────────────────────────────────
/** Record the start check result; returns { markedBad, good } for the caller's DM. */
function recordCheck(result, summaryText) {
  if (!enabled()) return { markedBad: false };
  const head = headCommit();
  const r = afterCheck(readState(), head, version(), result.ok, summaryText);
  writeState(r.state);
  return { markedBad: r.markedBad, good: r.state.good };
}

/** A rollback done before this start that the owner hasn't heard about yet (marks it told). */
function takeUnreported() {
  const s = readState();
  if (!s.last || s.last.reported) return null;
  s.last.reported = true;
  writeState(s);
  return s.last;
}

const lastEvent = () => readState().last || null;

// ── Before the bot (CLI) ─────────────────────────────────────────────────────
function preStart() {
  if (!enabled()) return;
  const head = headCommit();
  if (!head) return;                                   // no git: nothing to do
  const d = decide(readState(), head, version());
  if (d.action === 'start') { writeState(d.state); return; }
  const to = d.event.to;
  console.log(`Rolling back: v${d.event.from.version} (${short(head)}) → v${to.version} (${short(to.commit)}), because ${d.event.reason}.`);
  try {
    git(['reset', '--hard', to.commit]);
    try { execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', timeout: 600_000, shell: process.platform === 'win32' }); }
    catch { console.log('npm install after the rollback had problems; starting anyway.'); }
    writeState(d.state);
    return 'rolled-back';
  } catch (e) {
    console.log(`Rollback failed (${e.message}); starting the new version.`);
  }
}

// start.sh: exit code 10 = went back (start.sh re-runs the older version's copy).
if (require.main === module && process.argv[2] === 'pre-start') {
  let code = 0;
  try { if (preStart() === 'rolled-back') code = 10; } catch (e) { console.log(`[rollback] ${e.message}`); }
  process.exit(code);
}

module.exports = { decide, afterCheck, recordCheck, takeUnreported, lastEvent, preStart, MAX_ATTEMPTS, short };
