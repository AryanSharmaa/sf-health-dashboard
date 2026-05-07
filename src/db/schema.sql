-- SF Org Health Dashboard — Database Schema
-- Compatible with SQLite (local) and PostgreSQL (production)
-- Run once to initialise. Safe to re-run (IF NOT EXISTS).

-- ─── Orgs ──────────────────────────────────────────────────────────────────
-- One row per connected Salesforce org
CREATE TABLE IF NOT EXISTS orgs (
  id            TEXT        PRIMARY KEY,          -- Salesforce OrgId (18-char)
  name          TEXT        NOT NULL,
  is_sandbox    INTEGER     NOT NULL DEFAULT 0,   -- 0/1 in SQLite, bool in PG
  org_type      TEXT,
  login_url     TEXT,
  created_at    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Audits ────────────────────────────────────────────────────────────────
-- One row per health audit run
CREATE TABLE IF NOT EXISTS audits (
  id                TEXT    PRIMARY KEY,           -- UUID
  org_id            TEXT    NOT NULL REFERENCES orgs(id),
  overall_score     INTEGER NOT NULL,
  grade             TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'complete', -- running | complete | error
  error_message     TEXT,
  raw_metadata      TEXT,                          -- full collected JSON blob
  raw_score         TEXT,                          -- full scoreOrgHealth JSON blob
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Category Scores ──────────────────────────────────────────────────────
-- Normalised per-category scores per audit (enables SQL trending queries)
CREATE TABLE IF NOT EXISTS category_scores (
  id            INTEGER     PRIMARY KEY AUTOINCREMENT,
  audit_id      TEXT        NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  org_id        TEXT        NOT NULL,
  category      TEXT        NOT NULL,              -- automation | security | ...
  score         INTEGER     NOT NULL,
  weight        INTEGER     NOT NULL,
  issue_count   INTEGER     NOT NULL DEFAULT 0,
  created_at    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Recommended Actions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommended_actions (
  id            INTEGER     PRIMARY KEY AUTOINCREMENT,
  audit_id      TEXT        NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  org_id        TEXT        NOT NULL,
  priority      TEXT        NOT NULL,              -- critical | high | medium | low
  category      TEXT        NOT NULL,
  action        TEXT        NOT NULL,
  rank          INTEGER     NOT NULL DEFAULT 0,    -- position in top-5
  created_at    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Unused Fields ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unused_fields (
  id            INTEGER     PRIMARY KEY AUTOINCREMENT,
  audit_id      TEXT        NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  org_id        TEXT        NOT NULL,
  object_name   TEXT        NOT NULL,
  field_name    TEXT        NOT NULL,
  field_label   TEXT,
  field_type    TEXT,
  created_at    TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Feedback ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id           INTEGER  PRIMARY KEY AUTOINCREMENT,
  org_id       TEXT,
  username     TEXT,
  rating       INTEGER  NOT NULL,             -- 1–5 stars
  ease_of_use  INTEGER,                       -- 1–5
  usefulness   INTEGER,                       -- 1–5
  would_recommend INTEGER,                    -- 1 yes / 0 no
  comment      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Support tickets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id           INTEGER  PRIMARY KEY AUTOINCREMENT,
  org_id       TEXT,
  username     TEXT,
  category     TEXT NOT NULL,                 -- bug / question / feature / other
  subject      TEXT NOT NULL,
  description  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',  -- open / in_progress / resolved
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Shared Reports ───────────────────────────────────────────────────────
-- Public shareable links for audit results
CREATE TABLE IF NOT EXISTS shared_reports (
  token       TEXT        PRIMARY KEY,             -- crypto random 32-char hex
  audit_id    TEXT        NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  org_id      TEXT        NOT NULL,
  expires_at  TEXT        NOT NULL,                -- ISO8601 — default 30 days
  created_at  TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── Scheduled Audits ─────────────────────────────────────────────────────
-- Stored credentials + schedule for auto-run audits
CREATE TABLE IF NOT EXISTS scheduled_audits (
  id              TEXT        PRIMARY KEY,          -- UUID
  org_id          TEXT        NOT NULL,
  org_name        TEXT        NOT NULL,
  instance_url    TEXT        NOT NULL,
  access_token    TEXT        NOT NULL,             -- encrypted with SCHEDULE_SECRET
  refresh_token   TEXT,
  client_id       TEXT,
  client_secret   TEXT,
  login_url       TEXT,
  email           TEXT        NOT NULL,             -- where to send results
  frequency       TEXT        NOT NULL DEFAULT 'weekly',  -- weekly | daily | monthly
  day_of_week     INTEGER     NOT NULL DEFAULT 1,   -- 0=Sun … 6=Sat (weekly)
  hour            INTEGER     NOT NULL DEFAULT 9,   -- 0–23 UTC
  enabled         INTEGER     NOT NULL DEFAULT 1,   -- 0/1
  last_run_at     TEXT,
  last_score      INTEGER,
  last_grade      TEXT,
  created_at      TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── MC Orgs ──────────────────────────────────────────────────────────────
-- One row per Marketing Cloud account whose credentials have been saved once.
-- client_id and client_secret are AES-256-GCM encrypted with MC_CRED_SECRET.
CREATE TABLE IF NOT EXISTS mc_orgs (
  id                TEXT  PRIMARY KEY,
  subdomain         TEXT  NOT NULL,
  mid               TEXT,
  eid               TEXT,
  org_name          TEXT,
  client_id_enc     TEXT  NOT NULL,
  client_secret_enc TEXT  NOT NULL,
  last_used_at      TEXT,
  created_at        TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── App Users ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT  PRIMARY KEY,
  email         TEXT  NOT NULL UNIQUE,
  password_hash TEXT  NOT NULL,
  name          TEXT  NOT NULL DEFAULT '',
  created_at    TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── App Sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_sessions (
  id         TEXT  PRIMARY KEY,
  user_id    TEXT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT  NOT NULL
);

-- ─── Indexes ──────────────────────────────────────────────────────────────
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
