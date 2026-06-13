/**
 * Slack Block Kit renderers for Dashy.ai alerts (docs/ARCHITECTURE.md §4.4).
 *
 * Two message shapes:
 *  - renderAlertBlocks: a single qualifying event (protected_branch_merge | agent_run_failed).
 *  - renderDigestBlocks: the burst-collapse summary fired once per (rule, webhook) 5-min window
 *    when more than 5 alerts land in the window (FR-8).
 *
 * Metadata only — titles, counts, URLs. Never code content or diffs (ARCHITECTURE.md §5.4).
 */

/** The subset of an event row the alert renderer needs. */
export interface SlackAlertEvent {
  /** Mapped alert type, e.g. 'protected_branch_merge' | 'agent_run_failed'. */
  alert_type: string;
  /** Canonical action_type that triggered the alert. */
  action_type: string;
  /** owner/name, or null. */
  repo: string | null;
  /** Login at the source (the agent/human that produced the event). */
  actor: string | null;
  /** Resolved agent slug, or null when unattributed. */
  agent: string | null;
  /** Event payload summary (PR title, url, branches, …). */
  payload_ref: Record<string, unknown> | null;
}

/** The summary the digest renderer needs. */
export interface SlackDigestSummary {
  /** owner/name the burst is scoped to, or null when mixed/unknown. */
  repo: string | null;
  /** Total events collapsed into this digest. */
  count: number;
  /** Count of protected-branch merges in the window. */
  mergeCount: number;
  /** Count of failed agent runs in the window. */
  failedCount: number;
  /** Optional deep link back into the filtered Dashy.ai feed. */
  feedUrl?: string;
}

/** Human label for an alert type. */
function alertTitle(alertType: string): string {
  switch (alertType) {
    case 'protected_branch_merge':
      return ':rotating_light: Agent merged to a protected branch';
    case 'agent_run_failed':
      return ':warning: Agent run failed';
    default:
      return ':bell: Agent activity alert';
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Render a single-event alert. Returns a `{ blocks }` payload posted verbatim to
 * the Slack incoming webhook.
 */
export function renderAlertBlocks(ev: SlackAlertEvent): { blocks: unknown[] } {
  const p = ev.payload_ref ?? {};
  const title = asString(p.title);
  const url = asString(p.url);
  const prNumber = asNumber(p.pr_number);
  const baseBranch = asString(p.base_branch);

  const who = ev.agent ?? ev.actor ?? 'an agent';
  const repo = ev.repo ?? 'unknown repo';

  const contextParts: string[] = [`*Repo:* ${repo}`, `*Actor:* ${who}`];
  if (baseBranch) contextParts.push(`*Branch:* \`${baseBranch}\``);

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: alertTitle(ev.alert_type), emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: contextParts.join('  •  '),
      },
    },
  ];

  if (title || url) {
    const label = prNumber !== undefined ? `PR #${prNumber}` : ev.action_type;
    const linked = url ? `<${url}|${title ?? label}>` : (title ?? label);
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${label}:* ${linked}` },
    });
  }

  return { blocks };
}

/**
 * Render the burst-collapse digest (one message for >5 alerts in a 5-min window).
 */
export function renderDigestBlocks(summary: SlackDigestSummary): { blocks: unknown[] } {
  const repo = summary.repo ?? 'multiple repos';
  const pieces: string[] = [];
  if (summary.mergeCount > 0) {
    pieces.push(`${summary.mergeCount} protected-branch merge${summary.mergeCount === 1 ? '' : 's'}`);
  }
  if (summary.failedCount > 0) {
    pieces.push(`${summary.failedCount} failed run${summary.failedCount === 1 ? '' : 's'}`);
  }
  const breakdown = pieces.length > 0 ? ` — ${pieces.join(', ')}` : '';

  const headline = `*${summary.count} agent events in the last 5 min in \`${repo}\`*${breakdown}`;
  const text = summary.feedUrl ? `${headline}\n<${summary.feedUrl}|View in Dashy.ai>` : headline;

  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':inbox_tray: Agent activity digest', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text },
      },
    ],
  };
}
