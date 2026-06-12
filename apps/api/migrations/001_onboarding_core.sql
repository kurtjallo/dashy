-- Up Migration
-- Onboarding core: identity, tenancy, repo selection, and supporting tables.
-- IDs are app-generated prefixed ULIDs (TEXT); timestamps are TIMESTAMPTZ.

CREATE TABLE workspaces (
  id           TEXT PRIMARY KEY,                       -- ws_<ulid>
  name         TEXT NOT NULL,
  onboarded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id           TEXT PRIMARY KEY,                       -- usr_<ulid>
  github_id    BIGINT NOT NULL UNIQUE,                 -- OAuth upsert key
  github_login TEXT NOT NULL,
  email        TEXT,
  avatar_url   TEXT,
  gh_token_enc BYTEA,                                  -- AES-256-GCM ciphertext, never logged
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_members_user ON workspace_members (user_id);

CREATE TABLE workspace_repos (
  id             TEXT PRIMARY KEY,                     -- repo_<ulid>
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_repo_id BIGINT NOT NULL,
  full_name      TEXT NOT NULL,                        -- owner/name
  webhook_id     BIGINT,                               -- GitHub hook id
  webhook_status TEXT NOT NULL DEFAULT 'pending'
                 CHECK (webhook_status IN ('pending', 'installed', 'failed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_repos_ws ON workspace_repos (workspace_id);

CREATE TABLE integrations (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL CHECK (provider IN ('cursor', 'devin')),
  credential_enc BYTEA,                                -- AES-256-GCM, write-only
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invites (
  token        TEXT PRIMARY KEY,                       -- 32-byte random
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE backfill_jobs (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued', 'running', 'done', 'failed')),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS backfill_jobs;
DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS integrations;
DROP TABLE IF EXISTS workspace_repos;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS workspaces;
