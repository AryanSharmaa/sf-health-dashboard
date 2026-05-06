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

CREATE INDEX IF NOT EXISTS idx_audits_org_id     ON audits(org_id);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at);
CREATE INDEX IF NOT EXISTS idx_cat_scores_org    ON category_scores(org_id, category, created_at);
CREATE INDEX IF NOT EXISTS idx_actions_org       ON recommended_actions(org_id, priority);
CREATE INDEX IF NOT EXISTS idx_unused_fields_org ON unused_fields(org_id, object_name);
CREATE INDEX IF NOT EXISTS idx_feedback_created  ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status    ON support_tickets(status, created_at);
