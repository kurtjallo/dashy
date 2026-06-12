import { describe, it, expect } from 'vitest';
import { activityEventSchema, actionTypeSchema, ACTION_TYPES } from './events.js';
import { agentSlugSchema } from './agents.js';

const validEvent = {
  id: 'evt_01J9XQ8KZ3',
  source: 'github',
  agent_id: 'agt_01J9W',
  agent: 'devin',
  actor: 'devin-ai-integration[bot]',
  actor_kind: 'agent',
  confidence: 'exact',
  repo: 'acme/payments-api',
  action_type: 'pr_opened',
  impact: 'medium',
  occurred_at: '2026-06-12T08:58:41Z',
  stored_at: '2026-06-12T08:59:02Z',
  payload_ref: { pr_number: 412, url: 'https://github.com/acme/payments-api/pull/412' },
};

describe('activityEventSchema', () => {
  it('accepts a well-formed event', () => {
    expect(activityEventSchema.parse(validEvent)).toMatchObject({ id: 'evt_01J9XQ8KZ3' });
  });

  it('rejects an unknown action_type', () => {
    expect(() => activityEventSchema.parse({ ...validEvent, action_type: 'force_pushed' })).toThrow();
  });

  it('allows null attribution (the honest unattributed case)', () => {
    const e = { ...validEvent, agent_id: null, agent: null, actor_kind: 'unattributed', confidence: 'unknown' };
    expect(activityEventSchema.parse(e).agent).toBeNull();
  });
});

describe('actionTypeSchema', () => {
  it('exposes exactly the 9 canonical action types', () => {
    expect(ACTION_TYPES).toHaveLength(9);
    for (const t of ACTION_TYPES) expect(actionTypeSchema.parse(t)).toBe(t);
  });
});

describe('agentSlugSchema', () => {
  it('accepts built-in slugs and custom:<name>', () => {
    expect(agentSlugSchema.parse('claude-code')).toBe('claude-code');
    expect(agentSlugSchema.parse('custom:internal-bot')).toBe('custom:internal-bot');
  });

  it('rejects an unprefixed custom slug', () => {
    expect(() => agentSlugSchema.parse('internal-bot')).toThrow();
  });
});
