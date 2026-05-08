# SFHealth — User Instruction Manual

**Version:** 2.0 · May 2026  
**Live:** https://sf-health-dashboard.onrender.com  
**Docs site:** https://sf-health-dashboard.onrender.com/docs

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Connecting Your Salesforce Org](#2-connecting-your-salesforce-org)
3. [Running Your First Audit](#3-running-your-first-audit)
4. [Reading Your Results](#4-reading-your-results)
5. [AI Remediation Guide](#5-ai-remediation-guide)
6. [Exporting & Sharing Reports](#6-exporting--sharing-reports)
7. [Compliance Reports](#7-compliance-reports)
8. [Audit History & Trends](#8-audit-history--trends)
9. [Multi-Org Portfolio](#9-multi-org-portfolio)
10. [Technical Debt Tracker](#10-technical-debt-tracker)
11. [Jira & Linear Integration](#11-jira--linear-integration)
12. [Custom Rules](#12-custom-rules)
13. [Marketing Cloud Audit](#13-marketing-cloud-audit)
14. [Scheduled Audits](#14-scheduled-audits)
15. [User Account](#15-user-account)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Getting Started

### What You Need
- A modern browser (Chrome, Edge, Firefox, Safari)
- Login credentials for the Salesforce org you want to audit
- For Marketing Cloud: access to an MC Installed Package (one-time setup — see Section 13)

### Your First Visit
1. Go to **https://sf-health-dashboard.onrender.com**
2. Click **Get Started** or **Sign Up** to create a free account
3. Once logged in, click **Connect Salesforce** to link your first org

No installation, no Salesforce org configuration, no admin approval needed.

---

## 2. Connecting Your Salesforce Org

### Step-by-Step

1. On the Connect page, choose **Production** (for live orgs) or **Sandbox** (for test environments)
2. The Salesforce login page opens in the same tab
3. Enter your Salesforce username and password — **SFHealth never sees your password**
4. Salesforce asks you to authorise the connection — click **Allow**
5. You are returned to SFHealth and shown a **"Continue as [Your Name]"** banner

### Switching Orgs
If you want to log in as a different user or connect a different org:

1. Click **Switch Org** on the connect banner
2. The Salesforce login screen appears fresh — it will **not** silently reuse your existing Salesforce session
3. Enter the credentials for the new org

### Returning to a Previously Connected Org
Your previously connected orgs are listed on the connect page as one-click buttons. Click the org name to reconnect instantly.

### Security Notes
- Your Salesforce session lasts 1 hour
- Click **Disconnect SF** in the top nav to end the session and revoke your token at Salesforce
- SFHealth has **read-only access** — it cannot make changes to your org

---

## 3. Running Your First Audit

1. After connecting, you are taken to the **Audit** page
2. You will see your org name and instance URL in a banner at the top
3. Click the **Run Audit** button
4. A progress bar shows 9 phases as data is collected:
   - Automation → Security → Data Quality → API Limits → Code Quality → User Adoption → Unused Fields → Tech Debt → Score
5. The audit typically completes in **60–90 seconds**
6. Results appear automatically when complete

> **Tip:** You can only run 5 audits every 10 minutes. This is a fair-use limit to protect the platform.

---

## 4. Reading Your Results

### The Score Card
At the top of your results you will see:
- **Overall Score** (0–100) — the weighted composite of all categories
- **Grade** (A/B/C/D/F) — your score band
- **Benchmark** — how your score compares to similar-sized orgs
- **Delta** — improvement or decline vs. your previous audit (e.g. ▲ +7)
- **Score summary** — breakdown showing Critical, High, Medium, Low issue counts

### Category Breakdown
Below the score card, each of the 8 audit categories shows:
- A score bar and percentage
- Number of issues found in that category
- Visual contribution to the overall score

**Categories explained:**

| Category | What it means when the score is low |
|---|---|
| **Automation (20%)** | You have inactive flows, legacy Workflow Rules, or Process Builders that should be migrated to Flow |
| **Security (20%)** | Profiles have too many permissions, MFA is not enforced, or Guest User access is open |
| **Data Quality (15%)** | Records have owners, duplicates exist, email fields are blank, or storage is nearly full |
| **API Usage (15%)** | You are using too much of your daily API limit, using deprecated API versions, or callouts are failing |
| **Code Quality (15%)** | Apex test coverage is below 75%, classes contain hardcoded IDs, or async jobs are failing |
| **User Adoption (15%)** | Fewer than half of your licensed users are logging in regularly |
| **Unused Fields** | Many custom fields have no data — candidates for cleanup |
| **Tech Debt** | Apex classes are on old API versions or legacy Visualforce pages exist |

### Top 5 Recommended Actions
The most important things to fix, in priority order. Each action shows:
- **Priority badge** — Critical (red), High (orange), Medium (yellow), Low (green)
- **Plain-English description** of the exact issue
- **"View names" chip** — click to see the specific items affected (e.g., the actual Flow names that are inactive)
- **✦ AI Fix Guide** — click for step-by-step remediation
- **✓ Acknowledge** — dismiss the finding with a reason if you have accepted the risk
- **⊕ Track** — add to your Technical Debt Tracker backlog

### Operational Health Panel
Below recommendations, a panel shows live signals:
- **Governor Limits** — horizontal fill bars for API usage, async limits, Platform Events etc.
- **Error Signals** — login failures, Apex errors, callout failures in the past 7 days
- Amber bars (50–80%) are warnings; red bars (>80%) need immediate attention

---

## 5. AI Remediation Guide

1. Click **✦ AI Fix Guide** on any recommended action
2. A guide streams in below the action in real time (you see it writing itself)
3. The guide includes:
   - Why the issue matters for your specific org type
   - Step-by-step remediation instructions with Salesforce Setup paths
   - Things to check before and after the fix
   - Estimated effort

The AI has full context of your org's profile, score, and the specific finding — so guidance is not generic.

> **Note:** The AI guide requires an internet connection and an active AI service key configured in the platform. If unavailable, the button is hidden.

---

## 6. Exporting & Sharing Reports

After any completed audit, the **Export & Share** card provides 7 options:

| Button | What it does |
|---|---|
| **HTML Report** | Downloads a complete, self-contained formatted report as a file |
| **JSON Data** | Downloads raw audit data in JSON format — for custom analysis or tooling |
| **Print / PDF** | Opens the browser print dialog with a print-optimised layout |
| **Consulting Report** | Opens a white-label branded report suitable for client delivery |
| **GDPR / DPDP** | Opens the GDPR/DPDP compliance report (see Section 7) |
| **SOC 2 Checklist** | Opens the SOC 2 readiness report (see Section 7) |
| **ISV Security** | Opens the ISV AppExchange security review (see Section 7) |
| **Share Link** | Creates a public URL valid for 30 days — no login required to view |
| **Schedule** | Opens the scheduled audit modal (see Section 14) |

### Sharing a Report
1. Click **Share Link**
2. A URL appears — copy it or click **Open** to preview
3. Send the URL to anyone — they can view the full report without an account
4. Link expires after 30 days

### Consulting / White-Label Report
The consulting report uses your `BRAND_NAME` environment variable (defaults to "SF HEALTH"). It includes:
- Branded header with org name, org ID, and date
- Executive summary with score, grade, and benchmark
- All categories with issue details
- Print / Save as PDF button at the top

---

## 7. Compliance Reports

All three compliance reports are accessed from the **Export & Share** card. They open in a new browser tab as print-ready HTML.

### GDPR / DPDP Report
**Who needs this:** Orgs subject to GDPR (EU) or DPDP (India)

Checks 11 controls across three sections:
1. **Access Control & Least Privilege** — Guest User profiles, Modify All profiles, MFA, password policy
2. **Data Retention & Minimisation** — Ownerless accounts, contact email completeness, duplicate rules, unused fields, inactive users
3. **Data Integrity & Accuracy** — Storage usage, legacy automation

**How to use:**
1. Click **GDPR / DPDP** in Export & Share
2. Review each row — green = pass, red = fail, amber = warning
3. Click **Print / Save as PDF** at the top of the report
4. Share with your DPO or compliance team

### SOC 2 Readiness Checklist
**Who needs this:** Companies pursuing SOC 2 Type I or Type II certification

Covers Trust Service Criteria CC6, CC7, CC8, A1 with automated checks plus a manual evidence checklist.

### ISV / AppExchange Security Review
**Who needs this:** Salesforce ISV partners preparing to submit an app to AppExchange

Covers all automated checks in the AppExchange security review plus a pre-submission manual checklist and a list of all Apex classes in scope.

### Important Disclaimer
These reports are **starting points for compliance review, not legal opinions**. A formal GDPR audit requires a qualified data protection professional; a formal SOC 2 audit requires a licensed CPA firm.

---

## 8. Audit History & Trends

### Viewing History
1. Click **History** in the top navigation
2. Your org appears in the list — click it to expand
3. All past audits are listed with date, score, grade, and issue count
4. Click any row to view the full results for that audit
5. Check the **compare** box on two audits, then click **Compare** to see a side-by-side delta per category

### Score Trend Chart
Below the audit list, a line chart shows your overall score over the past 90 days. You can see if your org is getting healthier, declining, or staying flat.

### Category Trends
A grid shows each category's score over time — useful for spotting which specific area improved or degraded after a deployment or cleanup sprint.

### Recurring Issues
A dedicated panel highlights findings that have appeared in 3 or more of your last 5 audits. These are your most persistent, most important issues.

---

## 9. Multi-Org Portfolio

The Portfolio view is available to logged-in users with 2+ connected orgs.

### Accessing the Portfolio
Click **Portfolio** in the top navigation.

### What You See

**Fleet Score**  
A single aggregate score representing the average health of all your orgs. If the fleet score is below 70, something needs attention.

**Worst Performing Org**  
The org with the lowest score is called out with name, score, and grade so you know where to focus first.

**Orgs Needing Attention**  
Orgs with grade D or F are listed in an orange callout.

**All Orgs Table**  
Every connected org with: name, sandbox/production tag, health score bar, grade chip, and last audit date.

### Multi-Org Comparison

1. Check the boxes next to 2–10 orgs in the table
2. Click **Compare Selected**
3. An overview bar chart appears showing each org's score with a colour legend

**Detailed View:**  
Click **Detailed View** for the full breakdown:
- Score summary cards per org
- Category bar chart with Best/Lowest badges
- **Issues table** — each cell shows the issue count for that org + category with colour coding:
  - Green = 0 issues (Clean)
  - Amber = 1–2 issues  
  - Red = 3+ issues
  - Mini bars show proportion relative to the worst cell in that row
- Total Issues row at the bottom

### Portfolio PDF Export
Click **Export Portfolio PDF** to print a portfolio summary for board or client delivery.

---

## 10. Technical Debt Tracker

The Debt Tracker turns one-time audit findings into a living work backlog.

### Adding Items

On any audit result, each recommended action has a **⊕ Track** button:
1. Click **⊕ Track** on a finding
2. The button changes to **✓ Tracked** (green) — it is now in your backlog
3. If you click Track on a finding that is already open in the backlog, you get "Already tracked" — no duplicates are created

### Viewing the Backlog

1. Click **Debt Tracker** in the top navigation
2. The stat row at the top shows: Open, In Progress, Resolved, Critical Open counts
3. Each backlog item shows:
   - Priority badge (Critical / High / Medium / Low)
   - Category tag
   - Full action text
   - Status dropdown
   - Assignee input
   - Jira/Linear badges (if pushed)
   - Creation date

### Updating an Item

**Change status (inline):**  
Click the **Status** dropdown on any item and select Open, In Progress, or Resolved. The change saves immediately.

**Assign to someone:**  
Click the **Assignee** field, type a name or email, and click away (blur) — saves automatically.

### Burndown Chart
After you have data over multiple weeks, a burndown chart appears showing:
- **Red line** = items added per week
- **Green line** = items resolved per week

When the green line meets or crosses the red line, your team is resolving debt as fast as it comes in.

### Filtering
Use the filter bar to narrow by Status, Priority, or Category. Click **Filter** to apply.

### Deleting an Item
Click **Delete** on any item and confirm. Deleted items are gone permanently.

---

## 11. Jira & Linear Integration

Push individual debt items to your project management tool directly from SFHealth.

### Pushing to Jira

1. Open the Debt Tracker and find the item you want to push
2. Click the **Jira** button
3. In the modal, enter:
   - **Jira Base URL**: e.g. `https://yourcompany.atlassian.net`
   - **Email**: your Atlassian account email
   - **API Token**: from [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   - **Project Key**: e.g. `SFDEV`
4. Click **Push**
5. A Jira issue is created. The issue key (e.g. `SFDEV-42`) appears as a blue badge on the debt item

**What gets created in Jira:**
- Summary: `[SFHealth] <finding text>`
- Description: category, priority, org ID, any notes
- Issue type: Bug (Critical/High) or Task (Medium/Low)
- Priority mapped: Highest / High / Medium / Low

> **Security:** Your API token is sent directly to Jira on the server side and is **never stored** in SFHealth's database.

### Pushing to Linear

1. Click the **Linear** button on a debt item
2. In the modal, enter:
   - **Linear API Key**: from Linear → Settings → API → Personal API Keys
   - **Team ID**: from Linear → Settings → Teams → [Your Team] → General → Team ID (UUID format)
3. Click **Push**
4. A Linear issue is created with priority mapped (Urgent/High/Medium/Low)

> **Security:** Same as Jira — credentials are per-request and never persisted.

---

## 12. Custom Rules

Define your own health rules using plain English conditions that are evaluated against every audit.

### Rule Syntax

```
if <field> <operator> <value> then flag as <PRIORITY>
```

**Examples:**
```
if apexTestCoverage < 80 then flag as CRITICAL
if inactiveFlows > 10 then flag as HIGH
if modifyAllProfileCount > 1 then flag as CRITICAL
if guestUserAccess = true then flag as HIGH
if dailyApiUsedPct > 0.70 then flag as MEDIUM
```

**Supported fields:** `apexTestCoverage`, `inactiveFlows`, `activeWorkflows`, `modifyAllProfileCount`, `guestUserAccess`, `hardcodedIdCount`, `dailyApiUsedPct`, `monthlyActiveUserPct`, `unusedFieldCount`, `staleApexClasses`

**Supported operators:** `<`, `>`, `<=`, `>=`, `=`, `!=`

**Priority values:** `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`

### Creating a Rule

1. Click **Portfolio** → scroll to the **Custom Rules** card, or use the rules card on the audit results page
2. Enter a rule name (e.g. "Coverage Gate")
3. Enter the rule text (e.g. `if apexTestCoverage < 80 then flag as CRITICAL`)
4. Click **Save Rule**

### How Rules Are Applied

After every audit completes, all enabled rules are evaluated against the audit data. Matching rules appear in the **"Custom Rule Violations"** card on the results page with priority badge and rule name.

### Managing Rules

- **Toggle:** Click the enable/disable switch to turn a rule on or off without deleting it
- **Edit:** Click the edit icon to modify the rule text or name
- **Delete:** Click delete and confirm

---

## 13. Marketing Cloud Audit

### First-Time Setup (One Time Per MC Account, ~5 Minutes)

1. Log in to Marketing Cloud
2. Click your name (top-right) → **Setup**
3. Go to **Platform Tools → Apps → Installed Packages**
4. Click **New** → name it (e.g. `SFHealth`) → **Save**
5. Click **Add Component → API Integration → Server-to-Server → Next**
6. Grant these read-only scopes: Automation Read, Data Read, Email Read, Journey Builder Read, Tracking Events Read/Write
7. Click **Save** — copy the **Client ID** and **Client Secret**
8. Copy the **Subdomain** from the REST Base URI (e.g. `mcABCDEF` from `https://mcABCDEF.rest.marketingcloudapis.com`)

### Connecting in SFHealth

1. Click the **MC Audit** button in the top navigation (or on the audit results page)
2. Enter: Subdomain, Client ID, Client Secret, and optionally MID/EID
3. Click **Connect & Save**
4. Credentials are saved encrypted — you will never need to re-enter them for this MC account

### Running an MC Audit

1. Select the connected MC org (one-click for saved orgs)
2. Click **Run MC Audit**
3. Results appear across 5 categories: Email Deliverability, Sender Authentication, Journey Health, Automation Health, Account Hygiene
4. The Operational Health panel shows 15+ traffic-light indicators
5. Any non-zero count shows a **"View names"** chip — click to see the specific affected items

### MC AI Guide

Click **✦ AI Fix Guide** on any MC finding for contextualised remediation steps.

---

## 14. Scheduled Audits

Automate your audit cadence so you never have to remember to run one manually.

### Setting Up a Schedule

1. After running an audit, click **Schedule** in the Export & Share card
2. Enter:
   - **Email address** to receive the report
   - **Frequency**: Daily, Weekly, or Monthly
   - **Day of week** (for weekly) or day of month
   - **Hour** (0–23, server time)
3. Click **Schedule Audit**

### Managing Schedules

1. Click **History** → click your org → the **Schedules** section shows all active schedules
2. Toggle the switch to enable or disable a schedule
3. Click **Delete** to remove a schedule permanently

### What the Email Contains

The scheduled email includes:
- Overall score and grade for the period
- Score delta vs. previous scheduled audit
- Top 3 priority issues
- Link back to the full results

---

## 15. User Account

### Creating an Account

1. Visit the site → click **Sign Up**
2. Enter your name, email, and password
3. You are logged in immediately

### Why Log In?

| Feature | Guest (no account) | Logged In |
|---|---|---|
| Run Salesforce audit | ✓ | ✓ |
| View results | ✓ | ✓ |
| Save audit history | ✗ | ✓ |
| Portfolio view | ✗ | ✓ |
| Custom rules | ✗ | ✓ |
| Save MC credentials | ✗ | ✓ |
| Scheduled audits | ✗ | ✓ |
| Technical Debt Tracker | ✗ | ✓ |

### Changing Your Profile

Click your name in the top-right navigation → **Profile** → update your name or email.

### Logging Out

Click your name → **Log Out**. This ends your app session. Your Salesforce session is separate — click **Disconnect SF** to also revoke the SF token.

---

## 16. Troubleshooting

### "Audit timed out" or "Error: metadata timeout"

**Cause:** The audit takes longer for very large orgs (5000+ Apex classes, 500+ flows).  
**Fix:** Wait 5 minutes and try again. If persistent, contact support via the feedback button.

### "Not connected. Please connect your Salesforce org first."

**Cause:** Your 1-hour Salesforce session expired.  
**Fix:** Click **Connect Salesforce** and log in again.

### "Switch Org" takes me back to the same user

**Cause:** Your browser has a Salesforce SSO session cookie.  
**Fix:** This is handled automatically — SFHealth forces a new login prompt by appending `prompt=login` to the OAuth URL. If you still see the wrong user, log out of Salesforce directly at `login.salesforce.com` first.

### MC "Connect & Save" fails with "Invalid credentials"

**Cause:** The Client ID, Secret, or Subdomain is incorrect, or the Installed Package doesn't have the required scopes.  
**Fix:** Re-check all three values in the MC Setup → Installed Packages page. Ensure all required scopes (Automation, Data, Email, Journey Builder, Tracking Events) are checked.

### "Jira push failed" / "Linear push failed"

**Cause:** Incorrect credentials or insufficient permissions.  
**Fix:**  
- **Jira:** Verify your API token is valid at `id.atlassian.com`. Ensure the project key exists and your user has permission to create issues in that project.  
- **Linear:** Verify the Team ID is a valid UUID. Verify the API key has issue creation permissions.

### Compliance report shows all "Fail" for checks

**Cause:** The audit did not collect data for those fields — this happens when OAuth scopes are limited.  
**Fix:** Disconnect and reconnect your Salesforce org, ensuring all scopes are granted on the Salesforce authorisation screen.

### Share link shows "Report not found or link expired"

**Cause:** The share link is older than 30 days.  
**Fix:** Re-run the audit and generate a new share link.

---

*For more help, visit the docs site at `/docs` or use the in-app feedback button to contact the team.*
