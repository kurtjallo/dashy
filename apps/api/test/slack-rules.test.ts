import { describe, it, expect } from 'vitest';
import { mapAlertType, type SlackRuleInput } from '../src/notifications/slack/rules.js';

// Pure FR-4 alert-type mapping (no DB): proves which canonical events qualify for a
// Slack alert and which do not (ARCHITECTURE.md §4.4).

function input(over: Partial<SlackRuleInput>): SlackRuleInput {
  return {
    workspaceId: 'ws_1',
    eventId: 'evt_1',
    action_type: 'pr_merged',
    actor_kind: 'agent',
    repo: 'acme/api',
    payload_ref: { base_branch: 'main', default_branch: 'main' },
    ...over,
  };
}

describe('mapAlertType (FR-4)', () => {
  it('maps an agent merge into the default branch to protected_branch_merge', () => {
    expect(mapAlertType(input({}))).toBe('protected_branch_merge');
  });

  it('maps devin_task_failed to agent_run_failed', () => {
    expect(
      mapAlertType(input({ action_type: 'devin_task_failed', payload_ref: null })),
    ).toBe('agent_run_failed');
  });

  it('does NOT alert when the merge targets a non-default branch', () => {
    expect(
      mapAlertType(input({ payload_ref: { base_branch: 'feature/x', default_branch: 'main' } })),
    ).toBeNull();
  });

  it('does NOT alert when the merge was performed by a human actor', () => {
    expect(mapAlertType(input({ actor_kind: 'human' }))).toBeNull();
  });

  it('does NOT alert when branch metadata is missing', () => {
    expect(mapAlertType(input({ payload_ref: { base_branch: 'main' } }))).toBeNull();
    expect(mapAlertType(input({ payload_ref: null }))).toBeNull();
  });

  it('does NOT alert for non-qualifying action types', () => {
    expect(mapAlertType(input({ action_type: 'pr_opened' }))).toBeNull();
    expect(mapAlertType(input({ action_type: 'commit_pushed' }))).toBeNull();
  });
});
