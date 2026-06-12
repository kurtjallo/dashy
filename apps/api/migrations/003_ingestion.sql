-- Up Migration
-- Ingestion core: sources, the events table (ingestion columns + agent FK),
-- per-stream sync cursors, dead-letter, and the dedup + feed indexes.
-- action_type/impact CHECK constraints are added in 006; attribution columns in 004.

CREATE TABLE sources (
  id            TEXT PRIMARY KEY,                      -- src_<ulid>
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('github', 'cursor', 'devin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'paused')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,    -- encrypted api_key + webhook HMAC secret + repo list
  error_count   INT NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  last_poll_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sources_workspace ON sources (workspace_id);

CREATE TABLE events (
  id           TEXT PRIMARY KEY,                       -- evt_<ulid>
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id    TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,                          -- github|cursor|devin (denormalized for feed)
  agent_id     TEXT REFERENCES agents(id) ON DELETE SET NULL,  -- authoritative; set by attribution
  agent_hint   TEXT,                                   -- ingestion-time hint, never displayed
  repo         TEXT,                                   -- owner/name, nullable
  actor        TEXT,                                   -- login at source
  action_type  TEXT NOT NULL,
  impact       TEXT NOT NULL DEFAULT 'low',
  occurred_at  TIMESTAMPTZ NOT NULL,                   -- source timestamp
  stored_at    TIMESTAMPTZ NOT NULL DEFAULT now(),     -- insert time; latency SLO measured from this
  dedup_key    TEXT NOT NULL,                          -- unique per workspace
  payload_ref  JSONB                                   -- source summary <=8KB; metadata only, never code
);

-- Idempotency backbone: webhook redelivery, backfill overlap, double-clicked onboarding
-- all converge via ON CONFLICT (workspace_id, dedup_key) DO NOTHING.
CREATE UNIQUE INDEX uq_events_dedup ON events (workspace_id, dedup_key);

-- Feed hot path: "this workspace, newest first" — keyset pagination on (occurred_at, id).
CREATE INDEX idx_events_feed  ON events (workspace_id, occurred_at DESC, id DESC);
CREATE INDEX idx_events_agent ON events (workspace_id, agent_id, occurred_at DESC);
CREATE INDEX idx_events_repo  ON events (workspace_id, repo, occurred_at DESC);

CREATE TABLE sync_cursors (
  source_id    TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  stream       TEXT NOT NULL,                          -- pulls|issues|commits (GitHub); activity|sessions (v0.2)
  cursor_value TEXT,                                   -- timestamp or opaque page token
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, stream)
);

CREATE TABLE events_dead_letter (
  id          BIGSERIAL PRIMARY KEY,
  source_id   TEXT,
  raw_payload JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS events_dead_letter;
DROP TABLE IF EXISTS sync_cursors;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS sources;
