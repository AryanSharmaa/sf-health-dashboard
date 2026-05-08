# How to Set Up This Project in Jira
## A Step-by-Step Guide for SFHealth

---

## Part 1 — What is Jira?

Jira (by Atlassian) is a project management tool used by software teams worldwide to plan, track, and ship work. Teams create **Issues** (work items) and organise them into **Sprints** using an **Agile Board**.

**Core concepts you need to know:**

| Term | What It Means |
|---|---|
| **Project** | A container for all work on SFHealth (like a folder) |
| **Issue** | A single unit of work — a User Story, Bug, or Task |
| **Epic** | A large feature that groups multiple related issues (e.g. "Technical Debt Tracker") |
| **Story** | A user-facing feature described from the user's perspective |
| **Task** | Technical work that is not a user-facing feature |
| **Bug** | A defect that needs to be fixed |
| **Sprint** | A 1–2 week block where the team commits to completing a set of issues |
| **Backlog** | The full list of all issues not yet in a sprint |
| **Board** | A visual Kanban or Scrum view showing issues in columns (To Do / In Progress / Done) |
| **Story Points** | Effort estimate for an issue (1 = trivial, 3 = small, 5 = medium, 8 = large, 13 = very large) |

---

## Part 2 — Create Your Jira Account and Project

### Step 1: Sign Up
1. Go to **https://www.atlassian.com/software/jira**
2. Click **Get it free**
3. Sign up with your email (the same one you use for development)
4. Choose **Jira Software** (not Jira Service Management)
5. Name your site — e.g. `sfhealth` → this becomes `sfhealth.atlassian.net`

### Step 2: Create a Project
1. After signing in, click **Create project**
2. Choose **Scrum** (recommended — enables sprints and backlog)
3. Name the project: `SFHealth`
4. Project key: `SFH` (this prefixes all issue numbers, e.g. `SFH-42`)
5. Click **Create**

---

## Part 3 — Configure Your Board

### Step 1: Set Up Columns
Your Scrum board should have these columns:

| Column | Meaning |
|---|---|
| **To Do** | Issues in backlog or assigned to this sprint but not started |
| **In Progress** | Actively being worked on |
| **In Review** | PR opened / code review in progress |
| **Done** | Merged and deployed |

To customise columns:
1. Click **Board settings** (gear icon on the board, top right)
2. Click **Columns** in the left sidebar
3. Add "In Review" between In Progress and Done

---

## Part 4 — Create Your Epics

Epics map directly to the 14 Epics in the SFHealth User Stories document.

### How to Create an Epic
1. In the sidebar, click **Backlog**
2. Click **+ Create Epic** at the top of the Epic panel (left sidebar)
3. Name it exactly as it appears in the User Stories doc

**Create these 14 epics:**

| Epic Name | Key Issues It Contains |
|---|---|
| EP-01: Salesforce Org Connection | US-001 to US-004 |
| EP-02: Salesforce Org Audit | US-005 to US-010 |
| EP-03: Operational Health Monitoring | US-011, US-012 |
| EP-04: AI Remediation Guide | US-013 |
| EP-05: Report Exports & Sharing | US-014 to US-017 |
| EP-06: Compliance Reports | US-018 to US-020 |
| EP-07: Audit History & Trends | US-021 to US-025 |
| EP-08: Multi-Org Portfolio | US-026 to US-030 |
| EP-09: Custom Rules Engine | US-031, US-032 |
| EP-10: Technical Debt Tracker | US-033 to US-039 |
| EP-11: Marketing Cloud Audit | US-040 to US-043 |
| EP-12: Scheduled Audits | US-044, US-045 |
| EP-13: User Accounts | US-046, US-047 |
| EP-14: Knowledge Base | US-048 |

---

## Part 5 — Create Issues from User Stories

### How to Create a Story
1. Click **+ Create** in the top navigation
2. Set:
   - **Issue type:** Story
   - **Summary:** Copy the user story title (e.g. "Production Org OAuth Connection")
   - **Description:** Paste the full "As a... I want... so that..." text and acceptance criteria
   - **Epic Link:** Select the relevant epic
   - **Story Points:** Estimate effort (see guide below)
   - **Labels:** `sprint-1` or `sprint-2` as appropriate
3. Click **Create**

### Story Point Estimation Guide

| Points | Meaning | Example |
|---|---|---|
| 1 | Trivial — under an hour | Changing a label text |
| 2 | Small — a few hours | Adding a new nav button |
| 3 | Medium — half a day | Adding a filter to an existing list |
| 5 | Large — 1 day | New modal with form and API endpoint |
| 8 | Very large — 2 days | New page with chart and multiple API calls |
| 13 | Epic-sized — needs breaking down | Technical Debt Tracker (should be sub-tasks) |

**Historical estimates for SFHealth stories:**

| User Story | Suggested Points |
|---|---|
| US-001: Production Org OAuth | 3 |
| US-003: Switch Org Without SSO | 5 |
| US-005: Run Full Audit | 8 |
| US-006: Health Score & Grade | 5 |
| US-013: Streaming AI Fix Guide | 8 |
| US-016: 30-Day Shareable Link | 5 |
| US-017: White-Label Consulting PDF | 8 |
| US-018: GDPR/DPDP Report | 13 |
| US-019: SOC 2 Checklist | 13 |
| US-026: Fleet Health Score | 5 |
| US-029: Multi-Org Comparison | 13 |
| US-033: Add Finding to Debt Backlog | 5 |
| US-037: Debt Burndown Chart | 8 |
| US-038: Push to Jira | 8 |
| US-041: MC Scored Audit | 13 |

