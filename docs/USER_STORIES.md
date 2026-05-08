# SFHealth — User Stories
## Complete Sprint 1 + Sprint 2 Backlog

**Format:** As a [persona], I want [capability] so that [outcome].  
**Status key:** ✅ Done | 🔲 Backlog

---

## Epic 1 — Salesforce Org Connection

### US-001 — Production Org OAuth Connection ✅
**As a** Salesforce Admin,  
**I want to** connect my production Salesforce org using the official Salesforce login page,  
**so that** I never have to give my password to a third-party tool.

**Acceptance criteria:**
- Salesforce login opens in the same tab using OAuth 2.0 + PKCE
- SFHealth never receives or stores the user's Salesforce password
- Access token is stored in an in-memory session with `httpOnly` cookie reference
- Session expires after 1 hour

---

### US-002 — Sandbox Org Connection ✅
**As a** Salesforce Developer,  
**I want to** connect my sandbox org as well as my production org,  
**so that** I can audit test environments without configuring anything differently.

**Acceptance criteria:**
- "Sandbox" login option uses `test.salesforce.com` as the login URL
- Sandbox orgs are tagged `[Sandbox]` throughout the UI

---

### US-003 — Switch Org Without SSO Re-Auth ✅
**As a** Consultant,  
**I want to** switch to a different Salesforce account without being silently logged back in as the same user,  
**so that** I can audit different clients' orgs in the same browser session.

**Acceptance criteria:**
- Clicking "Switch Org" revokes the current SF session and forces a new Salesforce login prompt
- `prompt=login` is appended to the OAuth URL to bypass SSO session cookie
- The connect options scroll into view automatically after clicking Switch Org

---

### US-004 — Return to Previously Connected Org ✅
**As a** returning Admin,  
**I want to** reconnect to my org with one click rather than going through the full OAuth flow every time,  
**so that** repeated audits don't require multiple login steps.

**Acceptance criteria:**
- Previously connected orgs appear as cards on the connect page
- Clicking the card shows a "Continue as [User]" banner
- User can proceed to audit or choose to switch

---

## Epic 2 — Salesforce Org Audit

### US-005 — Run Full Org Audit ✅
**As a** Salesforce Admin,  
**I want to** run a comprehensive audit of my org with a single click,  
**so that** I get a full health picture in under 2 minutes without manually checking dozens of Setup pages.

**Acceptance criteria:**
- "Run Audit" button starts an async job
- 9-step progress indicator shows current phase
- Results appear automatically on completion
- Audit runs in < 2 minutes for a standard org (< 500 users, < 5000 classes)

---

### US-006 — Health Score & Grade ✅
**As an** IT Manager,  
**I want to** receive a single 0–100 score and A–F grade for my org,  
**so that** I can communicate org health to non-technical stakeholders without explaining individual findings.

**Acceptance criteria:**
- Overall score is a weighted composite of 6 scored categories
- Grade: A (90+), B (80+), C (70+), D (60+), F (<60)
- Score benchmark shows comparison to similar-sized orgs
- Score delta vs. previous audit is shown (e.g. ▲ +7)

---

### US-007 — Per-Category Scores ✅
**As a** Salesforce Architect,  
**I want to** see a breakdown of my score by category,  
**so that** I know which area is dragging down the overall score and where to focus remediation.

**Acceptance criteria:**
- 8 categories shown with individual scores and visual bars
- Weight of each category shown (e.g. Security 20%)
- Issue count per category shown

---

### US-008 — Prioritised Recommended Actions ✅
**As an** Admin,  
**I want to** see a ranked list of the most important things to fix,  
**so that** I know exactly where to start without being overwhelmed by a list of 50 issues.

**Acceptance criteria:**
- Top 5 actions shown, sorted Critical → High → Medium → Low
- Each action has plain-English description
- Priority badge colour-coded (red/orange/yellow/green)
- "View names" drilldown chip shows specific affected items (e.g. inactive flow names)

---

