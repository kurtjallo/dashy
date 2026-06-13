import type { ActivityEvent } from '@dashy/shared';

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** Shape returned by GET /api/v1/me (matches apps/api routes/auth.ts). */
export interface Me {
  user: {
    id: string;
    github_login: string;
    avatar_url: string | null;
  };
  workspace: {
    id: string;
    name: string;
  };
}

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

/** Current user + workspace, or null when not signed in (401). */
export function getMe(): Promise<Me | null> {
  return getJson<Me>('/api/v1/me');
}

/**
 * Overnight activity feed. The endpoint returns the canonical wire shape; we
 * accept a bare array or an envelope ({ events } / { items }) defensively.
 */
export async function getFeed(): Promise<ActivityEvent[] | null> {
  const body = await getJson<unknown>('/api/v1/feed');
  if (body == null) return null;
  if (Array.isArray(body)) return body as ActivityEvent[];
  const env = body as { events?: ActivityEvent[]; items?: ActivityEvent[] };
  return env.events ?? env.items ?? [];
}

/** Dev-only credential bypass. Returns true on success. */
export async function devLogin(): Promise<boolean> {
  const res = await fetch(`${API}/api/v1/auth/dev-login`, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  return res.ok;
}

/** Clears the session cookie server-side. */
export async function logout(): Promise<void> {
  await fetch(`${API}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}
