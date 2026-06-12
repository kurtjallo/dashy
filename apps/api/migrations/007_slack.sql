-- Up Migration
-- Slack config + delivery. Alert state is Postgres-backed (survives restarts); Redis only
-- schedules the 10s drain poll. Webhook URLs are AES-256-GCM encrypted, returned only masked.

CREATE TABLE slack_webhooks (
  id               TEXT PRIMARY KEY,                   -- wh_<ulid>
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  url_encrypted    BYTEA NOT NULL,                     -- AES-256-GCM
  url_masked       TEXT NOT NULL,                      -- e.g. hooks.slack.com/…/T***
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'failing')),
  last_delivery_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_webhooks_workspace ON slack_webhooks (workspace_id);

CREATE TABLE slack_alert_rules (
  id           TEXT PRIMARY KEY,                       -- rule_<ulid>
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  webhook_id   TEXT REFERENCES slack_webhooks(id) ON DELETE SET NULL,
  repo_id      TEXT REFERENCES workspace_repos(id) ON DELETE CASCADE,  -- NULL = all repos
  event_types  TEXT[] NOT NULL DEFAULT '{}',           -- protected_branch_merge|agent_run_failed
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_rules_match ON slack_alert_rules (workspace_id, enabled) WHERE enabled;

CREATE TABLE slack_alert_queue (
  id              BIGSERIAL PRIMARY KEY,
  rule_id         TEXT REFERENCES slack_alert_rules(id) ON DELETE CASCADE,
  webhook_id      TEXT REFERENCES slack_webhooks(id) ON DELETE CASCADE,
  event_id        TEXT REFERENCES events(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'digesting', 'delivered', 'failed', 'expired')),
  digest_group    TIMESTAMPTZ,                         -- burst-collapse window start
  attempts        SMALLINT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The 10s poller scans only live rows.
CREATE INDEX idx_slack_queue_due ON slack_alert_queue (next_attempt_at)
  WHERE status IN ('pending', 'digesting');

CREATE TABLE slack_deliveries (
  id                BIGSERIAL PRIMARY KEY,
  webhook_id        TEXT,
  rule_id           TEXT,
  event_id          TEXT,
  status            TEXT NOT NULL CHECK (status IN ('delivered', 'failed')),
  slack_status_code SMALLINT,
  latency_ms        INT,                               -- delivered_at - event.stored_at; the <2min SLO
  is_digest         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slack_deliveries_window ON slack_deliveries (rule_id, webhook_id, created_at);

-- Down Migration
DROP TABLE IF EXISTS slack_deliveries;
DROP TABLE IF EXISTS slack_alert_queue;
DROP TABLE IF EXISTS slack_alert_rules;
DROP TABLE IF EXISTS slack_webhooks;
