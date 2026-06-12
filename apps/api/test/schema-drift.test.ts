import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ACTION_TYPES, IMPACT_LEVELS } from '@dashy/shared';

// Proves the single-source-of-truth claim from docs/ARCHITECTURE.md §2: the DB CHECK
// constraints in 006_filters.sql cannot silently diverge from the shared TS enums.
// Runs with no database — pure file + constant comparison, safe in CI.

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '..', 'migrations', '006_filters.sql'), 'utf8');

function checkValues(constraintName: string): string[] {
  const match = sql.match(new RegExp(`${constraintName}[\\s\\S]*?IN \\(([^)]*)\\)`));
  if (!match) throw new Error(`CHECK constraint not found in 006_filters.sql: ${constraintName}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

describe('schema/code drift', () => {
  it('events.action_type CHECK matches shared ACTION_TYPES', () => {
    expect(checkValues('events_action_type_check')).toEqual([...ACTION_TYPES].sort());
  });

  it('events.impact CHECK matches shared IMPACT_LEVELS', () => {
    expect(checkValues('events_impact_check')).toEqual([...IMPACT_LEVELS].sort());
  });
});
