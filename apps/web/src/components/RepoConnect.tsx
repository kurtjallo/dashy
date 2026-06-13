'use client';

import { useCallback, useState } from 'react';
import { connectRepo, getRepos, type RepoItem } from '@/lib/api';

/** Expandable panel: lists the user's GitHub repos and connects one (installs its webhook). */
export default function RepoConnect({ onConnected }: { onConnected: () => void }) {
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<RepoItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openPanel = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const list = await getRepos();
      if (!list) setError('Could not load your repositories.');
      setRepos(list);
    } catch {
      setError('Could not load your repositories.');
    } finally {
      setLoading(false);
    }
  }, []);

  const onConnect = useCallback(
    async (repo: RepoItem) => {
      setBusy(repo.fullName);
      setError(null);
      const res = await connectRepo(repo.fullName, repo.githubRepoId);
      setBusy(null);
      if (!res.ok) {
        setError(`Failed to connect ${repo.fullName}.`);
        return;
      }
      setRepos(
        (prev) =>
          prev?.map((r) => (r.fullName === repo.fullName ? { ...r, connected: true } : r)) ?? null,
      );
      if (res.status === 'failed') {
        setError(
          `${repo.fullName} saved, but GitHub could not reach the webhook URL. Is WEBHOOK_PUBLIC_URL set to your tunnel?`,
        );
      }
      onConnected();
    },
    [onConnected],
  );

  if (!open) {
    return (
      <div className="repo-connect-bar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openPanel()}>
          Connect a repo
        </button>
      </div>
    );
  }

  return (
    <div className="repo-panel">
      <div className="repo-panel-head">
        <span>Your repositories</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      {loading && <p className="muted">Loading repos…</p>}
      {error && <p className="repo-error">{error}</p>}
      {repos && repos.length === 0 && !loading && <p className="muted">No repositories found.</p>}

      {repos && repos.length > 0 && (
        <ul className="repo-list">
          {repos.map((repo) => (
            <li key={repo.githubRepoId} className="repo-row">
              <span className="repo-name">{repo.fullName}</span>
              {repo.connected ? (
                <span className="repo-connected">Connected</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm repo-connect-btn"
                  disabled={busy === repo.fullName}
                  onClick={() => void onConnect(repo)}
                >
                  {busy === repo.fullName ? 'Connecting…' : 'Connect'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
