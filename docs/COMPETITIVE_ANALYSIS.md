# SFHealth vs Salesforce Native Features
## Why SFHealth Exists When Salesforce Has Built-In Tools

**Version:** 2.0 · May 2026

---

## Executive Summary

Salesforce ships several built-in monitoring and health tools. Each addresses one specific problem in isolation. SFHealth is not competing with any one of them — it is replacing the entire fragmented picture with a single, unified, scored, actionable, and historically-tracked view. This document explains each native Salesforce tool, what it does well, where it stops, and what SFHealth adds.

---

## 1. Salesforce Health Check

### What it does
Salesforce Health Check (Setup → Security → Health Check) evaluates your org's security configuration against a baseline. It produces a score based on settings like password policy, session timeout, and IP restrictions.

### What it does well
- Zero setup — available in every org
- Focused on security — the checks are relevant
- Trusted by Salesforce compliance teams

### What it does NOT do

| Gap | SFHealth's Answer |
|---|---|
| **Only covers security** — no automation, code quality, data, API, or adoption | 8 categories: automation, security, data quality, API usage, code quality, user adoption, unused fields, tech debt |
| **No scoring trend** — you see today's score with no history | Full trend chart across 90 days + score delta vs. previous audit |
| **No recommended actions** — tells you a setting is wrong, not how to fix it | Top 5 prioritised actions in plain English + AI step-by-step remediation guide |
| **No export** — results cannot be shared with stakeholders | HTML, JSON, PDF, white-label consulting report, 30-day share link |
| **No Marketing Cloud coverage** | Full MC audit across 5 categories + 15-item operational health panel |
| **No compliance reports** | GDPR/DPDP, SOC 2 readiness, ISV AppExchange review — all one click |
| **No cross-org view** | Portfolio view: fleet score, worst org, attention list, multi-org comparison |
| **No debt tracking** | Technical Debt Tracker: backlog, burndown, Jira/Linear push |
| **No custom rules** | Define your own thresholds: `if apexTestCoverage < 80 then flag as CRITICAL` |

**Verdict:** Salesforce Health Check is a security-only, point-in-time, non-exportable score with no remediation guidance. SFHealth covers security as one of eight categories, exports in 7 formats, tracks history, and guides remediation with AI.

---

## 2. Salesforce Optimizer

### What it does
Salesforce Optimizer (Setup → Optimizer) is an automated report that analyses your org configuration across ~50 areas and flags items that Salesforce recommends addressing. Categories include: Apex code, automation, storage, reports, user setup, and more.

### What it does well
- Broad coverage — more areas than Health Check
- Gives specific object/class names in findings
- Built into every Enterprise+ org

### What it does NOT do

| Gap | SFHealth's Answer |
|---|---|
| **PDF only** — output is a static PDF, cannot be queried, shared via link, or integrated | 7 export types including JSON, shareable link, and compliance-specific reports |
| **No score** — produces a list of issues with no aggregate health number | 0–100 weighted score with grade, benchmark, and delta |
| **No prioritisation** — all findings are listed with equal weight | Priority tiering: Critical / High / Medium / Low; top 5 surfaced first |
| **No trend tracking** — run it today and next month, no comparison | Full trend charts, score delta, recurring issue detection |
| **No AI remediation** — the report tells you what is wrong but not how to fix it | AI Fix Guide streamed in real time, specific to your org's context |
| **No Marketing Cloud** | Marketing Cloud audit with 5 scored categories |
| **No portfolio view** | Multi-org fleet score and comparison |
| **No debt tracker** | Findings do not become work items; Optimizer is a dead-end document |
| **Slow to run** — can take 10–30 minutes | SFHealth audit completes in < 2 minutes |
| **No scheduling** — must be run manually each time | Daily/weekly/monthly scheduled audits with email delivery |
| **Not shareable without Salesforce access** | 30-day public share link — no Salesforce account needed to view |

**Verdict:** Salesforce Optimizer is a comprehensive but static, unscored, un-prioritised PDF. It tells you what exists, not what to do first or whether you are getting better. SFHealth turns the same data into a living, tracked, actionable system.

---

## 3. Setup Audit Trail

### What it does
Setup Audit Trail (Setup → Security → View Setup Audit Trail) logs all configuration changes made in your org — who changed what, when.

### What it does well
- Immutable log of setup changes — essential for compliance investigations
- Available in all editions
- Date, user, and change detail for every entry

### What it does NOT do

| Gap | SFHealth's Answer |
|---|---|
| **Reactive, not proactive** — only useful after something breaks | SFHealth audits current state and flags problems before they cause incidents |
| **No health interpretation** — raw log data, no analysis | Full scored assessment with prioritised recommendations |
| **No cross-org view** | Portfolio view across all connected orgs |
| **No compliance report generation** | GDPR, SOC 2, ISV reports generated from audit data in one click |

**Verdict:** Audit Trail and SFHealth are complementary, not competitive. Audit Trail tells you who did what; SFHealth tells you what the current state is and what to fix. Both are needed for a complete picture.

---

## 4. Einstein Activity Capture / CRM Analytics Health

### What it does
Einstein Activity Capture monitors email/calendar sync health; CRM Analytics (formerly Tableau CRM) can report on org data quality if configured.

### What it does NOT do for org health

| Gap | SFHealth's Answer |
|---|---|
| **Not standard** — requires Einstein licenses (additional cost) | SFHealth uses standard OAuth — no additional SF license |
| **No automation/code/security coverage** | 8 health categories including security and code quality |
| **Configuration required** — CRM Analytics needs data sets, dashboards built from scratch | Zero-setup audit — nothing to configure |

