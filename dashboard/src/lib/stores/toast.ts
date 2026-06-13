// In-app toast feed. push() shows a transient toast; all are kept in a history.
import { writable } from 'svelte/store';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'warn' | 'error';
  ts: number;
}

export const toasts = writable<Toast[]>([]); // currently visible
export const toastHistory = writable<Toast[]>([]); // last ~50

let seq = 1;

export function pushToast(text: string, kind: Toast['kind'] = 'info', ttl = 4000) {
  const t: Toast = { id: seq++, text, kind, ts: Date.now() };
  toasts.update((arr) => [...arr, t]);
  toastHistory.update((arr) => [t, ...arr].slice(0, 50));
  if (ttl > 0) setTimeout(() => dismissToast(t.id), ttl);
  return t.id;
}

export function dismissToast(id: number) {
  toasts.update((arr) => arr.filter((t) => t.id !== id));
}
