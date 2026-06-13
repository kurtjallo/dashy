import { describe, it, expect } from 'vitest';
import { mapGithubEvent } from '../src/ingestion/normalize.js';

// Pure mapping test (no DB): proves the GitHub action map from CLAUDE.md / ARCHITECTURE.md §2.
// pull_request.opened -> pr_opened; pull_request.closed+merged -> pr_merged.

describe('mapGithubEvent', () => {
  it('maps pull_request.opened to pr_opened with repo, actor, and metadata-only payload_ref', () => {
    const payload = {
      action: 'opened',
      repository: { full_name: 'acme/widgets', default_branch: 'main' },
      sender: { login: 'octocat' },
      pull_request: {
        number: 42,
        merged: false,
        title: 'Add widget',
        html_url: 'https://github.com/acme/widgets/pull/42',
        created_at: '2026-06-12T01:00:00Z',
        updated_at: '2026-06-12T01:05:00Z',
        additions: 10,
        deletions: 2,
        base: { ref: 'main' },
      },
    };

    const result = mapGithubEvent('pull_request', payload);
    expect(result).not.toBeNull();
    expect(result?.action_type).toBe('pr_opened');
    expect(result?.repo).toBe('acme/widgets');
    expect(result?.actor).toBe('octocat');
    expect(result?.impact).toBe('medium');
    expect(result?.occurred_at).toBe('2026-06-12T01:05:00Z');
    expect(result?.payload_ref).toMatchObject({ pr_number: 42, title: 'Add widget' });
    // metadata only — no code/diff content leaks through
    expect(JSON.stringify(result?.payload_ref)).not.toContain('diff');
  });

  it('maps pull_request.closed + merged to pr_merged with high impact', () => {
    const payload = {
      action: 'closed',
      repository: { full_name: 'acme/widgets', default_branch: 'main' },
      sender: { login: 'octocat' },
      pull_request: {
        number: 42,
        merged: true,
        html_url: 'https://github.com/acme/widgets/pull/42',
        updated_at: '2026-06-12T02:00:00Z',
      },
    };

    const result = mapGithubEvent('pull_request', payload);
    expect(result?.action_type).toBe('pr_merged');
    expect(result?.repo).toBe('acme/widgets');
    expect(result?.impact).toBe('high');
  });

  it('maps pull_request.closed without merge to pr_closed', () => {
    const result = mapGithubEvent('pull_request', {
      action: 'closed',
      repository: { full_name: 'acme/widgets' },
      pull_request: { number: 7, merged: false },
    });
    expect(result?.action_type).toBe('pr_closed');
  });

  it('returns null for unsupported events', () => {
    expect(mapGithubEvent('star', { repository: { full_name: 'acme/widgets' } })).toBeNull();
  });
});
