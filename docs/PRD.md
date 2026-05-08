# Product Requirements Document (PRD)
## SFHealth — Salesforce & Marketing Cloud Org Health Platform

**Version:** 2.0  
**Date:** May 2026  
**Status:** Sprint 2 Complete  
**Live:** https://sf-health-dashboard.onrender.com

---

## 1. Product Vision

> Give every Salesforce and Marketing Cloud team — regardless of size or budget — the same org health insight that enterprise consulting firms charge thousands to produce, available in under two minutes, every day, from a browser.

---

## 2. User Personas

### Persona 1 — Priya, Salesforce Admin (Mid-Market)
- Manages a 150-user Sales Cloud org solo
- Knows there are problems but doesn't have time to investigate systematically
- Needs a prioritised list, not an overwhelming dashboard
- **Goal:** Know what to fix first this sprint

### Persona 2 — James, Salesforce Consultant
- Runs health checks on 3–5 client orgs per month as part of support contracts
- Needs fast, professional-looking deliverables to justify the engagement
- Needs compliance docs for clients in regulated industries
- **Goal:** Complete a client health check in 20 minutes and walk out with a branded PDF

### Persona 3 — Anika, Salesforce Architect
- Oversees 6 orgs across a global enterprise
- Needs to track debt over time and ensure the team is making progress
- Needs Jira integration — her team already works in Jira
- **Goal:** See all orgs' health in one view and push findings directly to the sprint board

### Persona 4 — Rahul, Marketing Cloud Admin
- Manages MC for a B2B company; currently no monitoring tooling
- Journey failures are discovered reactively when campaign numbers don't add up
- **Goal:** Catch automation errors and journey problems before they affect sends

---

## 3. Feature Specifications

---

### Feature 1 — Salesforce Org Connection & Session Management

**User story:** As a user, I want to connect my Salesforce org using the official Salesforce login, so I never have to give my password to a third-party tool.

**Acceptance criteria:**
- Salesforce login opens in the same browser tab using OAuth 2.0 + PKCE
- Supports both Production (`login.salesforce.com`) and Sandbox (`test.salesforce.com`) orgs
- "Switch Org" forces a new Salesforce login prompt — does not silently reuse SSO session
- Session expires in 1 hour; tokens are revoked at Salesforce on logout
- Session cookie is `httpOnly`, `secure` (production), `sameSite: lax`
- Re-visiting a previously connected org surfaces a "Continue as [user]" card; user can proceed or switch

**Implementation:** OAuth 2.0 Web Server Flow with PKCE (S256 challenge). `prompt=login` parameter appended when `switch=1` query param is set to force new Salesforce login.

---

### Feature 2 — Salesforce Org Audit

**User story:** As an admin or consultant, I want a full org audit in under 2 minutes so I can understand the health of any org without hours of manual investigation.

**Acceptance criteria:**
- Single "Run Audit" button triggers the full scan
- Progress indicator shows all 9 phases (Automation, Security, Data Quality, API Limits, Code Quality, User Adoption, Unused Fields, Tech Debt, Score)
- Audit produces an overall score 0–100 and grade A/B/C/D/F
- Results are broken into 8 scored categories with individual scores and issue counts
- Top 5 recommended actions are shown, ranked Critical → High → Medium → Low
- Each action has an "AI Fix Guide" button and an "Acknowledge" dismiss option
- A "⊕ Track" button adds any finding directly to the Technical Debt Tracker
- Score benchmark shows how this org compares to similar orgs
- Audit completes in under 2 minutes for a standard org

**Categories & weights:**

| Category | Weight | Key Checks |
|---|---|---|
| Automation | 20% | Inactive flows, legacy Workflow Rules, active Process Builders, inactive triggers |
| Security | 20% | MFA enforcement, Modify All profiles, Guest User access, password policy strength, Named Credentials |
| Data Quality | 15% | Duplicate rules, ownerless records, null email %, storage utilisation, stale leads |
| API Usage | 15% | Daily API consumption %, deprecated API versions, callout error rate, unused Connected Apps |
| Code Quality | 15% | Apex test coverage %, hardcoded IDs, inactive triggers, async Apex error rate |
| User Adoption | 15% | Monthly active users %, login frequency, stale reports/dashboards |
| Unused Fields | — | Custom fields with zero data population (not scored, surfaced separately) |
| Tech Debt | — | Stale Apex API versions, legacy VF pages, overall debt indicators |

