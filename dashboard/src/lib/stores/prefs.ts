// Global dashboard preferences. Persisted to localStorage and applied to
// <html> (CSS variables + classes + font scale) by applyPrefs(). One store
// drives appearance, accessibility, behavior, notifications, and nav prefs.
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface Prefs {
  // Appearance
  accent: string;            // '' = use theme default, else hex override
  density: 'compact' | 'comfortable' | 'spacious';
  bgImage: string;           // url
  bgDim: number;             // 0..100
  // Accessibility
  reduceMotion: boolean;
  highContrast: boolean;
  fontScale: number;         // 0.85..1.3
  dyslexiaFont: boolean;
  focusOutlines: boolean;
  // Branding
  brandName: string;
  brandIcon: string;
  // Behavior
  landingPage: string;       // '/', '/library', ...
  pinnedGuild: string;       // '' = remember last
  confirmActions: boolean;
  timeFormat: '12' | '24';
  timestamps: 'relative' | 'absolute';
  // Notifications / sound
  sounds: boolean;
  soundVolume: number;       // 0..1
  notifyNowPlaying: boolean;
  notifyErrors: boolean;
  // Navigation
  navOrder: string[];        // hrefs in custom order
  navHidden: string[];       // hidden hrefs
  navPinned: string[];       // pinned hrefs (shown on top)
  // Advanced
  experimental: Record<string, boolean>;
  // Themes (user-created)
  customThemes: CustomTheme[];
  autoTheme: 'off' | 'daynight';
  varOverrides: Record<string, string>; // live CSS-var overrides (custom themes)
}

export interface CustomTheme {
  id: string;
  name: string;
  vars: Record<string, string>; // CSS var name → value
  nav: 'side' | 'top' | 'rail';
}

const DEFAULTS: Prefs = {
  accent: '',
  density: 'comfortable',
  bgImage: '',
  bgDim: 40,
  reduceMotion: false,
  highContrast: false,
  fontScale: 1,
  dyslexiaFont: false,
  focusOutlines: false,
  brandName: 'MaowCore',
  brandIcon: '◆',
  landingPage: '/',
  pinnedGuild: '',
  confirmActions: true,
  timeFormat: '24',
  timestamps: 'relative',
  sounds: false,
  soundVolume: 0.4,
  notifyNowPlaying: false,
  notifyErrors: false,
  navOrder: [],
  navHidden: [],
  navPinned: [],
  experimental: {},
  customThemes: [],
  autoTheme: 'off',
  varOverrides: {},
};

const KEY = 'maow.v2.prefs';

function load(): Prefs {
  if (!browser) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* */ }
  return { ...DEFAULTS };
}

export const prefs = writable<Prefs>(load());

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs.update((p) => {
    const next = { ...p, [key]: value };
    if (browser) localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  });
}

export function resetPrefs() {
  prefs.set({ ...DEFAULTS });
  if (browser) localStorage.setItem(KEY, JSON.stringify(DEFAULTS));
}

export function exportPrefs(): string {
  if (!browser) return '{}';
  // Bundle prefs + theme + guild so the export is a full dashboard profile.
  return JSON.stringify(
    {
      prefs: JSON.parse(localStorage.getItem(KEY) || '{}'),
      theme: localStorage.getItem('maow.v2.theme'),
      version: 1,
    },
    null,
    2,
  );
}

export function importPrefs(json: string) {
  const data = JSON.parse(json);
  if (data.prefs) {
    prefs.set({ ...DEFAULTS, ...data.prefs });
    localStorage.setItem(KEY, JSON.stringify({ ...DEFAULTS, ...data.prefs }));
  }
  if (data.theme) localStorage.setItem('maow.v2.theme', data.theme);
}

// Apply preferences to the document. Called from a $effect in the layout.
export function applyPrefs(p: Prefs) {
  if (!browser) return;
  const el = document.documentElement;
  const set = (k: string, v: string) => el.style.setProperty(k, v);

  // Custom-theme CSS var overrides (cleared keys fall back to the theme).
  const OVERRIDABLE = ['--accent', '--accent-2', '--accent-3', '--bg', '--bg-soft', '--surface', '--surface-2', '--border', '--text', '--muted'];
  for (const v of OVERRIDABLE) {
    if (p.varOverrides?.[v]) set(v, p.varOverrides[v]);
    else el.style.removeProperty(v);
  }

  // Accent override (takes precedence over theme + custom-theme accent).
  if (p.accent) {
    set('--accent', p.accent);
    set('--accent-3', p.accent);
  }

  // Font scale × density → rem base (drives spacing app-wide).
  const densMul = p.density === 'compact' ? 0.92 : p.density === 'spacious' ? 1.08 : 1;
  el.style.fontSize = `${(16 * p.fontScale * densMul).toFixed(1)}px`;
  el.setAttribute('data-density', p.density);

  // Background image + dim (dim only applies when an image is set).
  set('--app-bg-image', p.bgImage ? `url("${p.bgImage}")` : 'none');
  set('--app-bg-dim', p.bgImage ? String(p.bgDim / 100) : '0');

  // Toggle classes.
  el.classList.toggle('reduce-motion', p.reduceMotion);
  el.classList.toggle('high-contrast', p.highContrast);
  el.classList.toggle('dyslexia', p.dyslexiaFont);
  el.classList.toggle('focus-always', p.focusOutlines);
}