---

## 5. Event Monitoring

### What it does
Event Monitoring (additional license) provides granular logs of user activity, API usage, login history, and more. Used by security teams for SIEM integration.

### What it does NOT do

| Gap | SFHealth's Answer |
|---|---|
| **Additional license cost** — not included in standard plans | SFHealth uses standard OAuth scopes |
| **Raw data, no analysis** — requires a SIEM or analyst to interpret | Interpreted, scored, and prioritised |
| **No code quality / automation health** | Full audit across 8 categories |
| **No MC coverage** | Marketing Cloud audit included |

---

## 6. Marketing Cloud Built-In Monitoring

### What Salesforce provides for MC health
Marketing Cloud has no equivalent Health Check tool. There is:
- **Automation Activity** screen — shows automations and their last run status
- **Journey Analytics** — email-level metrics (opens, clicks, bounces)
- **Email Send Summary** — last send performance per send definition
- **Data Extensions** list — no retention or size analysis

### What is missing entirely

| Gap | SFHealth's Answer |
|---|---|
| **No overall health score for MC** | Scored MC audit across 5 categories |
| **No Operational Health view** | 15 traffic-light indicators: locked users, paused automations, journey errors, send errors, connector status |
| **No cross-account comparison** | Portfolio view includes MC orgs |
| **No compliance documentation** | Compliance reports incorporate MC findings |
| **No alerts for errored automations** | Operational health shows error-state automations with item-level names |
| **No zero-injection journey detection** | Journey Health flags journeys with 0 contacts injected |
| **No AI remediation** | AI Fix Guide for MC findings |

**Verdict:** MC administrators currently have no automated health visibility tool. SFHealth fills this gap entirely.

---

## 7. Salesforce Shield / Platform Encryption

### What it does
Salesforce Shield provides field-level encryption, event monitoring, and field audit trail. A premium add-on for regulated industries.

### Relationship to SFHealth
Shield and SFHealth solve different problems. Shield encrypts and monitors data; SFHealth audits configuration health. SFHealth's SOC 2 and GDPR reports reference security controls that Shield enables — they are complementary. SFHealth tells you whether you have the right settings in place; Shield enforces them.

---

## 8. Summary Comparison Table

| Capability | SF Health Check | SF Optimizer | Setup Audit Trail | Event Monitoring | SFHealth |
|---|:---:|:---:|:---:|:---:|:---:|
| Overall org health score (0–100) | ✗ | ✗ | ✗ | ✗ | ✓ |
| Security checks | ✓ | Partial | ✗ | ✗ | ✓ |
| Automation health | ✗ | Partial | ✗ | ✗ | ✓ |
| Code quality (Apex coverage, hardcoded IDs) | ✗ | Partial | ✗ | ✗ | ✓ |
| Data quality | ✗ | Partial | ✗ | ✗ | ✓ |
| API usage analysis | ✗ | ✗ | ✗ | Partial | ✓ |
| User adoption scoring | ✗ | Partial | ✗ | ✓ (license) | ✓ |
| Unused fields analysis | ✗ | Partial | ✗ | ✗ | ✓ |
| Marketing Cloud audit | ✗ | ✗ | ✗ | ✗ | ✓ |
| Historical trends | ✗ | ✗ | ✗ | ✗ | ✓ |
| Score delta (improvement/decline) | ✗ | ✗ | ✗ | ✗ | ✓ |
| Prioritised remediation actions | ✗ | ✗ | ✗ | ✗ | ✓ |
| AI remediation guide | ✗ | ✗ | ✗ | ✗ | ✓ |
| Shareable link (no SF login needed) | ✗ | ✗ | ✗ | ✗ | ✓ |
| White-label PDF export | ✗ | ✗ | ✗ | ✗ | ✓ |
| GDPR / SOC 2 / ISV compliance reports | ✗ | ✗ | ✗ | ✗ | ✓ |
| Multi-org portfolio view | ✗ | ✗ | ✗ | ✗ | ✓ |
| Technical debt backlog | ✗ | ✗ | ✗ | ✗ | ✓ |
| Jira / Linear push | ✗ | ✗ | ✗ | ✗ | ✓ |
| Scheduled audits with email delivery | ✗ | ✗ | ✗ | ✗ | ✓ |
| Custom health rules engine | ✗ | ✗ | ✗ | ✗ | ✓ |
| No additional Salesforce license required | ✓ | ✓ | ✓ | ✗ | ✓ |
| Works in under 2 minutes | ✓ | ✗ (10–30 min) | N/A | N/A | ✓ |

---

## 9. When to Use Salesforce Native Tools Instead

SFHealth is not a replacement for everything:

| Use This Native Tool | When |
|---|---|
| **Setup Audit Trail** | Investigating a specific configuration change — who did what, when |
| **Health Check** | Quick security-only check inside SF Setup without leaving the platform |
| **Event Monitoring** | Building a SIEM integration or conducting a forensic security investigation |
| **Salesforce Optimizer** | Getting Salesforce's official assessment to share with Salesforce Support |
| **CRM Analytics** | Deep data analysis with custom visualisations built by your analytics team |

**Use SFHealth when you need:** a scored, prioritised, historically-tracked, exportable, multi-org, AI-guided, compliance-documented view of your entire org health — in under 2 minutes.

---

*This document is maintained by the SFHealth product team. Last updated May 2026.*
