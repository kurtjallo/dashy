'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ActivityEvent } from '@dashy/shared';
import { API, devLogin, getFeed, getMe, logout, type Me } from '@/lib/api';
import ActivityCard from '@/components/ActivityCard';
import Summary from '@/components/Summary';
import RepoConnect from '@/components/RepoConnect';

const IS_DEV = process.env.NODE_ENV !== 'production';

type Status = 'loading' | 'signed-out' | 'signed-in' | 'error';

export default function Home() {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const profile = await getMe();
      if (!profile) {
        setMe(null);
        setStatus('signed-out');
        return;
      }
      setMe(profile);
      const feed = (await getFeed()) ?? [];
      feed.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      setEvents(feed);
      setStatus('signed-in');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDevLogin = useCallback(async () => {
    if (await devLogin()) window.location.reload();
  }, []);

  const onLogout = useCallback(async () => {
    await logout();
    setMe(null);
    setEvents([]);
    setStatus('signed-out');
  }, []);

  if (status === 'loading') {
    return (
      <main className="center">
        <p className="muted">Loading your overnight briefing…</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="center">
        <div className="signin-card">
          <h1 className="brand">Dashy.ai</h1>
          <p className="muted">Couldn’t reach the dashboard service.</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (status === 'signed-out' || !me) {
    return (
      <main className="center">
        <div className="signin-card">
          <h1 className="brand">Dashy.ai</h1>
          <p className="muted">See what your AI agents shipped overnight.</p>
          <a className="btn btn-primary" href={`${API}/api/v1/auth/github`}>
            Sign in with GitHub
          </a>
          {IS_DEV && (
            <button type="button" className="btn btn-ghost" onClick={() => void onDevLogin()}>
              Dev login
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="app-header">
        <div className="app-header-left">
          <span className="brand">Dashy.ai</span>
          <span className="ws-name">{me.workspace?.name ?? 'Workspace'}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onLogout()}>
          Log out
        </button>
      </header>

      <h1 className="page-title">Overnight activity</h1>
      <RepoConnect onConnected={() => void load()} />

      <Summary events={events} />

      {events.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No overnight activity yet</p>
          <p className="muted">Connect a repo to start tracking what your agents ship.</p>
        </div>
      ) : (
        <section className="feed">
          {events.map((event) => (
            <ActivityCard key={event.id} event={event} />
          ))}
        </section>
      )}
    </main>
  );
}