### US-009 — Acknowledge / Dismiss Findings ✅
**As an** Admin,  
**I want to** dismiss findings I have consciously accepted as risks,  
**so that** acknowledged issues don't clutter my findings list every audit.

**Acceptance criteria:**
- "✓ Acknowledge" button on each finding
- Dismiss modal asks for a reason (accepted risk, false positive, won't fix, custom)
- Dismissed findings are hidden from subsequent audits for that org
- Dismissed findings list is viewable and items can be restored

---

### US-010 — Org Profile-Aware Scoring ✅
**As an** ISV Partner,  
**I want** the scoring weights to reflect my org type (ISV vs. enterprise vs. SMB),  
**so that** the score is relevant to what actually matters for my use case.

**Acceptance criteria:**
- Platform detects org type from edition and user count
- ISV orgs weight code quality higher
- Enterprise orgs weight security and data quality higher
- Org profile label shown in results (e.g. "ISV Profile")

---

## Epic 3 — Operational Health Monitoring

### US-011 — Governor Limit Fill Bars ✅
**As an** Admin,  
**I want to** see my current governor limit consumption immediately after an audit,  
**so that** I can spot capacity issues before they cause API failures.

**Acceptance criteria:**
- 6+ limit bars shown: Daily API Requests, Async Apex Executions, Bulk API, Platform Events, Single Email, Streaming API
- Colour: green < 50%, amber 50–80%, red > 80%
- Percentage and raw numbers shown

---

### US-012 — Error Signal Counts ✅
**As an** Admin,  
**I want to** see login failures, Apex errors, and callout failures from the past week,  
**so that** I can detect reliability problems that don't appear in standard monitoring.

**Acceptance criteria:**
- Login failures (7d), Apex CPU timeouts, async errors, callout errors shown with counts
- Counts link to remediation suggestions

---

## Epic 4 — AI Remediation Guide

### US-013 — Streaming AI Fix Guide ✅
**As an** Admin who doesn't know how to fix everything,  
**I want** an AI to explain each finding in my org's context and give me step-by-step instructions,  
**so that** I can actually fix problems without spending an hour researching.

**Acceptance criteria:**
- "AI Fix Guide" button on each of the top 5 actions
- Guide streams in real time (SSE) — appears word by word
- Context includes: org name, org profile, category, priority, exact finding
- Falls back to non-streaming if SSE unavailable
- Hidden if no AI provider key configured

---

## Epic 5 — Report Exports & Sharing

### US-014 — HTML Report Download ✅
**As a** Consultant,  
**I want to** download a formatted HTML report of the audit,  
**so that** I can share it with clients as a professional deliverable.

---

### US-015 — JSON Export ✅
**As an** Integration Developer,  
**I want to** download the raw audit data as JSON,  
**so that** I can process it in my own tooling or load it into a BI tool.

---

### US-016 — 30-Day Shareable Link ✅
**As a** Consultant,  
**I want to** generate a public URL to the audit results,  
**so that** clients can view their report without creating a SFHealth account.

**Acceptance criteria:**
- Link valid for 30 days
- No login required to view
- Link shows full results including score, category breakdown, and actions
- Expired links show a clear "expired" message

---

### US-017 — White-Label Consulting PDF ✅
**As a** Consulting Partner,  
**I want to** export a branded PDF report that shows my company's name instead of "SFHealth",  
**so that** I can present it to clients as part of my own engagement.

**Acceptance criteria:**
- Report uses `BRAND_NAME` env var for the title/header
- Print-ready HTML with `window.print()` button
- Includes: executive summary, score banner, category tables, benchmark, top actions

---

## Epic 6 — Compliance Reports

### US-018 — GDPR / DPDP Compliance Report ✅
**As a** Compliance Officer or Consultant at a company subject to GDPR or India's DPDP Act,  
**I want** a report showing which of my Salesforce controls pass or fail against data protection requirements,  
**so that** I have a documented starting point for a formal compliance review.

**Acceptance criteria:**
- Report covers: Guest User access, Modify All profiles, MFA, password policy, ownerless accounts, null email %, duplicate rules, unused fields (data minimisation), inactive users, storage, automation governance
- Each check: pass/fail/warn badge, finding detail, specific recommendation
- Summary banner: % compliance, pass/fail counts, progress bar
- Print-to-PDF button
- Legal disclaimer on all reports

---

### US-019 — SOC 2 Readiness Checklist ✅
**As a** company pursuing SOC 2 certification,  
**I want** a checklist of Salesforce configuration controls mapped to Trust Service Criteria,  
**so that** I can identify gaps before a formal SOC 2 audit.

**Acceptance criteria:**
- Covers CC6 (Access Controls), CC7 (Operations), CC8 (Change Management), A1 (Availability)
- Automated checks for each criterion
- Manual evidence checklist for non-automatable controls (WISP, incident response plan, etc.)

---

### US-020 — ISV AppExchange Security Review ✅
**As an** ISV Partner preparing to submit an app to AppExchange,  
**I want** an automated self-assessment aligned to Salesforce's security review requirements,  
**so that** I can identify and fix issues before the official review and reduce rejection risk.

**Acceptance criteria:**
- Covers: hardcoded IDs, test coverage, inactive triggers, API currency, legacy VF, MFA, guest access, minimal permissions, API safety, error rates
- Pre-submission manual checklist included
- Apex classes in scope listed
- Aligned to current Salesforce Security Review requirements

---

## Epic 7 — Audit History & Trends

### US-021 — Persistent Audit History ✅
**As an** Admin,  
**I want** every audit to be saved automatically,  
**so that** I can look back at previous results without re-running audits.

---

### US-022 — Score Trend Chart ✅
**As an** Architect,  
**I want to** see my org's score plotted over time,  
**so that** I can demonstrate to management that remediation work is having an impact.

**Acceptance criteria:**
- Line chart across last 90 days (configurable to 365)
- Each point is a completed audit; hovering shows score + date
- Trend line colour indicates direction (green = improving)

---

### US-023 — Per-Category Trend Grid ✅
**As an** Admin,  
**I want to** see which specific categories are improving or declining over time,  
**so that** I can understand whether a particular remediation sprint made a difference.

---

### US-024 — Recurring Issues Detection ✅
**As an** Admin,  
**I want to** see which issues keep appearing audit after audit,  
**so that** I know which problems are truly chronic rather than new.

**Acceptance criteria:**
- Issues appearing in 3+ of last 5 audits flagged as "Recurring"
- Shown in a dedicated "Chronic Issues" panel in history view

---

### US-025 — Two-Audit Comparison ✅
**As an** Admin,  
**I want to** compare any two specific audits side-by-side,  
**so that** I can see exactly what changed between two deployments or sprints.

---

## Epic 8 — Multi-Org Portfolio

### US-026 — Fleet Health Score ✅
**As a** Consulting Partner managing 10+ orgs,  
**I want** a single aggregate score representing all my orgs' health,  
**so that** I can see the overall state of my portfolio at a glance.

---

### US-027 — Worst Org Callout ✅
**As a** Consulting Partner,  
**I want** the worst-performing org to be prominently flagged,  
**so that** I immediately know where to focus attention without scanning all orgs.

---

### US-028 — Attention Filter (Grade D/F) ✅
**As a** Portfolio Manager,  
**I want** all orgs with a D or F grade highlighted in one section,  
**so that** I can quickly find orgs needing immediate remediation.

---

### US-029 — Multi-Org Visual Comparison ✅
**As an** Architect,  
**I want to** compare multiple orgs side-by-side in a visual chart,  
**so that** I can see which org is performing best and worst in each category.

**Acceptance criteria:**
- Select 2–10 orgs via checkboxes
- Overview bar chart with per-org colours and legend
- Detailed view: score cards, category bar chart with Best/Lowest badges
- Issues table with cell-level colour coding, counts, mini bars, and subtitle explaining the numbers

---

### US-030 — Portfolio PDF Export ✅
**As a** Consulting Partner,  
**I want to** export a portfolio summary to PDF for a management presentation,  
**so that** I can share the multi-org view without stakeholders needing a SFHealth account.

---

## Epic 9 — Custom Rules Engine

### US-031 — Define Custom Health Rules ✅
**As a** Salesforce Architect,  
**I want to** define my own minimum standards as rules (e.g. "test coverage must be > 80%"),  
**so that** my team's specific quality bar is automatically enforced on every audit.

**Acceptance criteria:**
- Rule syntax: `if <field> <operator> <value> then flag as <PRIORITY>`
- Rules evaluated immediately after every audit
- Violations shown in a dedicated card with priority and rule name

---

### US-032 — Manage Custom Rules (Enable / Edit / Delete) ✅
**As an** Admin,  
**I want to** enable, disable, edit, and delete my custom rules,  
**so that** I can maintain my rule set as org standards evolve.

---

## Epic 10 — Technical Debt Tracker

### US-033 — Add Audit Finding to Debt Backlog ✅
**As an** Admin or Architect,  
**I want to** click one button to add an audit finding to a tracked backlog,  
**so that** findings don't disappear after the audit ends — they become real work items.

**Acceptance criteria:**
- "⊕ Track" button on every recommended action
- Finding key hash prevents duplicate open items for same finding
- Button turns "✓ Tracked" immediately; disabled if already tracked

---

### US-034 — View and Filter Debt Backlog ✅
**As an** Admin,  
**I want to** see all my open debt items with filters for status, priority, and category,  
**so that** I can focus on the items that matter most in the current sprint.

**Acceptance criteria:**
- Backlog list with all items sorted by priority (Critical first)
- Filter bar: status, priority, category
- Stat row: Open, In Progress, Resolved, Critical Open

---

### US-035 — Change Status Inline ✅
**As a** team member,  
**I want to** update a debt item's status (Open / In Progress / Resolved) directly in the list,  
**so that** I don't have to open a separate screen to mark progress.

---

### US-036 — Assign Debt Items to Team Members ✅
**As an** Admin managing a team,  
**I want to** assign each debt item to a specific team member,  
**so that** ownership is clear and work is not duplicated.

---

### US-037 — Debt Burndown Chart ✅
**As an** Architect,  
**I want to** see a weekly burndown chart of items added vs. resolved,  
**so that** I can tell whether my team is reducing debt faster than new debt is being discovered.

**Acceptance criteria:**
- Inline SVG chart (no external library)
- Red line = items added per week
- Green line = items resolved per week
- When green crosses red, the team is burning down faster than it accumulates

---

### US-038 — Push Debt Item to Jira ✅
**As an** Admin whose team uses Jira,  
**I want to** push a debt item directly to Jira as an issue,  
**so that** my team can work on it in their existing sprint board without manually re-entering the data.

**Acceptance criteria:**
- Modal takes: Jira base URL, email, API token, project key
- Credentials sent per-request, never stored
- Issue created in Jira with title, description, type, and priority mapped from SFHealth
- Resulting issue key shown as badge on the debt item (e.g. `SFDEV-42`)

---

### US-039 — Push Debt Item to Linear ✅
**As an** Admin whose team uses Linear,  
**I want to** push a debt item to Linear,  
**so that** it appears on our engineering board without leaving SFHealth.

**Acceptance criteria:**
- Modal takes: Linear API key, Team ID
- Linear issue created with title, description, and priority mapped
- Issue ID stored on debt item; Linear badge shown

---

## Epic 11 — Marketing Cloud Audit

### US-040 — Connect Marketing Cloud Account ✅
**As an** MC Admin,  
**I want to** connect my Marketing Cloud account using Installed Package credentials,  
**so that** I can audit it without giving SFHealth full admin access.

**Acceptance criteria:**
- One-time setup: subdomain, Client ID, Client Secret
- Credentials saved encrypted (AES-256-GCM)
- Subsequent audits: one-click from saved org list (MID/EID only)

---

### US-041 — MC Scored Health Audit ✅
**As an** MC Admin,  
**I want to** receive a scored health report for my Marketing Cloud account,  
**so that** I can prioritise which problems to fix (currently I have no visibility at all).

**Acceptance criteria:**
- 5 categories: Email Deliverability, Sender Authentication, Journey Health, Automation Health, Account Hygiene
- Each category scored 0–100 with grade
- Overall MC health score

---

### US-042 — MC Operational Health Panel ✅
**As an** MC Admin,  
**I want to** see traffic-light indicators for 15 operational signals,  
**so that** I can spot problems (locked users, errored automations, zero-send journeys) before they affect campaigns.

**Acceptance criteria:**
- Locked users, large data extensions, overdue/errored/paused/skipped automations
- Triggered send error rate, active send threshold
- Push notification errors, zero-send states
- Journey Builder: email activity errors, zero-injection journeys, errored journeys
- MC Connector: sync availability, tracking data staleness

---

### US-043 — MC Operational Health Drilldowns ✅
**As an** MC Admin,  
**I want to** see the actual names of the affected automations, journeys, or users when a count is shown,  
**so that** I know exactly which item to go fix without having to search in MC.

**Acceptance criteria:**
- Every non-zero operational health count has a "View names" chip
- Clicking the chip expands a drilldown panel listing item names

---

## Epic 12 — Scheduled Audits & Email Reports

### US-044 — Schedule Automated Audits ✅
**As an** Admin,  
**I want to** schedule my org to be audited automatically every week,  
**so that** I always have a current health score without having to remember to run it manually.

**Acceptance criteria:**
- Frequency options: daily, weekly, monthly
- Day of week and hour configurable
- Email report delivered to configured address after each run

---

### US-045 — Manage and Toggle Schedules ✅
**As an** Admin,  
**I want to** enable, disable, and delete my scheduled audits,  
**so that** I can pause scheduling during quiet periods without losing the configuration.

---

## Epic 13 — User Accounts & Multi-Tenancy

### US-046 — User Registration and Login ✅
**As a** returning user,  
**I want to** create an account with email and password,  
**so that** my audit history, custom rules, and saved orgs are available every time I log in.

---

### US-047 — Persistent Org History Per Account ✅
**As a** logged-in user,  
**I want** my audit history and connected orgs to be tied to my account,  
**so that** history is not lost when I switch browsers or clear cookies.

---

## Epic 14 — Knowledge Base

### US-048 — Searchable Documentation Site ✅
**As a** new user,  
**I want to** find documentation for any feature with a keyword search,  
**so that** I can learn the product without filing a support ticket.

**Acceptance criteria:**
- Full docs site at `/docs`
- Sticky sidebar navigation with 20+ sections
- Live full-text search with highlighted matches
- No login required

---

## Backlog — Sprint 3 Candidates 🔲

| ID | Story | Priority |
|---|---|---|
| US-049 | As an Admin, I want to receive a Slack or Teams message when a scheduled audit finds a Critical issue, so I don't have to check email | High |
| US-050 | As an Admin, I want an anomaly alert when any metric deviates significantly from the baseline, so I catch emerging problems before they escalate | High |
| US-051 | As an Architect, I want to configure scoring weights per org (e.g. weight security at 40% for a financial services org), so the score reflects what matters to us | Medium |
| US-052 | As a Team Admin, I want to invite team members to the same account with viewer roles, so stakeholders can view reports without being able to trigger audits | Medium |
| US-053 | As a DevOps Engineer, I want a deployment safety check that blocks a deployment if it would reduce the health score below a configured threshold | Medium |
| US-054 | As an MC Admin, I want MC operational health metrics persisted so I can see trends in journey errors or automation failures over time | Medium |
| US-055 | As an Admin, I want to export my full debt backlog to CSV for reporting or offline planning | Low |
| US-056 | As a Consulting Partner, I want to install a lightweight Salesforce managed package that grants deeper metadata access for more accurate audits | Low |

---

*Sprint 1 + Sprint 2 complete: 48 user stories shipped. Sprint 3 backlog: 8 stories identified.*
