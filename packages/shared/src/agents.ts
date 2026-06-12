import { z } from 'zod';

/** Canonical agent slugs — see docs/FEATURE-SPECS.md (Agent Attribution Engine). */
export const KNOWN_AGENT_SLUGS = ['claude-code', 'cursor', 'devin', 'copilot'] as const;

export const agentSlugSchema = z.union([
  z.enum(KNOWN_AGENT_SLUGS),
  z.string().regex(/^custom:[a-z0-9-]+$/),
]);

export type AgentSlug = z.infer<typeof agentSlugSchema>;

export const attributionConfidenceSchema = z.enum(['exact', 'inferred', 'unknown']);
export type AttributionConfidence = z.infer<typeof attributionConfidenceSchema>;
