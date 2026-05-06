# SF Health Dashboard — Product Overview

> Internal document for the Operations Team · May 2026

---

## Vision

Most Salesforce and Marketing Cloud problems are invisible until they become incidents. Automations fail silently, journeys stop injecting contacts, apex errors accumulate, and nobody notices until a campaign doesn't send or a report looks wrong.

SF Health Dashboard exists to change that. The goal is a single place where operations teams can see the health of their Salesforce and Marketing Cloud platforms at a glance — not just a score, but the specific issues driving that score and concrete steps to fix them. Think of it as a continuous MOT check for your CRM stack, available without a consultant, without a lengthy setup, and without needing to know which API endpoint to query.

The longer-term vision is proactive ops: the platform alerts you before something breaks rather than after, learns the normal behaviour of your org, and guides teams through remediation with AI-assisted explanations that go beyond boilerplate recommendations.

---

## What It Does

### Salesforce Org Audit

Connect once with OAuth. The platform runs a non-destructive read-only audit across six categories and returns a weighted health score with a letter grade (A–F).

| Category | What Is Checked |
|---|---|
| **Automation** | Inactive Flows, legacy Workflow Rules, active Process Builders |
| **Security** | MFA enforcement, over-permissioned profiles, Guest User access, named credentials, password policy |
| **Data Quality** | Duplicate rules, ownerless records, contacts without email, storage utilisation |
| **API Usage** | Daily API consumption vs. limit, deprecated API versions, Apex callout timeouts, unused Connected Apps |
| **Code Quality** | Apex test coverage, classes with no tests, hardcoded IDs, Apex errors in last 30 days, LWC Jest coverage |
| **User Adoption** | Monthly active user %, login frequency, stale reports and dashboards, training completion |

The weight of each category shifts automatically based on org type — an ISV org weights code quality higher; an enterprise org weights security and data quality higher. The scoring engine detects org type from the edition and user count and selects the appropriate profile.

Each audit also produces a **benchmark** — your score compared against similar-sized orgs — and a ranked list of the top recommended actions, ordered by priority (Critical → High → Medium → Low).

### Marketing Cloud Audit

Connect with a Marketing Cloud OAuth client ID and secret. The platform audits five areas:

| Category | What Is Checked |
|---|---|
| **Email Deliverability** | Send definitions (active vs. total), sender profiles configured |
| **Sender Authentication** | Private domains, DKIM/SAP authentication status, send classifications |
| **Journey Health** | Running vs. errored journeys, abandoned drafts (90+ days), zombie journeys (0 contacts), missing exit criteria |
| **Automation Health** | Error-state automations, overdue scheduled automations, long-running automations (>2hrs), missing error notifications |
| **Account Hygiene** | Data extensions without retention policies, overall asset coverage |

### Operational Health Monitoring

Separate from the scored audit, both platforms surface a real-time **Operational Health** panel with traffic-light indicators (OK / Warning / Critical).

**Salesforce Operational Health** covers:
- Governor limits (Daily API Requests, Async Apex Executions, Bulk API, Platform Events, Single Email, Streaming API) — shown as fill bars with percentage used
- Error signals (login failures last 7 days, Apex CPU timeouts, async job errors, callout timeouts)
- Performance signals (slow Apex executions >5s, pending AsyncApexJob queue depth, failed scheduled Apex)

**Marketing Cloud Operational Health** covers:
- API / Data / Automations: locked users, large data extensions (>5M rows), overdue/errored/paused/skipped automations
- Email: triggered send error rate, active send threshold, deliverability data availability
- Mobile: push send errors, zero-send state
- Journey Builder: email activity errors, zero-injection journeys, errored journeys
- MC Connector: data sync availability, tracking data staleness

### AI Remediation Guide

After any audit, users can request an AI-generated remediation guide. The guide is streamed in real time and provides contextualised explanations and step-by-step remediation for the issues found in that specific audit. It uses the audit results as context, so recommendations are specific rather than generic.

### Scheduled Audits & Email Reports

Audits can be scheduled (daily, weekly, or monthly). At the scheduled time the platform re-runs the full audit and emails a report to configured recipients. This means teams get a regular snapshot without anyone needing to manually trigger a run.

### Audit History & Sharing

Every audit is persisted. Users can browse previous audits, compare scores over time, and generate a shareable link. Share links are accessible to anyone with the URL — no login required — so results can be sent to stakeholders or included in handover documents. Links have a configurable expiry.

### Progressive Web App

The dashboard is installable on desktop and mobile. A service worker handles offline gracefully — static assets are cached, API calls always go to the network.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 18+, Express |
| Salesforce connectivity | jsforce (OAuth + REST/SOAP/Tooling APIs) |
| MC connectivity | Custom HTTPS client against MC REST APIs |
| Database | PostgreSQL (production) / SQLite via sql.js (local/dev) |
| AI | OpenRouter API (streaming SSE) |
| Scheduling | node-cron |
| Email | Nodemailer |
| Frontend | Vanilla JS, PWA (Service Worker + Web App Manifest) |
| Security | Helmet, express-rate-limit, CORS allow-list |