---

## Part 6 — Organise Sprints

SFHealth was built in 2 sprints. Recreate them in Jira for historical tracking or future planning.

### How to Create a Sprint
1. Go to **Backlog**
2. Click **Create Sprint** at the top of the backlog
3. Click the three dots next to the sprint → **Edit Sprint**
4. Set:
   - **Sprint Name:** e.g. `Sprint 1 — Core Audit`
   - **Start Date:** your actual start date
   - **End Date:** 2 weeks later
   - **Sprint Goal:** e.g. "Deliver working Salesforce OAuth connection, audit engine, scoring, and basic export"

### Sprint 1 Issues (US-001 to US-025)
Drag these from the backlog into Sprint 1:
- EP-01 all (US-001–004)
- EP-02 all (US-005–010)
- EP-03 all (US-011–012)
- EP-04 (US-013)
- EP-05 all (US-014–017)
- EP-07 all (US-021–025)
- EP-12 all (US-044–045)
- EP-13 all (US-046–047)

### Sprint 2 Issues (US-018 to US-048)
Drag into Sprint 2:
- EP-06 all (US-018–020) — Compliance Reports
- EP-08 all (US-026–030) — Portfolio
- EP-09 all (US-031–032) — Custom Rules
- EP-10 all (US-033–039) — Technical Debt Tracker
- EP-11 all (US-040–043) — Marketing Cloud
- EP-14 (US-048) — Knowledge Base

---

## Part 7 — Using the Board Day-to-Day

### Starting Your Day
1. Open **Board** view
2. Check what is "In Progress" — is anything blocked?
3. Check what is "To Do" — pick the top priority item and start it

### Updating Issues
When you start work on an issue:
1. Drag the card from **To Do** to **In Progress**
2. Open the issue → add a comment: "Starting work on this — implementing X approach"

When you open a PR:
1. Drag to **In Review**
2. Add a comment with the PR link: `PR: https://github.com/...`

When merged and deployed:
1. Drag to **Done**

### Linking Issues to Git Commits
In your commit message, include the issue key:  
`git commit -m "SFH-42 Add Jira push for debt tracker items"`

Jira automatically links the commit to the issue if GitHub is connected (see Part 8).

---

## Part 8 — Connect Jira to GitHub

### Step-by-Step
1. In Jira, go to **Project Settings → Integrations → GitHub**
2. Click **Connect to GitHub**
3. Authorise Atlassian to access your GitHub account
4. Select the `sf-health-dashboard` repository
5. Click **Save**

**What this unlocks:**
- Every commit mentioning `SFH-42` (or any issue key) appears in the issue's "Development" section
- PRs are linked to issues automatically
- Issues can be transitioned to Done automatically when a PR is merged (configure in Board settings → Transitions)

---

## Part 9 — Set Up the SFHealth Project Using the Debt Tracker Integration

You already built Jira integration directly into SFHealth. Here is how to use it:

### From SFHealth to Jira (Automated)
1. Run an audit on your own org
2. Click **⊕ Track** on any finding → it goes to the Debt Tracker
3. In the Debt Tracker, click **Jira** on the item
4. Enter your:
   - Jira Base URL: `https://sfhealth.atlassian.net`
   - Email: your Atlassian email
   - API Token: from `id.atlassian.com/manage-profile/security/api-tokens`
   - Project Key: `SFH`
5. Click **Push**

The issue appears in your Jira backlog instantly with the category, priority, and finding text pre-populated.

---

## Part 10 — Jira Vocabulary Cheat Sheet

| You want to... | Do this in Jira |
|---|---|
| See all unstarted work | **Backlog** view |
| See what the team is working on now | **Board** view |
| Plan the next sprint | **Backlog** → drag issues into the sprint → **Start Sprint** |
| Track how much work is done this sprint | **Reports → Burndown Chart** |
| Find a specific issue | Search bar (press `/`) |
| See all issues for one feature | Click the **Epic** in the roadmap or backlog sidebar |
| See how long issues are taking | **Reports → Velocity Chart** |
| Add a sub-task | Open a Story → click **Create child issue** |
| Raise a bug | `+ Create` → set Issue Type to **Bug** |
| Link two issues | Open issue → **Link issue** → choose "is blocked by" or "relates to" |

---

## Part 11 — Recommended Workflow for Sprint 3

1. **Sprint Planning** (Day 1, 1 hour)
   - Open Backlog in Jira
   - Review Sprint 3 candidates from USER_STORIES.md (US-049 to US-056)
   - Create issues for each, estimate story points
   - Drag selected issues into Sprint 3
   - Click **Start Sprint** → set 2-week end date → set sprint goal

2. **Daily Standup** (15 minutes)
   - Each team member updates their issues on the board
   - Drag cards to correct column
   - Any blockers added as comments on the issue

3. **Mid-sprint** (Day 7)
   - Check burndown chart — are you on track?
   - If behind, remove scope (drag issues back to backlog)

4. **Sprint Review** (Day 14)
   - Demo completed features from the Done column
   - Mark any incomplete issues → move to next sprint backlog

5. **Sprint Retrospective** (Day 14, 30 minutes)
   - What went well? What slowed us down? What should we change?
   - Create action items as Tasks in Jira

---

*This guide covers everything needed to set up and run SFHealth in Jira. The Jira integration built into SFHealth (Section 9) means new audit findings can flow directly into your Jira backlog — closing the loop between health visibility and engineering execution.*
