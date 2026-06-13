'use client';

import type { ActivityEvent } from '@dashy/shared';

function computeStats(events: ActivityEvent[]) {
  let prsOpened = 0;
  let prsMerged = 0;
  let issuesClosed = 0;
  let commits = 0;
  const agents = new Set<string>();

  for (const e of events) {
    if (e.agent) agents.add(e.agent);
    switch (e.action_type) {
      case 'pr_opened':
        prsOpened += 1;
        break;
      case 'pr_merged':
        prsMerged += 1;
        break;
      case 'issue_closed':
        issuesClosed += 1;
        break;
      case 'commit_pushed':
        commits += 1;
        break;
      default:
        break;
    }
  }

  return { prsOpened, prsMerged, issuesClosed, commits, agentsActive: agents.size };
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function Summary({ events }: { events: ActivityEvent[] }) {
  const s = computeStats(events);

  return (
    <section className="summary">
      <Stat label="PRs opened" value={s.prsOpened} />
      <Stat label="PRs merged" value={s.prsMerged} />
      <Stat label="Issues closed" value={s.issuesClosed} />
      <Stat label="Commits" value={s.commits} />
      <Stat label="Agents active" value={s.agentsActive} />
    </section>
  );
}
