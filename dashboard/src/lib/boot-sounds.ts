// Synthesized cinematic sound engine for the boot screens (no audio files).
// All sounds are generated with the Web Audio API. The AudioContext must be
// resumed after a user gesture (browsers block autoplay) — the boot "press to
// start" gate handles that.

let ctx: AudioContext | null = null;
let master = 0.5;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  return ctx;
}

export function setVolume(v: number) { master = Math.max(0, Math.min(1, v)); }
export function resumeAudio() { try { ac()?.resume(); } catch { /* */ } }
export function audioReady(): boolean { return ac()?.state === 'running'; }

// ── primitives ───────────────────────────────────────────────────────────────
interface ToneOpts { freq: number; dur: number; type?: OscillatorType; vol?: number; when?: number; slideTo?: number; attack?: number }
function tone({ freq, dur, type = 'sine', vol = 0.3, when = 0, slideTo, attack = 0.005 }: ToneOpts) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * master), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(c.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
}

function noise({ dur, vol = 0.2, when = 0, filter = 'lowpass', freq = 2000, slideTo }: { dur: number; vol?: number; when?: number; filter?: BiquadFilterType; freq?: number; slideTo?: number }) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + when;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol * master, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + dur);
}

// ── named cues (when = seconds from now) ─────────────────────────────────────
export const sfx = {
  beep: (when = 0, freq = 880) => tone({ freq, dur: 0.08, type: 'square', vol: 0.18, when }),
  blip: (when = 0, freq = 1320) => tone({ freq, dur: 0.05, type: 'triangle', vol: 0.16, when }),
  typeClick: (when = 0) => noise({ dur: 0.02, vol: 0.12, when, filter: 'highpass', freq: 1500 }),
  powerHum: (when = 0, dur = 1.4) => { tone({ freq: 50, dur, type: 'sine', vol: 0.5, when, slideTo: 120 }); tone({ freq: 100, dur, type: 'sine', vol: 0.18, when, slideTo: 240 }); },
  coin: (when = 0) => { tone({ freq: 988, dur: 0.08, type: 'square', vol: 0.22, when }); tone({ freq: 1319, dur: 0.32, type: 'square', vol: 0.22, when: when + 0.08 }); },
  whoosh: (when = 0, dur = 0.6) => noise({ dur, vol: 0.3, when, filter: 'bandpass', freq: 300, slideTo: 4000 }),
  warp: (when = 0, dur = 1.6) => { tone({ freq: 70, dur, type: 'sawtooth', vol: 0.28, when, slideTo: 1400 }); noise({ dur, vol: 0.12, when, filter: 'lowpass', freq: 200, slideTo: 6000 }); },
  glitch: (when = 0) => { for (let i = 0; i < 4; i++) noise({ dur: 0.04, vol: 0.18, when: when + i * 0.06, filter: 'bandpass', freq: 400 + Math.random() * 3000 }); },
  riser: (when = 0, dur = 1.8) => noise({ dur, vol: 0.22, when, filter: 'highpass', freq: 200, slideTo: 6000 }),
  siren: (when = 0, dur = 1.2) => { const n = 4; for (let i = 0; i < n; i++) { tone({ freq: i % 2 ? 740 : 480, dur: dur / n, type: 'sawtooth', vol: 0.2, when: when + (i * dur) / n }); } },
  chime: (when = 0) => { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.16, when: when + i * 0.09 })); },
  arpUp: (when = 0, notes = [330, 415, 494, 660, 831]) => notes.forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'sawtooth', vol: 0.14, when: when + i * 0.1 })),
  bootDone: (when = 0) => { [392, 523, 659, 784].forEach((f) => tone({ freq: f, dur: 0.7, type: 'triangle', vol: 0.13, when })); },
};
