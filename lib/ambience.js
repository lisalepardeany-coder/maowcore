// Voice ambience: generated, seamless sound loops the bot can play in voice
// (the theme sounds live in the browser only, so these are made as .wav files).
//
// Files are generated once into data/ambience/<preset>.wav (60 s, 22 kHz mono)
// and served by the control server at /ambience/<preset>.wav.
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'data', 'ambience');
const RATE = 22050;
const SECONDS = 60;
const FADE = 2;          // seconds crossfaded so the loop has no click

const PRESETS = {
  fan:    { label: 'Office fan', emoji: '🌀', themes: ['pizzeria', 'slasher'] },
  hum:    { label: 'Ship engine hum', emoji: '🚀', themes: ['space'] },
  rain:   { label: 'Rain', emoji: '🌧', themes: ['cozy', 'nature'] },
  static: { label: 'Tape static', emoji: '📼', themes: ['analog', 'retro'] },
  server: { label: 'Server room', emoji: '🖥', themes: ['ai', 'tech'] },
  wind:   { label: 'Distant wind', emoji: '🌫', themes: ['backrooms', 'fog'] },
  drip:   { label: 'Cave drips', emoji: '💧', themes: ['cave', 'dungeon'] },
};

// Deterministic random so a preset always sounds the same.
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// Pure: render a preset into Float32 samples in [-1, 1] (unit tested).
const render = (preset, seconds = SECONDS, rate = RATE) => {
  if (!PRESETS[preset]) throw new Error(`Unknown ambience: ${preset}`);
  const n = Math.floor((seconds + FADE) * rate);
  const out = new Float32Array(n);
  const r = rng(preset.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  let brown = 0; let lp = 0; let pink = 0;
  let blip = 0; let blipF = 0; let blipPhase = 0;
  const TAU = Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const white = r() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    lp += 0.08 * (white - lp);
    pink = 0.97 * pink + 0.03 * white;
    let s = 0;
    switch (preset) {
      case 'fan':
        s = brown * 3.2 + Math.sin(TAU * 60 * t) * 0.025 * (1 + 0.2 * Math.sin(TAU * 0.3 * t));
        break;
      case 'hum':
        s = (Math.sin(TAU * 55 * t) * 0.18 + Math.sin(TAU * 110 * t) * 0.09 + Math.sin(TAU * 165.5 * t) * 0.04)
          * (0.85 + 0.15 * Math.sin(TAU * 0.11 * t)) + brown * 1.6;
        break;
      case 'rain':
        s = lp * 0.9 + (r() < 0.0009 ? (r() * 0.5) : 0);
        break;
      case 'static':
        s = pink * 1.4 + white * 0.04 + (r() < 0.0004 ? (r() * 2 - 1) * 0.6 : 0);
        break;
      case 'server':
        s = Math.sin(TAU * 120 * t) * 0.05 + Math.sin(TAU * 240 * t) * 0.02 + lp * 0.35 + brown * 1.2
          + (r() < 0.0006 ? (r() * 2 - 1) * 0.25 : 0);
        break;
      case 'wind':
        s = brown * 4 * (0.55 + 0.45 * Math.sin(TAU * 0.07 * t) * Math.sin(TAU * 0.023 * t + 1));
        break;
      case 'drip':
        if (blip <= 0.001 && r() < 0.00012) { blip = 0.5; blipF = 900 + r() * 900; blipPhase = 0; }
        blipPhase += TAU * blipF / rate; blipF *= 0.99993;
        s = brown * 1.4 + Math.sin(blipPhase) * blip;
        blip *= 0.9993;
        break;
      default: break;
    }
    out[i] = s;
  }
  // Crossfade the extra tail into the head so the loop point is seamless.
  const f = Math.floor(FADE * rate);
  const len = n - f;
  for (let i = 0; i < f; i++) {
    const a = i / f;
    out[i] = out[i] * a + out[len + i] * (1 - a);
  }
  const loop = out.subarray(0, len);
  // Normalise to a calm level (peak ~0.5).
  let peak = 0;
  for (let i = 0; i < loop.length; i++) peak = Math.max(peak, Math.abs(loop[i]));
  const g = peak ? 0.5 / peak : 1;
  for (let i = 0; i < loop.length; i++) loop[i] *= g;
  return loop;
};

const toWav = (samples, rate = RATE) => {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
};

const fileFor = (preset) => {
  if (!PRESETS[preset]) throw new Error(`Unknown ambience: ${preset}`);
  const file = path.join(DIR, `${preset}.wav`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file, toWav(render(preset)));
  }
  return file;
};

// Start a looping ambience in a voice channel at a low volume.
const playIn = async (client, channel, preset, { volume = 35, textChannel, member } = {}) => {
  const q = client.distube.getQueue(channel.guild.id);
  if (q?.songs?.length && !q.songs[0]?.metadata?.ambience) {
    throw new Error('Music is playing. Stop it first (/stop), or the ambience would wait at the end of the queue.');
  }
  if (q) await q.stop().catch(() => {});
  fileFor(preset);
  const url = client.control._ambienceUrl(preset);
  const p = PRESETS[preset];
  await client.distube.play(channel, url, {
    textChannel, member,
    metadata: { localName: `${p.emoji} Ambience · ${p.label}`, ambience: preset },
  });
  const queue = client.distube.getQueue(channel.guild.id);
  if (queue) {
    queue.setRepeatMode(1);
    queue.setVolume(Math.max(5, Math.min(100, volume)));
  }
  return p;
};

// Theme category/name → preset (used by the panel's "play in voice" button).
const presetForTheme = (themeId = '', category = '') => {
  const s = `${themeId} ${category}`.toLowerCase();
  for (const [key, p] of Object.entries(PRESETS)) if (p.themes.some((w) => s.includes(w))) return key;
  if (/star|ship|bridge|station|space|warp|orbit|moon|fleet|alien|isolation|cryo/.test(s)) return 'hum';
  if (/ai|tech|cyber|neural|matrix|robot|code/.test(s)) return 'server';
  if (/vhs|tape|analog|found|retro|crt/.test(s)) return 'static';
  return 'fan';
};

module.exports = { PRESETS, render, toWav, fileFor, playIn, presetForTheme, DIR };
