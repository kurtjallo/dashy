import { describe, it, expect } from 'vitest';
import type { ActivityEvent } from '@dashy/shared';
import { activityFrame } from '../src/realtime/serialize.js';

// Pure SSE frame serializer (no DB/socket): proves the canonical wire format the
// hub and the Last-Event-ID replay path both emit (ARCHITECTURE.md §4.2).

const ev: ActivityEvent = {
  id: 'evt_01J9XQ8KZ3',
  source: 'github',
  agent_id: null,
  agent: 'claude-code',
  actor: 'octocat',
  actor_kind: 'agent',
  confidence: 'inferred',
  repo: 'acme/api',
  action_type: 'pr_merged',
  impact: 'high',
  occurred_at: '2026-06-12T01:00:00.000Z',
  stored_at: '2026-06-12T01:00:05.000Z',
  payload_ref: { pr_number: 42, title: 'Ship it' },
};

describe('activityFrame', () => {
  it('emits id / event / data lines terminated by a blank line', () => {
    const frame = activityFrame(ev);
    expect(frame).toBe(
      `id: ${ev.id}\nevent: activity\ndata: ${JSON.stringify(ev)}\n\n`,
    );
  });

  it('sets the SSE id to the event ULID so Last-Event-ID replay works for free', () => {
    const lines = activityFrame(ev).split('\n');
    expect(lines[0]).toBe('id: evt_01J9XQ8KZ3');
    expect(lines[1]).toBe('event: activity');
    expect(lines[2].startsWith('data: ')).toBe(true);
  });

  it('serializes the full canonical event as JSON in the data line', () => {
    const dataLine = activityFrame(ev).split('\n')[2];
    const parsed = JSON.parse(dataLine.slice('data: '.length)) as ActivityEvent;
    expect(parsed).toEqual(ev);
  });

  it('terminates the frame with exactly one blank line', () => {
    expect(activityFrame(ev).endsWith('\n\n')).toBe(true);
  });
});
