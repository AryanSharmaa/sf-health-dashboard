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

-- ─── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audits_org_id     ON audits(org_id);
CREATE INDEX IF NOT EXISTS idx_audits_created_at ON audits(created_at);
CREATE INDEX IF NOT EXISTS idx_cat_scores_org    ON category_scores(org_id, category, created_at);
CREATE INDEX IF NOT EXISTS idx_actions_org       ON recommended_actions(org_id, priority);
CREATE INDEX IF NOT EXISTS idx_unused_fields_org ON unused_fields(org_id, object_name);
