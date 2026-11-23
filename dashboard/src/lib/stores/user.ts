// Current dashboard user + rank, loaded from /api/auth/me.
import { writable } from 'svelte/store';
import { api, clearSession, type ApiError } from '$lib/api';

export interface Me {
  loggedIn: boolean;
  userId?: string;
  username?: string;
  tag?: string;
  avatar?: string;
  rank?: 'owner' | 'admin' | 'moderator' | 'member' | 'banned';
}

export const me = writable<Me>({ loggedIn: false });

const RANK_ORDER = ['banned', 'member', 'moderator', 'admin', 'owner'];

export function rankAtLeast(rank: string | undefined, min: string): boolean {
  if (!rank) return false;
  return RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf(min);
}

export async function loadMe(): Promise<Me> {
  try {
    // /api/auth/me returns { configured, user: { userId, tag, avatar, ... }, rank }
    const data = await api.get<any>('/api/auth/me');
    const u = data?.user;
    const value: Me = u
      ? {
          loggedIn: true,
          userId: u.userId,
          username: u.tag ?? u.username,
          tag: u.tag,
          avatar: u.avatar ?? undefined,
          rank: data.rank ?? 'member',
        }
      : { loggedIn: false };
    me.set(value);
    return value;
  } catch (e) {
    const status = (e as ApiError).status;
    const value: Me = { loggedIn: false };
    me.set(value);
    if (status !== 401) console.warn('[auth] loadMe failed:', (e as Error).message);
    return value;
  }
}

// Begin Discord OAuth. The server's /api/auth/discord/start is a POST that
// takes the redirect_uri and returns the Discord authorize URL to navigate to.
export async function startLogin() {
  const redirect = `${location.origin}/api/auth/discord/callback`;
  try {
    const res = await api.post<{ authUrl?: string; error?: string }>('/api/auth/discord/start', { redirect });
    if (res.authUrl) {
      location.href = res.authUrl;
    } else {
      alert(res.error || 'Login failed — OAuth may not be configured.');
    }
  } catch (e) {
    alert(`Login failed: ${(e as Error).message}`);
  }
}

export async function logout() {
  try {
    await api.post('/api/auth/logout', {});
  } catch {
    /* ignore — clear locally regardless */
  }
  clearSession();
  me.set({ loggedIn: false });
  location.reload();
}
