import { describe, it, expect } from 'vitest';
import { maskSlackUrl } from '../src/http/routes/slack.js';
import {
  renderAlertBlocks,
  renderDigestBlocks,
  type SlackAlertEvent,
} from '../src/notifications/slack/blockkit.js';

// Pure formatting: URL masking (secret never leaves the server) + Block Kit render
// shape (metadata only, never code/diffs) — ARCHITECTURE.md §4.4 / §5.4.

describe('maskSlackUrl', () => {
  const SECRET = 'https://hooks.slack.com/services/T01ABC/B02DEF/abc123XYZsecret';

  it('keeps scheme, host and first path token but drops the secret tail', () => {
    const masked = maskSlackUrl(SECRET);
    expect(masked).toBe('https://hooks.slack.com/services/•••');
    expect(masked).not.toContain('B02DEF');
    expect(masked).not.toContain('abc123XYZsecret');
  });

  it('masks even when there is no path beyond the host', () => {
    expect(maskSlackUrl('https://hooks.slack.com')).toBe('https://hooks.slack.com/•••');
  });
});

describe('renderAlertBlocks', () => {
  const base: SlackAlertEvent = {
    alert_type: 'protected_branch_merge',
    action_type: 'pr_merged',
    repo: 'acme/api',
    actor: 'octocat',
    agent: 'claude-code',
    payload_ref: {
      pr_number: 42,
      title: 'Ship the thing',
      url: 'https://github.com/acme/api/pull/42',
      base_branch: 'main',
    },
  };

  it('returns a { blocks: [...] } payload led by a header block', () => {
    const out = renderAlertBlocks(base);
    expect(Array.isArray(out.blocks)).toBe(true);
    expect(out.blocks.length).toBeGreaterThanOrEqual(2);
    const header = out.blocks[0] as { type: string };
    expect(header.type).toBe('header');
  });

  it('renders metadata (repo, agent, PR title/link) but never code or diffs', () => {
    const json = JSON.stringify(renderAlertBlocks(base));
    expect(json).toContain('acme/api');
    expect(json).toContain('claude-code');
    expect(json).toContain('PR #42');
    expect(json).toContain('https://github.com/acme/api/pull/42');
    expect(json).not.toContain('diff');
    expect(json).not.toContain('patch');
  });

  it('still renders a valid header for an agent_run_failed alert', () => {
    const out = renderAlertBlocks({ ...base, alert_type: 'agent_run_failed', action_type: 'devin_task_failed' });
    expect((out.blocks[0] as { type: string }).type).toBe('header');
  });
});

describe('renderDigestBlocks', () => {
  it('summarizes counts in a header + section, scoped to the repo', () => {
    const out = renderDigestBlocks({ repo: 'acme/api', count: 8, mergeCount: 6, failedCount: 2 });
    expect((out.blocks[0] as { type: string }).type).toBe('header');
    const json = JSON.stringify(out);
    expect(json).toContain('8 agent events');
    expect(json).toContain('acme/api');
    expect(json).toContain('6 protected-branch merges');
    expect(json).toContain('2 failed runs');
  });
});
