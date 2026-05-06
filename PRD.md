# Product Requirements Document
## Salesforce Org Health Dashboard

**Version:** 1.0  
**Date:** May 2026  
**Status:** Live — https://sf-health-dashboard.onrender.com

---

## 1. Overview

The Salesforce Org Health Dashboard is a web-based SaaS tool that gives Salesforce administrators, consultants, and architects an automated, objective audit of any Salesforce org. It connects securely via Salesforce OAuth, scans the org across six health categories, and returns a 0–100 health score with a prioritised list of remediation actions.

No passwords or credentials ever touch the application server. All org access is via a short-lived OAuth access token obtained directly from Salesforce.

---

## 2. Problem Statement

Salesforce orgs accumulate technical debt over time — legacy automations, unused fields, security gaps, stale Apex code, and declining user adoption. Identifying these issues today requires either expensive consultants or hours of manual investigation across dozens of Salesforce setup pages. There is no single, automated view of org health.

This tool solves that by running a full audit in under 2 minutes and surfacing actionable findings ranked by priority.

---

## 3. Target Users

| User | Need |
|---|---|
| Salesforce Admin | Understand the health of their org and prioritise cleanup work |
| Salesforce Consultant | Quickly audit a client org before an engagement or during a health check |
| Salesforce Architect | Track technical debt and score trends across releases |
| IT Manager / CTO | Get a board-ready health score without needing Salesforce expertise |

---

## 4. Core Features

### 4.1 Secure OAuth Connection
- Users connect via the official Salesforce login page — the application never sees the user's password
- Supports both Production and Sandbox orgs
- OAuth 2.0 Web Server Flow with PKCE (S256) — industry-standard security
- Sessions expire after 1 hour; tokens are revoked on the Salesforce side at logout
- Session cookie is `httpOnly`, `secure` (production), `sameSite: lax`

### 4.2 Automated Org Audit
A single click runs a full audit across 8 data collection modules:

| Module | What is scanned |
|---|---|
| Automation | Flows (active/inactive), Workflow Rules, Process Builders |
| Security | Profile permissions, Guest User access, MFA, password policies, sharing settings |
| Data Quality | Required fields, duplicate rules, validation rules, stale records |
| API Usage | API version compliance, deprecated endpoint usage, daily API consumption |
| Code Quality | Apex test coverage, stale API versions in classes, Visualforce pages |
| User Adoption | Active user ratio, login frequency, feature adoption |
| Unused Fields | Custom fields with zero population across objects |
| Tech Debt | Apex class count, stale classes, VF pages, overall debt indicators |

### 4.3 Health Score
- **Overall score:** 0–100 weighted composite
- **Grade:** A (90+), B (80+), C (70+), D (60+), F (below 60)
- **Per-category scores** with visual bar chart breakdown
- **Scoring weights:** Automation 20%, Security 20%, Data Quality 15%, API Usage 15%, Code Quality 15%, User Adoption 15%

### 4.4 Recommended Actions
- Top 5 prioritised remediation actions generated from audit findings
- Each action tagged: Critical / High / Medium / Low
- Actionable, plain-English descriptions (e.g. "3 legacy Workflow Rules found — migrate to Flow before Salesforce retires them")

### 4.5 Report Downloads
- **HTML report** — formatted, shareable single-file report
- **JSON export** — raw structured data for integrations or custom analysis

### 4.6 Audit History & Trends
- Every audit is persisted to a database (SQLite locally, PostgreSQL in production)
- Score trend chart over the last 90 days
- Per-category trend grids showing improvement or decline
- Score delta vs. previous audit (e.g. ▲ +7 from last audit)
- Recurring issues highlighted — problems that appear across 3+ audits

### 4.7 Multi-Org Support
- Any number of orgs can be audited and tracked
- Connected Orgs page lists all previously audited orgs with latest score and audit count
- Org-level drill-down with full history, trends, and chronic issues

### 4.8 Audit Comparison
- API endpoint to compare any two audits side-by-side (`/api/compare?a=id&b=id`)

---

## 5. Technical Architecture

### Stack
| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — no framework, no build step |
| Backend | Node.js + Express |
| Database | SQLite (local development), PostgreSQL (production) |
| Salesforce API | jsforce library — REST + Tooling API |
| Auth | OAuth 2.0 + PKCE, in-memory session store |
| Security | Helmet (CSP, HSTS, XSS), CORS, rate limiting |
| Deployment | Render.com (web service + managed Postgres) |

### Security Controls
- Content Security Policy via Helmet
- Rate limiting: 5 audit requests per 10 minutes, 60 read requests per minute
- No passwords stored or transmitted
- Access tokens revoked at Salesforce on logout
- All cookies `httpOnly`; `secure` flag in production

### Deployment
- Auto-deploys on every push to `main` via Render
- Database migrations run at startup
- Environment variables managed in Render dashboard (SF_CLIENT_ID, SF_CLIENT_SECRET never in code)

---

## 6. API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server health check |
| POST | `/api/audit` | Start a new audit (requires session) |
| GET | `/api/audit/:id` | Poll audit job status |
| GET | `/api/audit/:id/report.html` | Download HTML report |
| GET | `/api/audit/:id/report.json` | Download JSON report |
| GET | `/api/orgs` | List all audited orgs |
| GET | `/api/orgs/:id/audits` | Audit history for an org |
| GET | `/api/orgs/:id/trend` | Score trends, deltas, category trends, recurring issues |
| GET | `/api/orgs/:id/issues` | Latest and recurring issues for an org |
| GET | `/api/compare?a=id&b=id` | Compare two audits |
| GET | `/auth/salesforce` | Start OAuth flow |
| GET | `/auth/salesforce/callback` | OAuth callback |
| GET | `/auth/session` | Get current session info |
| POST | `/auth/logout` | Revoke token and clear session |

---

## 7. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| Audit duration | Typically under 2 minutes for a standard org |
| Availability | Render free tier — 99% uptime target |
| Data retention | All audits stored indefinitely in PostgreSQL |
| Scalability | Stateless server; sessions in-memory (can be moved to Redis for multi-instance) |
| Browser support | All modern browsers (Chrome, Edge, Firefox, Safari) |
| Mobile | Responsive layout, usable on tablet |

---

## 8. Out of Scope (v1.0)

- Automated scheduled audits (infrastructure exists via `node-cron`, not yet wired up)
- Email / Slack notifications
- User accounts / multi-tenancy (each session is single-user)
- Custom scoring weight configuration
- Remediation workflow tracking
- Salesforce managed package version

---

## 9. Roadmap Candidates (v2.0)

- **Scheduled audits** — run automatically weekly/monthly and email the report
- **Team accounts** — multiple users per organisation, role-based access
- **Benchmark comparison** — compare your org score against industry averages
- **Slack / Teams integration** — post health score summaries to channels
- **Remediation tracker** — mark recommended actions as in-progress or resolved
- **Managed package** — install directly in Salesforce for deeper metadata access
- **Custom scoring profiles** — weight categories based on org type (ISV, enterprise, SMB)

---

## 10. Live Environment

| Item | Value |
|---|---|
| Production URL | https://sf-health-dashboard.onrender.com |
| Hosting | Render.com (web service + PostgreSQL) |
| Repository | https://github.com/AryanSharmaa/sf-health-dashboard |
| Salesforce Connected App | External Client App (Production) |
| Auth callback URL | https://sf-health-dashboard.onrender.com/auth/salesforce/callback |
