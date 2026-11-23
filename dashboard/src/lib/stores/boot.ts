// Boot-screen selection state.
//  - bootOverride: which boot profile plays on load. 'auto' = follow the
//    active theme's boot. Anything else forces that specific boot (including
//    the 25 cinematic ones that no theme uses by default).
//  - bootPreview: when non-null, the layout renders BootScreen immediately to
//    replay that profile once (Boot Lab "Preview"), then clears back to null.
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const OVR = 'maow.v2.bootoverride';

function initialOverride(): string {
  if (!browser) return 'auto';
  return localStorage.getItem(OVR) || 'auto';
}

export const bootOverride = writable<string>(initialOverride());
export const bootPreview = writable<string | null>(null);

export function setBootOverride(id: string) {
  bootOverride.set(id);
  if (browser) localStorage.setItem(OVR, id);
}

export function previewBoot(id: string) {
  bootPreview.set(id);
}
