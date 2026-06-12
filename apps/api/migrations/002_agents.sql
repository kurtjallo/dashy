-- Up Migration
-- Agent identity + workspace attribution overrides. Must precede events
-- (events.agent_id references agents).

CREATE TABLE agents (
  id           TEXT PRIMARY KEY,                       -- agt_<ulid>
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,                          -- claude-code|cursor|devin|copilot|custom:<name>
  display_name TEXT NOT NULL,
  is_builtin   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE attribution_rules (
  id           TEXT PRIMARY KEY,                       -- rule_<ulid>
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule_type    TEXT NOT NULL CHECK (rule_type IN ('login', 'email_glob', 'branch_prefix')),
  pattern      TEXT NOT NULL,
  agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, rule_type, pattern)
);
CREATE INDEX idx_attribution_rules_ws ON attribution_rules (workspace_id) WHERE enabled;

-- Down Migration
DROP TABLE IF EXISTS attribution_rules;
DROP TABLE IF EXISTS agents;