---

## Known Limitations

### Sessions Are In-Memory
OAuth sessions (both Salesforce and Marketing Cloud) are stored in process memory. If the server restarts, users are logged out and must reconnect. This is by design for simplicity but means the platform is not suitable for high-availability multi-instance deployments without a shared session store (e.g., Redis).

### Single-Instance Deployment
The current architecture assumes a single server process. Background jobs (scheduled audits, running audit workers) are not distributed. Running multiple instances without coordination would result in duplicate audit runs.

### No Multi-Org Management at Scale
Users connect and audit one org at a time per session. There is no org portfolio view that shows all connected orgs on a single screen. Each audit result is independent.

### API Scope Dependency
The depth of audit data depends entirely on the OAuth scopes granted at connection time. If a user connects with limited scopes, some audit modules will return partial data (the platform handles this gracefully and flags which modules are partial, but the score will be less accurate).

### MC Data Is Point-in-Time
Marketing Cloud REST APIs return current state. There is no historical trending for MC metrics — unlike Salesforce where some signals (login failures, Apex errors) are drawn from logs covering the past 7–30 days.

### Governor Limit Data Is Approximate
Salesforce governor limits (daily API requests, etc.) are queried at audit time. The platform does not continuously poll limits, so the Operational Health panel reflects the state at the moment the audit ran, not live usage.

### No Credential Re-encryption
OAuth tokens held in memory are not separately encrypted at rest beyond what the session store provides. For production deployments handling sensitive orgs, additional encryption-at-rest for the database is recommended at the infrastructure level.

### Share Link Visibility
Share links are public to anyone with the URL. There is no link-level password protection or domain-restricted access. Do not share links containing sensitive audit data outside trusted recipients.

---

## Future Releases

### Near-Term (Next 1–2 Months)

- **Org comparison view** — side-by-side score comparison across multiple audits or multiple orgs, useful for identifying regression between deployments
- **Score trend chart** — line chart of overall score and category scores over time, visible within the audit history screen
- **Slack / Teams notifications** — push critical-priority alerts from Operational Health directly to a channel when a scheduled audit finds new issues
- **MC historical trending** — persist MC operational health snapshots to enable trend analysis (e.g., "automation error rate over last 4 weeks")
- **Persistent sessions** — move session store to Redis or PostgreSQL so server restarts do not log users out

### Medium-Term (Next Quarter)

- **Multi-org portfolio dashboard** — a single screen listing all connected orgs with their current score, grade, and last-audit timestamp
- **Custom scoring profiles** — allow teams to adjust category weights to reflect their org's priorities without requiring a code change
- **Sandbox vs. production tagging** — automatically detect and tag sandbox orgs; exclude sandbox data from portfolio-level averages
- **Remediation tracking** — mark recommended actions as "in progress" or "resolved" and track closure rate over time
- **API webhooks** — allow external tools (e.g., Jira, ServiceNow) to receive audit results via webhook for automated ticket creation

### Longer-Term (6–12 Months)

- **Anomaly detection** — establish a baseline for each org and alert when a metric deviates significantly from the norm (e.g., API usage spikes 3x overnight)
- **Deployment safety checks** — integrate with SF deployment pipelines to block or warn on deployments that would reduce health score below a threshold
- **MC journey simulation** — dry-run a journey against current audience data to estimate injection volume and flag configuration issues before activation
- **Role-based access** — admin/viewer roles with separate login, so stakeholders can view reports without being able to trigger audits or access credentials
- **White-label / multi-tenant** — package the platform so consulting partners can offer it to their clients under their own brand

---

## Security Considerations for the Operations Team

- The platform uses **read-only OAuth scopes** where possible. It does not write to, modify, or delete any Salesforce or Marketing Cloud data.
- Salesforce OAuth tokens are scoped to the user who authenticated — the platform inherits whatever record-level access that user has.
- All API communication is over HTTPS. The service worker enforces network-only (no cache) for all `/api/` and `/auth/` routes.
- Rate limiting is applied on all audit and auth endpoints to prevent abuse.
- Share links expire (default: 7 days) and are one-way read tokens — they cannot be used to trigger new audits or access credentials.

---

## Environment Setup (For Reference)

The platform requires the following environment variables in production:

| Variable | Purpose |
|---|---|
| `SF_CLIENT_ID` / `SF_CLIENT_SECRET` | Salesforce Connected App credentials |
| `SF_REDIRECT_URI` | OAuth callback URL |
| `SESSION_SECRET` | Express session signing key |
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | AI guide generation |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Email report delivery |
| `APP_URL` | Base URL for share link generation |
| `ALLOWED_ORIGINS` | CORS allow-list (comma-separated) |

---

*Document prepared May 2026. For questions or feedback on this document, reach out to the team directly.*
