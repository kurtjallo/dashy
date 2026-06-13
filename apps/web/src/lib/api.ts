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

/** A GitHub repo as returned by GET /api/v1/repos. */
export interface RepoItem {
  githubRepoId: number;
  fullName: string;
  connected: boolean;
}

/** List the signed-in user's GitHub repos with connection status, or null on 401. */
export async function getRepos(): Promise<RepoItem[] | null> {
  const body = await getJson<{ repos: RepoItem[] }>('/api/v1/repos');
  return body?.repos ?? null;
}

/** Connect a repo (installs the webhook). Returns the resulting webhook status. */
export async function connectRepo(
  fullName: string,
  githubRepoId: number,
): Promise<{ ok: boolean; status?: string; note?: string }> {
  const res = await fetch(`${API}/api/v1/repos`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ fullName, githubRepoId }),
  });
  if (!res.ok) return { ok: false };
  const data = (await res.json()) as { repo?: { webhook_status?: string }; note?: string };
  return { ok: true, status: data.repo?.webhook_status, note: data.note };
}

/** A connected Slack webhook (URL returned MASKED only). Mirrors slack_webhooks. */
export interface SlackWebhook {
  id: string;
  name: string;
  url_masked: string;
  status: string;
  last_delivery_at: string | null;
}

/** A Slack alert rule. Mirrors slack_alert_rules. */
export interface SlackRule {
  id: string;
  webhook_id: string | null;
  repo_id: string | null;
  event_types: string[];
  enabled: boolean;
  created_at: string;
}

/** Combined Slack config returned by GET /api/v1/integrations/slack. */
export interface SlackConfig {
  webhooks: SlackWebhook[];
  rules: SlackRule[];
}

/** Connected Slack webhooks + alert rules for the workspace, or null on 401. */
export function listSlack(): Promise<SlackConfig | null> {
  return getJson<SlackConfig>('/api/v1/integrations/slack');
}

/** Register a Slack webhook (server encrypts the URL, returns it masked). */
export async function addSlackWebhook(name: string, url: string): Promise<SlackWebhook | null> {
  const res = await fetch(`${API}/api/v1/integrations/slack`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ name, url }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { webhook: SlackWebhook };
  return data.webhook;
}

/** Send a test alert to a webhook. Resolves to the Slack HTTP status, or null on failure. */
export async function testSlackWebhook(webhookId: string): Promise<number | null> {
  const res = await fetch(`${API}/api/v1/integrations/slack/test`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ webhookId }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { status: number };
  return data.status;
}

/** Remove a Slack webhook. Returns true on success. */
export async function deleteSlackWebhook(id: string): Promise<boolean> {
  const res = await fetch(`${API}/api/v1/integrations/slack/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  return res.ok;
}

/** Create a Slack alert rule (repoId null = all repos). */
export async function addSlackRule(input: {
  webhookId: string;
  repoId?: string | null;
  eventTypes: string[];
}): Promise<SlackRule | null> {
  const res = await fetch(`${API}/api/v1/integrations/slack/rules`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      webhookId: input.webhookId,
      repoId: input.repoId ?? null,
      eventTypes: input.eventTypes,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { rule: SlackRule };
  return data.rule;
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
