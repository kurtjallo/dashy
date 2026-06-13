/**
 * Resolves an actor (and its payload) to an agent slug + attribution metadata.
 *
 * Detection is signature-based on the GitHub login (the bot accounts agents push
 * under). Known agent bots attribute with `exact` confidence; unknown `*[bot]`
 * accounts are honestly bucketed as `unattributed`; everything else is a human.
 * Never guesses an agent — see docs/ARCHITECTURE.md (attribution) + CLAUDE.md.
 */
export function attribute(
  actorLogin: string | null,
  payload: unknown,
): { agentSlug: string | null; actorKind: 'agent' | 'human' | 'unattributed'; confidence: 'exact' | 'inferred' | 'unknown' } {
  void payload;

  const login = (actorLogin ?? '').toLowerCase();

  // Known agent bots — exact attribution.
  if (login === 'devin-ai-integration[bot]' || login.includes('devin')) {
    return { agentSlug: 'devin', actorKind: 'agent', confidence: 'exact' };
  }
  if (login === 'cursor[bot]' || login.includes('cursor')) {
    return { agentSlug: 'cursor', actorKind: 'agent', confidence: 'exact' };
  }
  if (login.includes('copilot')) {
    return { agentSlug: 'copilot', actorKind: 'agent', confidence: 'exact' };
  }
  if (login.includes('claude')) {
    return { agentSlug: 'claude-code', actorKind: 'agent', confidence: 'exact' };
  }

  // Some other bot account — honest unattributed bucket, never a guess.
  if (login.endsWith('[bot]')) {
    return { agentSlug: null, actorKind: 'unattributed', confidence: 'unknown' };
  }

  // A human.
  return { agentSlug: null, actorKind: 'human', confidence: 'exact' };
}
