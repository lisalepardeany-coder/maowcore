// Theme system. A theme carries a layout personality (nav style) AND a boot
// profile (which cinematic boot sequence plays on load). Switching [data-theme]
// on <html> re-skins + re-structures the app.
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemeId =
  | 'neko' | 'studio' | 'nebula' | 'cyberdeck' | 'terminal' | 'daylight'
  | 'synthwave' | 'matrix' | 'aurora' | 'crimson'
  | 'hacker' | 'vaporwave' | 'obsidian'
  | 'vrchat' | 'redline' | 'datacenter' | 'mission' | 'overclock'
  | 'discord' | 'twitch' | 'spotify' | 'cyberpunk' | 'ocean' | 'forest'
  | 'sunset' | 'bubblegum' | 'frost' | 'toxic'
  | 'br-lobby' | 'br-poolrooms' | 'br-lightsout' | 'br-run' | 'br-thalasso'
  | 'br-fun' | 'br-pipes' | 'br-wheat' | 'br-redhalls' | 'br-end';
export type NavStyle = 'side' | 'top' | 'rail';
export type BootProfile =
  | 'terminal' | 'hud' | 'arcade' | 'cosmic' | 'matrix' | 'synthwave' | 'minimal' | 'hacker'
  | 'vr' | 'engine' | 'server' | 'launch' | 'rig' | 'stream' | 'equalizer' | 'discord';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  swatches: string[];
  nav: NavStyle;
  group: 'Signature' | 'Cinematic' | 'Brand' | 'Atmosphere' | 'Backrooms' | 'Technical' | 'Minimal';
  // BootProfile covers the built-in boots; cine boots (e.g. 'backrooms-lvl0')
  // are referenced by id, so allow any string while keeping literal autocomplete.
  boot: BootProfile | (string & {});
}

