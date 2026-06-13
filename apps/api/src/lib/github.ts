import { config } from '../config/env.js';

const GITHUB_API = 'https://api.github.com';

async function ghJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dashy.ai',
    },
  });
  if (!res.ok) throw new Error(`GitHub GET ${url} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Exchange an OAuth code for an access token, then load the user profile. */
export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  login: string;
  githubId: number;
  email: string | null;
  avatarUrl: string | null;
}> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.GITHUB_OAUTH_CLIENT_ID,
      client_secret: config.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  if (!tokenRes.ok) throw new Error(`GitHub token exchange failed: ${tokenRes.status}`);
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) throw new Error(`GitHub token exchange error: ${tokenJson.error ?? 'no token'}`);
  const accessToken = tokenJson.access_token;

  const user = await ghJson<{
    login: string;
    id: number;
    email: string | null;
    avatar_url: string | null;
  }>(`${GITHUB_API}/user`, accessToken);

  return {
    accessToken,
    login: user.login,
    githubId: user.id,
    email: user.email ?? null,
    avatarUrl: user.avatar_url ?? null,
  };
}

/** List the authenticated user's repos (most recently pushed first). */
export async function listRepos(token: string): Promise<Array<{ githubRepoId: number; fullName: string }>> {
  const repos = await ghJson<Array<{ id: number; full_name: string }>>(
    `${GITHUB_API}/user/repos?per_page=100&sort=pushed`,
    token,
  );
  return repos.map((r) => ({ githubRepoId: r.id, fullName: r.full_name }));
}

/** Install a webhook on a repo for pull_request/push/issues events. */
export async function createWebhook(
  token: string,
  fullName: string,
  secret: string,
  url: string,
): Promise<{ hookId: number }> {
  const res = await fetch(`${GITHUB_API}/repos/${fullName}/hooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'dashy.ai',
    },
    body: JSON.stringify({
      name: 'web',
      active: true,
      events: ['pull_request', 'push', 'issues'],
      config: { url, content_type: 'json', secret },
    }),
  });
  if (!res.ok) throw new Error(`GitHub createWebhook ${fullName} failed: ${res.status} ${await res.text()}`);
  const hook = (await res.json()) as { id: number };
  return { hookId: hook.id };
}