**Scoring profile auto-detection:**  
The scoring engine detects org type (ISV, enterprise, SMB, developer) from edition and user count. ISV orgs weight code quality higher; enterprise orgs weight security and data quality higher.

---

### Feature 3 — Marketing Cloud Audit

**User story:** As an MC admin, I want to audit my Marketing Cloud account health so I can catch configuration problems before they affect campaign sends.

**Acceptance criteria:**
- Connect with subdomain, Client ID, Client Secret from an Installed Package
- Credentials saved encrypted (AES-256-GCM); subsequent audits require only MID/EID one-click reconnect
- Audit covers 5 categories: Email Deliverability, Sender Authentication, Journey Health, Automation Health, Account Hygiene
- Each category scored and graded
- Operational Health panel shows traffic-light status for: locked users, large DEs, overdue/errored/paused automations, triggered send error rate, push errors, zero-injection journeys, MC Connector sync status
- All Operational Health items with a non-zero count show a "View names" drilldown chip listing the affected items by name
- AI remediation guide available for MC findings

---

### Feature 4 — Operational Health Monitoring (Salesforce)

**User story:** As an admin, I want to see live governor limit consumption and error signals immediately after an audit, so I can spot capacity or reliability issues before they become incidents.

**Acceptance criteria:**
- Governor limits displayed as labelled fill bars: Daily API Requests, Async Apex Executions, Bulk API, Platform Events, Single Email, Streaming API
- Each bar colour-coded: green < 50%, amber 50–80%, red > 80%
- Error signals displayed with counts: Login Failures (7d), Apex CPU Timeouts, Async Apex Errors, Callout Timeouts
- Performance signals: Slow Apex Executions (>5s), Pending AsyncApexJob queue, Failed Scheduled Apex

---

### Feature 5 — AI Remediation Guide

**User story:** As an admin, I want step-by-step remediation guidance for each finding, specific to my org, so I can fix issues without researching them separately.

**Acceptance criteria:**
- "AI Fix Guide" button on each of the top 5 recommended actions
- Guide streams in real time (SSE) — no waiting for a full response
- Prompt includes org name, org profile, category, priority, and exact finding text
- Falls back to non-streaming if SSE unavailable
- Fallback to non-AI mode if no AI key is configured (button hidden)

---

### Feature 6 — Audit History & Trends

**User story:** As an admin or architect, I want to see whether my org is getting healthier or worse over time, so I can measure the impact of remediation work.

**Acceptance criteria:**
- Every audit is persisted (PostgreSQL production / SQLite local)
- History page lists all past audits for the connected org with date, score, grade, issue count
- Score trend chart (line chart, inline SVG) across last 90 days (configurable to 365)
- Per-category trend grid showing individual category score movement
- Score delta shown: e.g. "▲ +7 vs. previous audit"
- Recurring issues panel: issues that appeared in 3+ of the last 5 audits
- Two-audit comparison: select any two audits, see delta per category

---

### Feature 7 — Report Downloads & Sharing

**User story:** As a consultant, I want to export a professional report and share it with clients without requiring them to create an account.

**Acceptance criteria:**
- **HTML Report:** Full formatted report, downloadable single file
- **JSON Export:** Raw structured data for custom tooling
- **Print / PDF:** Browser print dialog, print-optimised stylesheet
- **Consulting Report (White-Label):** Branded PDF-ready report using `BRAND_NAME` env var; defaults to "SF HEALTH"
- **Compliance Reports:** GDPR/DPDP, SOC 2 Checklist, ISV Security Review — each opens print-ready in a new tab
- **Share Link:** 30-day public URL; no login required for viewer; contains no PII
- All 7 export options available in the "Export & Share" card after any completed audit

---

### Feature 8 — Compliance & Governance Reports

**User story:** As a consultant or admin at a regulated company, I want audit-ready compliance documentation generated automatically from my audit data.

