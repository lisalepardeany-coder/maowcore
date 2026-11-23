// Typed REST client for the MaowCore control server.
// Talks to the SAME /api endpoints the legacy dashboard uses.
import { browser } from '$app/environment';

const SESSION_KEY = 'maow.session';

export function getSession(): string {
  if (!browser) return '';
  return localStorage.getItem(SESSION_KEY) || '';
}

export function setSession(token: string) {
  if (browser) localStorage.setItem(SESSION_KEY, token);
}

export function clearSession() {
  if (browser) localStorage.removeItem(SESSION_KEY);
}

/** Capture #maow_session=... from the OAuth redirect hash, persist, and clean URL. */
export function captureSessionFromHash() {
  if (!browser) return;
  const m = location.hash.match(/maow_session=([^&]+)/);
  if (m) {
    setSession(decodeURIComponent(m[1]));
    history.replaceState(null, '', location.pathname + location.search);
  }
}

export interface ApiError extends Error {
  status: number;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const sess = getSession();
  if (sess) headers['X-Maow-Session'] = sess;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // One retry on transient network failure (brief instance restarts).
    await new Promise((r) => setTimeout(r, 400));
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  if (res.status === 401) {
    clearSession();
    const err = new Error('Not signed in') as ApiError;
    err.status = 401;
    throw err;
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const err = new Error(
      `Expected JSON from ${path} but got ${ct || 'no content-type'}. Is the bot running on :8765?`,
    ) as ApiError;
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
