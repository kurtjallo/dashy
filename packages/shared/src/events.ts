import { z } from 'zod';
import { agentSlugSchema, attributionConfidenceSchema } from './agents.js';

/**
 * Canonical 9-value action enum (docs/ARCHITECTURE.md §2). v0.1 (GitHub) emits the
 * first six; the Cursor/Devin three ship in the enum now so v0.2 needs no migration.
 * These literals MUST stay in lockstep with the CHECK constraint in
 * apps/api/migrations/006_filters.sql (a drift test asserts this).
 */
export const ACTION_TYPES = [
  'pr_opened',
  'pr_merged',
  'pr_closed',
  'commit_pushed',
  'issue_opened',
  'issue_closed',
  'devin_task_completed',
  'devin_task_failed',
  'cursor_session',
] as const;

export const actionTypeSchema = z.enum(ACTION_TYPES);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const IMPACT_LEVELS = ['high', 'medium', 'low'] as const;
export const impactLevelSchema = z.enum(IMPACT_LEVELS);
export type ImpactLevel = z.infer<typeof impactLevelSchema>;

export const sourceTypeSchema = z.enum(['github', 'cursor', 'devin']);
export const actorKindSchema = z.enum(['agent', 'human', 'unattributed']);

/**
 * The canonical agent-activity event — the spine of Dashy.ai, and the exact wire
 * shape returned by `GET /api/v1/events` and pushed over `GET /api/v1/stream`
 * (docs/ARCHITECTURE.md §2.6). Single source of truth shared by api + web.
 * Snake_case on purpose: this is the serialized contract, not an internal model.
 * Change docs/ARCHITECTURE.md §2 first, then this file.
 */
export const payloadRefSchema = z
  .object({
    pr_number: z.number().int().optional(),
    issue_number: z.number().int().optional(),
    url: z.string().url().optional(),
    title: z.string().optional(),
    additions: z.number().int().optional(),
    deletions: z.number().int().optional(),
    commit_count: z.number().int().optional(),
    base_branch: z.string().optional(),
    default_branch: z.string().optional(),
  })
  .passthrough();

export const activityEventSchema = z.object({
  id: z.string(), // evt_<ulid>
  source: sourceTypeSchema,
  agent_id: z.string().nullable(), // agt_<ulid>; null = unattributed
  agent: agentSlugSchema.nullable(), // resolved slug, never the raw hint
  actor: z.string().nullable(), // login at source
  actor_kind: actorKindSchema,
  confidence: attributionConfidenceSchema,
  repo: z.string().nullable(), // owner/name
  action_type: actionTypeSchema,
  impact: impactLevelSchema,
  occurred_at: z.string().datetime({ offset: true }),
  stored_at: z.string().datetime({ offset: true }),
  payload_ref: payloadRefSchema.nullable(),
});

export type ActivityEvent = z.infer<typeof activityEventSchema>;