**Three report types:**

#### 8.1 GDPR / DPDP Report
Covers: Guest User access, Modify All profiles, MFA enforcement, password policy, ownerless Account records, Contact email completeness, duplicate prevention rules, unused custom fields (data minimisation), inactive users, storage usage, legacy Workflow Rules.  
Includes: pass/fail/warn status per check, finding detail, specific recommendation, unused fields detail table.

#### 8.2 SOC 2 Readiness Checklist
Mapped to Trust Service Criteria:
- CC6 (Access Controls): MFA, password policy, least-privilege, guest users
- CC7 (Operations): login failures 7d, async Apex errors, API limit headroom
- CC8 (Change Management): Apex test coverage, hardcoded IDs, deprecated automation, stale API versions
- A1 (Availability): user adoption ratio  
Includes: manual evidence checklist for non-automatable SOC 2 controls.

#### 8.3 ISV / AppExchange Security Review
Covers: hardcoded IDs, test coverage ≥75%, inactive triggers, Apex API currency, legacy VF pages, MFA, guest user permissions, minimal admin permissions, API safety, async/callout error rates.  
Includes: pre-submission manual checklist, Apex classes list.

**All three reports:** Print-ready HTML, `window.print()` button, `@media print` CSS, summary banner (% compliance, pass/fail/warn counts, progress bar), per-check table with status dot + finding + recommendation, branded header, legal disclaimer.

---

### Feature 9 — Multi-Org Portfolio

**User story:** As a consultant or architect managing multiple orgs, I want a single dashboard showing all orgs' health so I can prioritise which one needs attention.

**Acceptance criteria:**
- Portfolio page accessible via nav (logged-in users only)
- **Fleet Score:** Weighted average of all orgs' latest scores
- **Worst Org callout:** The org with the lowest score, name and score prominently shown
- **Attention filter:** All orgs with grade D or F listed with one click
- **Orgs table:** All connected orgs with name, sandbox/production badge, score, grade, last audit date
- **Multi-org compare:** Select 2+ orgs via checkboxes → "Compare" shows overview bar chart with colour legend
- **Detailed View:** Fetches per-category scores for each selected org; renders:
  - Score summary cards per org
  - Category bar chart with Best/Lowest badges
  - Issues table: each cell has large count + "Clean"/"issues" label + tinted background + mini proportional bar + colour legend (green/amber/red) + explanatory subtitle
  - Total Issues row at bottom
- **Portfolio PDF export:** Print-ready portfolio summary

---

### Feature 10 — Custom Rules Engine

**User story:** As an architect or admin, I want to define my own health rules using plain English conditions, so I can flag issues that matter to my org specifically.

**Acceptance criteria:**
- Rules defined in natural language: `if <field> <operator> <value> then flag as <PRIORITY>`
- Example: `if apexTestCoverage < 80 then flag as CRITICAL`
- Rules saved per user account (server-side)
- Rules evaluated client-side against the latest audit report immediately after audit completes
- Matching rules surfaced in a "Custom Rule Violations" card on the audit results page
- Rules can be enabled/disabled, edited, deleted
- Live list of supported fields and operators shown in the rules editor

---

### Feature 11 — Technical Debt Tracker

**User story:** As an admin or architect, I want audit findings to become tracked work items with status, assignee, and burndown, so technical debt doesn't stay as a list of ignored recommendations.

**Acceptance criteria:**
- "⊕ Track" button on every audit finding adds it to the org's debt backlog
- Button turns to "✓ Tracked" and is disabled if an open item already exists for that finding (deduplication via finding key hash)
- **Backlog list** shows each item with: priority badge, category tag, action text, status dropdown (change in-place), assignee text input (saves on blur), Jira badge / Linear badge if pushed, creation date
- **Status workflow:** Open → In Progress → Resolved; resolved items show resolution date
- **Filters:** by status, priority, category
- **Burndown chart:** Inline SVG, weekly buckets, two lines (items added = red, resolved = green) with dots
- **Summary stat row:** Open, In Progress, Resolved, Critical Open counts
- **Jira push:** Creates a Jira issue via Atlassian REST API v3; takes base URL, email, API token, project key; credentials sent per-request, never stored; resulting issue key shown as badge on the item
- **Linear push:** Creates a Linear issue via GraphQL API; takes API key and Team ID; same credential handling; issue ID stored on item
- **Delete:** Remove any item from the backlog

