-- SF Org Health Dashboard — PostgreSQL Schema
-- Used in production. Run once on first deploy (db.js calls this automatically).

CREATE TABLE IF NOT EXISTS orgs (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  is_sandbox   BOOLEAN     NOT NULL DEFAULT FALSE,
  org_type     TEXT,
  login_url    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audits (
  id               TEXT        PRIMARY KEY,
  org_id           TEXT        NOT NULL REFERENCES orgs(id),
  overall_score    INTEGER     NOT NULL,
  grade            TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'complete',
  error_message    TEXT,
  raw_metadata     TEXT,
  raw_score        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_scores (
  id           SERIAL      PRIMARY KEY,
  audit_id     TEXT        NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  org_id       TEXT        NOT NULL,
  category     TEXT        NOT NULL,
  score        INTEGER     NOT NULL,
  weight       INTEGER     NOT NULL,
  issue_count  INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommended_actions (
  id           SERIAL      PRIMARY KEY,
  audit_id     TEXT        NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  org_id       TEXT        NOT NULL,
  priority     TEXT        NOT NULL,
  category     TEXT        NOT NULL,
  action       TEXT        NOT NULL,
  rank         INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unused_fields (
  id           SERIAL      PRIMARY KEY,
  audit_id     TEXT        NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  org_id       TEXT        NOT NULL,
  object_name  TEXT        NOT NULL,
  field_name   TEXT        NOT NULL,
  field_label  TEXT,
  field_type   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
  id              SERIAL      PRIMARY KEY,
  org_id          TEXT,
  username        TEXT,
  rating          INTEGER     NOT NULL,
  ease_of_use     INTEGER,
  usefulness      INTEGER,
  would_recommend INTEGER,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id          SERIAL      PRIMARY KEY,
  org_id      TEXT,
  username    TEXT,
  category    TEXT        NOT NULL,
  subject     TEXT        NOT NULL,
  description TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_reports (
  token       TEXT        PRIMARY KEY,
  audit_id    TEXT        NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  org_id      TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_audits (
  id              TEXT        PRIMARY KEY,
  org_id          TEXT        NOT NULL,
  org_name        TEXT        NOT NULL,
  instance_url    TEXT        NOT NULL,
  access_token    TEXT        NOT NULL,
  refresh_token   TEXT,
  client_id       TEXT,
  client_secret   TEXT,
  login_url       TEXT,
  email           TEXT        NOT NULL,
  frequency       TEXT        NOT NULL DEFAULT 'weekly',
  day_of_week     INTEGER     NOT NULL DEFAULT 1,
  hour            INTEGER     NOT NULL DEFAULT 9,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  last_score      INTEGER,
  last_grade      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mc_orgs (
  id                TEXT        PRIMARY KEY,
  sf_org_id         TEXT,
  subdomain         TEXT        NOT NULL,
  mid               TEXT,
  eid               TEXT,
  org_name          TEXT,
  client_id_enc     TEXT        NOT NULL,
  client_secret_enc TEXT        NOT NULL,
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS dismissed_findings (
  id            SERIAL       PRIMARY KEY,
  org_id        TEXT         NOT NULL,
  finding_key   TEXT         NOT NULL,
  category      TEXT         NOT NULL,
  action_text   TEXT         NOT NULL,
  reason        TEXT,
  dismissed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_rules (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  rule_text  TEXT        NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debt_items (
  id                  TEXT        PRIMARY KEY,
  org_id              TEXT        NOT NULL,
  audit_id            TEXT,
  category            TEXT        NOT NULL,
  action_text         TEXT        NOT NULL,
  priority            TEXT        NOT NULL DEFAULT 'medium',
  status              TEXT        NOT NULL DEFAULT 'open',
  assignee            TEXT,
  notes               TEXT,
  jira_issue_key      TEXT,
  linear_issue_id     TEXT,
  source_finding_key  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_debt_org        ON debt_items(org_id, status);
CREATE INDEX IF NOT EXISTS idx_debt_created    ON debt_items(org_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audits_org_id     ON audits(org_id);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at);
CREATE INDEX IF NOT EXISTS idx_cat_scores_org    ON category_scores(org_id, category, created_at);
CREATE INDEX IF NOT EXISTS idx_actions_org       ON recommended_actions(org_id, priority);
CREATE INDEX IF NOT EXISTS idx_unused_fields_org ON unused_fields(org_id, object_name);
CREATE INDEX IF NOT EXISTS idx_feedback_created  ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status    ON support_tickets(status, created_at);
CREATE INDEX IF NOT EXISTS idx_shares_audit      ON shared_reports(audit_id);
CREATE INDEX IF NOT EXISTS idx_schedules_org     ON scheduled_audits(org_id);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON scheduled_audits(enabled, frequency, day_of_week, hour);
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_exp  ON app_sessions(expires_at);
