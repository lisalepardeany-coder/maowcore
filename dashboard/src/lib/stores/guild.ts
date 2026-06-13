// Selected guild (server). Most admin/community endpoints need ?guildId=.
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { liveState } from '$lib/ws';

const KEY = 'maow.v2.guild';

function initial(): string {
  if (!browser) return '';
  return localStorage.getItem(KEY) || '';
}

export const selectedGuildId = writable<string>(initial());

export function setGuild(id: string) {
  selectedGuildId.set(id);
  if (browser) localStorage.setItem(KEY, id);
}

// Effective guild: the chosen one, or fall back to the first connected guild.
export const guildId = derived(
  [selectedGuildId, liveState],
  ([$sel, $state]) => $sel || $state.guilds?.[0]?.id || '',
);