---

### Feature 12 — Scheduled Audits & Email Reports

**User story:** As an admin, I want my org audited automatically on a schedule and the results emailed to me, so I always have a current health picture without manual effort.

**Acceptance criteria:**
- Schedule modal accepts: email address, frequency (daily / weekly / monthly), day of week, hour
- Multiple schedules can exist per org
- Scheduler runs on cron; re-authenticates using stored refresh token
- Email report delivered to configured address after each scheduled run
- Schedules can be enabled / disabled / deleted from the UI

---

### Feature 13 — Knowledge Base (/docs)

**User story:** As a new user, I want documentation explaining every feature, so I can learn the product without needing support.

**Acceptance criteria:**
- Full docs site at `/docs` — no login required
- Sticky sidebar with grouped navigation (6 groups, 20+ sections)
- Live full-text search with highlighted matches
- Sections cover: What is SFHealth, Vision, Quick Start, FAQ, Scoring model, all audit categories, Portfolio, Custom Rules, Reports, Sharing, Schedules, Security, Data Privacy, White-Label, Glossary, Roadmap
- Print-optimised CSS
- Linked from both the main app nav and the landing page

---

## 4. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| **Audit duration** | < 2 minutes for standard org (< 500 users, < 5000 Apex classes) |
| **Page load** | < 1 second for the app shell (static assets cached via Service Worker) |
| **API rate limits** | 5 audit requests / 10 min per IP; 120 read requests / min per IP |
| **Session duration** | 1 hour; auto-expired |
| **Data retention** | Indefinite for audit history; share links expire after 30 days |
| **Browser support** | Chrome 100+, Edge 100+, Firefox 100+, Safari 15+ |
| **Mobile** | Responsive layout usable on tablet (768px+); not optimised for phone |
| **Offline** | App shell loads from Service Worker cache; API calls require network |
| **Security headers** | Content Security Policy, HSTS, X-Frame-Options via Helmet |
| **Encryption** | MC credentials encrypted AES-256-GCM; TLS everywhere |
| **Accessibility** | WCAG 2.1 AA for core audit flow (keyboard nav, colour contrast) |

---