export const THEMES: ThemeMeta[] = [
  { id: 'neko', name: 'Neko Arcade', tagline: 'Playful · side nav · arcade boot', swatches: ['#ff3d9a', '#25edd0', '#a060ff'], nav: 'side', group: 'Signature', boot: 'arcade' },
  { id: 'nebula', name: 'Nebula 2.0', tagline: 'Cosmic · glass · warp boot', swatches: ['#5b95ff', '#b06bff', '#3ce6ff'], nav: 'side', group: 'Signature', boot: 'cosmic' },

  { id: 'hacker', name: 'Hacker', tagline: 'Intrusion · rail · ACCESS GRANTED boot', swatches: ['#00ff66', '#ff003c', '#0a0a0a'], nav: 'rail', group: 'Cinematic', boot: 'hacker' },
  { id: 'synthwave', name: 'Synthwave', tagline: 'Outrun · neon grid · retro boot', swatches: ['#ff2e97', '#00e5ff', '#b14aff'], nav: 'side', group: 'Cinematic', boot: 'synthwave' },
  { id: 'vaporwave', name: 'Vaporwave', tagline: 'A E S T H E T I C · pastel · retro boot', swatches: ['#ff6ad5', '#26d9d9', '#c774e8'], nav: 'side', group: 'Cinematic', boot: 'synthwave' },
  { id: 'matrix', name: 'Matrix', tagline: 'Code rain · rail · digital boot', swatches: ['#00ff41', '#00cc33', '#001400'], nav: 'rail', group: 'Cinematic', boot: 'matrix' },
  { id: 'aurora', name: 'Aurora', tagline: 'Northern lights · cosmic boot', swatches: ['#2ee6a6', '#8a6bff', '#46d8ff'], nav: 'side', group: 'Cinematic', boot: 'cosmic' },
  { id: 'crimson', name: 'Crimson', tagline: 'Red alert · HUD · siren boot', swatches: ['#ff2d55', '#ff6b00', '#ff003c'], nav: 'side', group: 'Cinematic', boot: 'hud' },
  { id: 'vrchat', name: 'VRChat', tagline: 'Metaverse · headset boot', swatches: ['#0a84ff', '#9d4edd', '#00e5ff'], nav: 'side', group: 'Cinematic', boot: 'vr' },
  { id: 'redline', name: 'Redline', tagline: 'Racing · engine-start boot', swatches: ['#ff2d2d', '#ff8a00', '#1a1a1a'], nav: 'side', group: 'Cinematic', boot: 'engine' },
  { id: 'datacenter', name: 'Datacenter', tagline: 'Servers · rail · POST boot', swatches: ['#00e676', '#00b8d4', '#0a0e0a'], nav: 'rail', group: 'Cinematic', boot: 'server' },
  { id: 'mission', name: 'Mission Control', tagline: 'Launch · countdown boot', swatches: ['#4d8cff', '#fc3d21', '#ffffff'], nav: 'side', group: 'Cinematic', boot: 'launch' },
  { id: 'overclock', name: 'Overclock', tagline: 'RGB rig · gamer boot', swatches: ['#ff0080', '#00ff88', '#0088ff'], nav: 'side', group: 'Cinematic', boot: 'rig' },

  { id: 'discord', name: 'Discord', tagline: 'Blurple · connecting boot', swatches: ['#5865f2', '#57f287', '#eb459e'], nav: 'side', group: 'Brand', boot: 'discord' },
  { id: 'twitch', name: 'Twitch', tagline: 'Stream · GOING LIVE boot', swatches: ['#9147ff', '#bf94ff', '#ff4d4d'], nav: 'side', group: 'Brand', boot: 'stream' },
  { id: 'spotify', name: 'Spotify', tagline: 'Music · equalizer boot', swatches: ['#1db954', '#1ed760', '#191414'], nav: 'side', group: 'Brand', boot: 'equalizer' },

  { id: 'cyberpunk', name: 'Cyberpunk', tagline: 'Night City · glitch HUD boot', swatches: ['#fcee21', '#00f0ff', '#ff003c'], nav: 'side', group: 'Atmosphere', boot: 'hud' },
  { id: 'ocean', name: 'Ocean', tagline: 'Deep sea · dive boot', swatches: ['#38bdf8', '#22d3ee', '#0ea5e9'], nav: 'side', group: 'Atmosphere', boot: 'cosmic' },
  { id: 'forest', name: 'Forest', tagline: 'Nature · calm boot', swatches: ['#4ade80', '#a3e635', '#34d399'], nav: 'side', group: 'Atmosphere', boot: 'minimal' },
  { id: 'sunset', name: 'Sunset', tagline: 'Miami · retro boot', swatches: ['#ff7e5f', '#feb47b', '#ff5e9c'], nav: 'side', group: 'Atmosphere', boot: 'synthwave' },
  { id: 'bubblegum', name: 'Bubblegum', tagline: 'Cute pastel · arcade boot', swatches: ['#ff8fc8', '#8fd9ff', '#ffd98f'], nav: 'side', group: 'Atmosphere', boot: 'arcade' },
  { id: 'frost', name: 'Frost', tagline: 'Ice · crisp boot', swatches: ['#7dd3fc', '#e0f2fe', '#a5f3fc'], nav: 'side', group: 'Atmosphere', boot: 'minimal' },
  { id: 'toxic', name: 'Toxic', tagline: 'Hazard · warning boot', swatches: ['#bef264', '#facc15', '#84cc16'], nav: 'side', group: 'Atmosphere', boot: 'hud' },

  // Backrooms levels-as-themes — each plays a matching VHS level boot.
  { id: 'br-lobby', name: 'The Lobby', tagline: 'Level 0 · mono-yellow · noclip boot', swatches: ['#d9c84a', '#e8d44f', '#b5a83f'], nav: 'side', group: 'Backrooms', boot: 'backrooms-lvl0' },
  { id: 'br-poolrooms', name: 'Poolrooms', tagline: 'Level 37 · liminal water · dive boot', swatches: ['#4fd1e8', '#a5f3fc', '#2dd4bf'], nav: 'side', group: 'Backrooms', boot: 'backrooms-pools' },
  { id: 'br-lightsout', name: 'Lights Out', tagline: 'Level 6 · pitch black · silent boot', swatches: ['#4a7a5a', '#6a9a7a', '#3a5a45'], nav: 'rail', group: 'Backrooms', boot: 'br-lightsout' },
  { id: 'br-run', name: 'Level !', tagline: 'Run for your life · red alert boot', swatches: ['#ff2d2d', '#ff6a3c', '#c0202a'], nav: 'rail', group: 'Backrooms', boot: 'br-run' },
  { id: 'br-thalasso', name: 'Thalassophobia', tagline: 'Level 7 · endless ocean · dive boot', swatches: ['#2b86c0', '#38bdf8', '#0e4d78'], nav: 'side', group: 'Backrooms', boot: 'br-thalasso' },
  { id: 'br-fun', name: 'Level Fun', tagline: 'Level =) · party that never ends', swatches: ['#ff5da2', '#ff8fc8', '#ff3d8a'], nav: 'side', group: 'Backrooms', boot: 'backrooms-fun' },
  { id: 'br-pipes', name: 'Pipe Dreams', tagline: 'Level 2 · rust & steam · tunnel boot', swatches: ['#c2603a', '#ff8a00', '#9a4a2c'], nav: 'side', group: 'Backrooms', boot: 'backrooms-lvl2' },
  { id: 'br-wheat', name: 'Field of Wheat', tagline: 'Level 10 · Limbo · blue-sky boot', swatches: ['#d4b65a', '#7a9ac0', '#b08a3a'], nav: 'side', group: 'Backrooms', boot: 'br-wheat' },
  { id: 'br-redhalls', name: 'The Red Halls', tagline: 'Level 666 · warm & hungry boot', swatches: ['#c0303a', '#ff5e4a', '#8a2028'], nav: 'rail', group: 'Backrooms', boot: 'br-redhalls' },
  { id: 'br-end', name: 'Home · 3999', tagline: 'Level 3999 · reality thins · end boot', swatches: ['#b06bff', '#00e5ff', '#8a4ad0'], nav: 'rail', group: 'Backrooms', boot: 'br-home' },

  { id: 'cyberdeck', name: 'Cyberdeck', tagline: 'Futuristic · top HUD · system boot', swatches: ['#00e5ff', '#ff9d2f', '#19ffb0'], nav: 'top', group: 'Technical', boot: 'hud' },
  { id: 'terminal', name: 'Terminal', tagline: 'Phosphor · rail · CRT boot', swatches: ['#2dff78', '#0a3d1a', '#b6ffc4'], nav: 'rail', group: 'Technical', boot: 'terminal' },

  { id: 'studio', name: 'Studio', tagline: 'Clean · side nav · quick boot', swatches: ['#6d72f6', '#f4f4f5', '#09090b'], nav: 'side', group: 'Minimal', boot: 'minimal' },
  { id: 'obsidian', name: 'Obsidian', tagline: 'Black & gold · sleek · quick boot', swatches: ['#e8c879', '#1a1a1a', '#0a0a0a'], nav: 'side', group: 'Minimal', boot: 'minimal' },
  { id: 'daylight', name: 'Daylight', tagline: 'Light · airy · quick boot', swatches: ['#3b6ef5', '#f8fafc', '#e2e8f0'], nav: 'side', group: 'Minimal', boot: 'minimal' },
];

const KEY = 'maow.v2.theme';
const DEFAULT: ThemeId = 'neko';

function initial(): ThemeId {
  if (!browser) return DEFAULT;
  const saved = localStorage.getItem(KEY) as ThemeId | null;
  return saved && THEMES.some((t) => t.id === saved) ? saved : DEFAULT;
}

export const theme = writable<ThemeId>(initial());
export const currentTheme = derived(theme, ($t) => THEMES.find((m) => m.id === $t) ?? THEMES[0]);

export function setTheme(id: ThemeId) {
  theme.set(id);
  if (browser) {
    localStorage.setItem(KEY, id);
    document.documentElement.setAttribute('data-theme', id);
  }
}
