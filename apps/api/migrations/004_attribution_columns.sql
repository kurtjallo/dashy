-- Up Migration
-- Attribution extension: denormalized onto events so the feed renders with no joins.
-- Written in the same transaction as the event insert by the attribution engine.

ALTER TABLE events
  ADD COLUMN actor_kind          TEXT NOT NULL DEFAULT 'unattributed',
  ADD COLUMN actor_login         TEXT,
  ADD COLUMN confidence          TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN attribution_signals JSONB,
  ADD COLUMN co_actors           JSONB,
  ADD COLUMN attribution_flags   JSONB,
  ADD COLUMN manual_override     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN attribution_version INT NOT NULL DEFAULT 1;

ALTER TABLE events
  ADD CONSTRAINT events_actor_kind_check CHECK (actor_kind IN ('agent', 'human', 'unattributed')),
  ADD CONSTRAINT events_confidence_check CHECK (confidence IN ('exact', 'inferred', 'unknown'));

-- "Honest unattributed bucket": never guess an agent, surface the unknowns cheaply.
CREATE INDEX idx_events_ws_unattr ON events (workspace_id, occurred_at DESC)
  WHERE actor_kind = 'unattributed';

-- Down Migration
DROP INDEX IF EXISTS idx_events_ws_unattr;
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_confidence_check,
  DROP CONSTRAINT IF EXISTS events_actor_kind_check,
  DROP COLUMN IF EXISTS attribution_version,
  DROP COLUMN IF EXISTS manual_override,
  DROP COLUMN IF EXISTS attribution_flags,
  DROP COLUMN IF EXISTS co_actors,
  DROP COLUMN IF EXISTS attribution_signals,
  DROP COLUMN IF EXISTS confidence,
  DROP COLUMN IF EXISTS actor_login,
  DROP COLUMN IF EXISTS actor_kind;
