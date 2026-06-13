'use client';

import type { ActivityEvent, ActionType } from '@dashy/shared';

const ACTION_LABELS: Record<ActionType, string> = {
  pr_opened: 'opened a PR',
  pr_merged: 'merged a PR',
  pr_closed: 'closed a PR',
  commit_pushed: 'pushed commits',
  issue_opened: 'opened an issue',
  issue_closed: 'closed an issue',
  devin_task_completed: 'completed a task',
  devin_task_failed: 'failed a task',
  cursor_session: 'ran a session',
};

function humanizeAction(action: ActionType): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function agentLabel(event: ActivityEvent): string {
  if (event.agent) return event.agent;
  if (event.actor_kind === 'human' && event.actor) return event.actor;
  return 'unattributed';
}

export default function ActivityCard({ event }: { event: ActivityEvent }) {
  const url = event.payload_ref?.url;
  const title = event.payload_ref?.title;
  const attributed = event.agent != null;

  return (
    <article className="card activity">
      <span
        className={`impact-dot impact-${event.impact}`}
        title={`${event.impact} impact`}
        aria-hidden
      />
      <div className="activity-main">
        <div className="activity-line">
          <span className={`agent-badge${attributed ? '' : ' agent-badge--muted'}`}>
            {agentLabel(event)}
          </span>
          <span className="activity-action">{humanizeAction(event.action_type)}</span>
          {event.repo && <span className="activity-repo">{event.repo}</span>}
        </div>
        {title && <p className="activity-title">{title}</p>}
        <div className="activity-meta">
          <time dateTime={event.occurred_at}>{relativeTime(event.occurred_at)}</time>
          {url && (
            <>
              <span className="dot-sep" aria-hidden>
                ·
              </span>
              <a href={url} target="_blank" rel="noreferrer noopener" className="activity-link">
                View on GitHub
              </a>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