## 5. API Reference (Complete)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | None | Server health check |
| GET | `/api/status` | None | DB + AI service status |
| POST | `/api/audit` | SF session | Start Salesforce org audit |
| GET | `/api/audit/:id` | None | Poll audit job status / result |
| GET | `/api/audit/:id/report.html` | None | Download HTML report |
| GET | `/api/audit/:id/report.json` | None | Download JSON report |
| GET | `/api/audit/:id/report.pdf` | None | Print/PDF HTML report |
| GET | `/api/audit/:id/report-pdf` | None | White-label consulting PDF |
| GET | `/api/audit/:id/compliance/:type` | None | Compliance report (gdpr/soc2/isv) |
| POST | `/api/audit/:id/advise` | SF session | AI remediation guide (non-streaming) |
| GET | `/api/audit/:id/advise/stream` | SF session | AI remediation guide (SSE streaming) |
| POST | `/api/audit/:id/share` | SF session | Create shareable link |
| GET | `/api/share/:token` | None | Get share link metadata |
| GET | `/api/share/:token` (page) | None | Shared report viewer |
| GET | `/api/orgs` | SF session | Current session's org |
| GET | `/api/orgs/:id/audits` | SF session | Audit history for org |
| GET | `/api/orgs/:id/trend` | SF session | Score trends + deltas + category trends |
| GET | `/api/orgs/:id/issues` | SF session | Latest + recurring issues |
| GET | `/api/orgs/:id/dismissed` | SF session | List dismissed findings |
| POST | `/api/orgs/:id/dismissed` | SF session | Dismiss a finding |
| DELETE | `/api/orgs/:id/dismissed/:key` | SF session | Restore a dismissed finding |
| GET | `/api/orgs/:id/debt` | SF session | List debt tracker items |
| POST | `/api/orgs/:id/debt` | SF session | Create debt item |
| PATCH | `/api/orgs/:id/debt/:itemId` | SF session | Update status/assignee/notes |
| DELETE | `/api/orgs/:id/debt/:itemId` | SF session | Delete debt item |
| GET | `/api/orgs/:id/debt/burndown` | SF session | Weekly burndown data |
| POST | `/api/orgs/:id/debt/:itemId/push-jira` | SF session | Push to Jira (per-request credentials) |
| POST | `/api/orgs/:id/debt/:itemId/push-linear` | SF session | Push to Linear (per-request credentials) |
| GET | `/api/compare` | SF session | Compare two audits |
| GET | `/api/portfolio` | App session | Fleet score + all orgs |
| GET | `/api/portfolio/compare` | App session | Category scores for N orgs |
| POST | `/api/schedules` | SF session | Create scheduled audit |
| GET | `/api/schedules` | SF session | List org's schedules |
| PATCH | `/api/schedules/:id` | SF session | Enable/disable schedule |
| DELETE | `/api/schedules/:id` | SF session | Delete schedule |
| GET | `/api/custom-rules` | App session | List user's custom rules |
| POST | `/api/custom-rules` | App session | Create custom rule |
| PUT | `/api/custom-rules/:id` | App session | Update custom rule |
| DELETE | `/api/custom-rules/:id` | App session | Delete custom rule |
| POST | `/api/feedback` | None | Submit feedback rating |
| POST | `/api/support` | None | Submit support ticket |
| GET | `/auth/salesforce` | None | Start SF OAuth flow |
| GET | `/auth/salesforce/callback` | None | OAuth callback |
| GET | `/auth/session` | None | Current SF session info |
| POST | `/auth/logout` | None | Revoke SF token + clear session |
| POST | `/api/mc/connect` | App session (optional) | Connect MC org |
| GET | `/api/mc/session` | None | MC session status |
| POST | `/api/mc/audit` | MC session | Start MC audit |
| GET | `/api/mc/audit/:id` | None | Poll MC audit |
| POST | `/api/mc/audit/:id/advise` | MC session | AI guide for MC finding |
| GET | `/api/mc/audit/:id/advise/stream` | None | Streaming AI guide for MC |

---

## 6. Data Model Summary

| Table | Purpose |
|---|---|
| `orgs` | One row per Salesforce org ever connected |
| `audits` | One row per completed audit |
| `category_scores` | Per-category scores for each audit |
| `recommended_actions` | Top findings for each audit |
| `unused_fields` | Field-level detail for unused fields per audit |
| `scheduled_audits` | User-configured audit schedules |
| `shared_reports` | Share link tokens and expiry |
| `dismissed_findings` | Per-org acknowledged findings |
| `custom_rules` | User-defined health rules |
| `debt_items` | Technical debt backlog items |
| `mc_orgs` | MC org credentials (encrypted) |
| `feedback` | User satisfaction ratings |
| `support_tickets` | Support requests |
| `users` | App user accounts |
| `app_sessions` | App user sessions |

---

## 7. Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS (no framework) | Zero build step, instant load, no dependency risk |
| Backend | Node.js 18+ + Express | Fast async I/O for parallel API calls |
| Database | PostgreSQL (prod) / SQLite (dev) | Simple local dev; production-grade in prod |
| SF connectivity | jsforce | OAuth + REST + Tooling + Metadata API |
| MC connectivity | Custom HTTPS client | MC REST APIs have no maintained Node client |
| AI | OpenRouter (streaming SSE) | Model-agnostic; falls back gracefully |
| Charts | Inline SVG (hand-coded) | No external library; full control; zero load cost |
| Scheduling | node-cron | Lightweight in-process scheduling |
| Auth | OAuth 2.0 + PKCE | Industry standard; no password exposure |
| Security | Helmet, express-rate-limit | Standard Express hardening |
| Hosting | Render.com | Git-based auto-deploy; managed Postgres |

---

*PRD v2.0 — Sprint 2 complete. Baseline for Sprint 3 planning.*
