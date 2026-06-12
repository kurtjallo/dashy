-- Up Migration
-- Feed preferences live as columns on users (a separate table would be ceremony at MVP).
-- last_seen_at drives the "While you were offline" window; timezone resolves 6pm-yesterday.

ALTER TABLE users
  ADD COLUMN last_seen_at    TIMESTAMPTZ,
  ADD COLUMN timezone        TEXT NOT NULL DEFAULT 'UTC',           -- IANA name
  ADD COLUMN theme           TEXT NOT NULL DEFAULT 'dark'  CHECK (theme IN ('dark', 'light')),
  ADD COLUMN feed_grouping   TEXT NOT NULL DEFAULT 'repo'  CHECK (feed_grouping IN ('repo', 'agent', 'impact')),
  ADD COLUMN default_filters JSONB;                                 -- null = overnight default

-- Down Migration
ALTER TABLE users
  DROP COLUMN IF EXISTS default_filters,
  DROP COLUMN IF EXISTS feed_grouping,
  DROP COLUMN IF EXISTS theme,
  DROP COLUMN IF EXISTS timezone,
  DROP COLUMN IF EXISTS last_seen_at;
