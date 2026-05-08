# Business Requirements Document (BRD)
## SFHealth — Salesforce & Marketing Cloud Org Health Platform

**Document Version:** 2.0  
**Date:** May 2026  
**Status:** Approved — Sprint 2 Complete  
**Author:** Product Team  
**Live Product:** https://sf-health-dashboard.onrender.com  
**Repository:** https://github.com/AryanSharmaa/sf-health-dashboard

---

## 1. Executive Summary

Salesforce and Marketing Cloud orgs degrade silently. Technical debt accumulates across automations, security configurations, code quality, and data hygiene — but there is no single, automated, always-available tool that gives teams an objective view of org health in under two minutes.

SFHealth is a web-based SaaS platform that solves this. It connects to Salesforce and Marketing Cloud via OAuth, runs a comprehensive read-only audit across eight health categories, and delivers a 0–100 scored report with prioritised remediation actions, trend tracking, multi-org portfolio management, compliance exports, a living technical debt backlog, and AI-guided remediation. The platform serves Salesforce Administrators, Consultants, Architects, and IT leadership — without requiring Salesforce expertise to interpret the results.

This document defines the business context, objectives, requirements, and success criteria that governed the build of SFHealth through Sprint 2.

---

## 2. Business Problem Statement

### 2.1 The Problem

Salesforce and Marketing Cloud orgs accumulate four types of invisible problems:

| Problem Type | Business Impact |
|---|---|
| **Technical debt** | Legacy automations, stale Apex code, deprecated API usage — these slow delivery, cause deployment failures, and eventually break when Salesforce deprecates features |
| **Security gaps** | Over-permissioned profiles, no MFA, guest user access to sensitive objects — these create data breach and compliance risk |
| **Operational degradation** | API limits approaching, async job errors, inactive journeys, locked MC users — these cause silent failures in production campaigns and integrations |
| **Wasted capacity** | Unused custom fields, inactive users, orphaned records — these increase storage costs and reduce data quality |

### 2.2 The Current Situation

Today, identifying these problems requires:
- **Hours of manual investigation** across dozens of Salesforce Setup pages
- **Expensive consultants** for periodic "health check" engagements (typically £5,000–£25,000)
- **Salesforce Health Check** — a built-in tool that covers only security settings, not automation, code quality, data, or adoption
- **Separate tools** for each problem area — none of which integrate or give a unified view

There is no single automated, affordable, always-available tool that gives a complete org health picture with actionable priorities.

### 2.3 The Opportunity

- 150,000+ Salesforce customers worldwide need regular org health insight
- Salesforce Consulting Partners spend 20–40% of engagement time on health assessment work that could be automated
- Marketing Cloud has no equivalent health check tool at all — every MC audit is entirely manual
- Compliance requirements (GDPR, SOC 2, AppExchange ISV) create a recurring need for audit-ready documentation
- Technical debt in Salesforce orgs is growing faster than teams can address it — without a tracking mechanism, remediation never happens

---

## 3. Stakeholders

| Stakeholder | Role | Interest |
|---|---|---|
| **Salesforce Admin** | Primary user | Understand their org, get prioritised fix list, track improvement over time |
| **Salesforce Consultant** | Primary user | Rapidly audit client orgs, generate professional reports, export compliance docs |
| **Salesforce Architect** | Primary user | Track debt, monitor trends, enforce quality standards across the team |
| **Marketing Cloud Admin** | Primary user | Get operational health visibility they currently have no tool for |
| **IT Manager / CTO / VP** | Secondary user | Receive board-ready health score without needing Salesforce expertise |
| **Compliance Officer** | Secondary user | Access GDPR, SOC 2, and ISV compliance documentation on demand |
| **Development Team** | Internal | Maintain and extend the platform |

---

## 4. Business Objectives

| # | Objective | Measure | Target |
|---|---|---|---|
| B1 | Reduce time to org health insight from hours to minutes | Time from login to first score | < 2 minutes |
| B2 | Replace periodic manual health check engagements | Engagement hours saved per client audit | 8–16 hours saved |
| B3 | Enable continuous improvement tracking | Orgs with score trend data | > 80% of returning users |
| B4 | Cover both Salesforce and Marketing Cloud | Platform coverage | Both SF and MC audited on same platform |
| B5 | Provide compliance-ready documentation | Compliance export types | GDPR/DPDP, SOC 2, ISV AppExchange |
| B6 | Convert one-time findings into tracked remediation | Debt items created from audit findings | Debt tracker adoption > 50% of audited findings |
| B7 | Integrate with existing engineering workflows | Integration options | Jira and Linear push from debt tracker |

---

## 5. Business Requirements

Business requirements define **what** the business needs — not **how** it is implemented. Each requirement is technology-neutral.

### 5.1 Core Audit

| ID | Business Requirement |
|---|---|
| BR-01 | The platform must assess the health of a Salesforce org without requiring the user to enter their password into the platform |
| BR-02 | The platform must produce a single, human-readable health score that can be communicated to non-technical stakeholders |
| BR-03 | The platform must identify and rank the most important issues to address, so users know where to start |
| BR-04 | The platform must audit both the Salesforce platform and Marketing Cloud from a single place |
| BR-05 | The platform must complete a full audit in under 5 minutes for any standard org |
| BR-06 | The platform must never modify, delete, or write to customer data in any connected org |

### 5.2 Reporting & Sharing

| ID | Business Requirement |
|---|---|
| BR-07 | Audit results must be exportable in a format suitable for sharing with clients and stakeholders |
| BR-08 | A shareable link must allow third parties to view results without creating an account |
| BR-09 | A white-labelled consulting report must allow partners to present results under their own brand |
| BR-10 | Compliance-specific reports (GDPR, SOC 2, ISV) must be generated on demand from any completed audit |

### 5.3 History & Trends

| ID | Business Requirement |
|---|---|
| BR-11 | The platform must store every audit result so users can track improvement over time |
| BR-12 | Users must be able to see whether their org is improving or declining between audits |
| BR-13 | The platform must identify issues that recur across multiple audits |

### 5.4 Multi-Org Management

| ID | Business Requirement |
|---|---|
| BR-14 | Users managing multiple orgs must be able to see all orgs' health in one view |
| BR-15 | A single aggregate score must represent the overall fleet health across all connected orgs |
| BR-16 | Orgs with poor health must be flagged prominently so attention is prioritised |
| BR-17 | Users must be able to compare multiple orgs side-by-side |

### 5.5 Technical Debt Management

| ID | Business Requirement |
|---|---|
| BR-18 | Individual audit findings must be convertible into tracked work items |
| BR-19 | Work items must be assignable to team members and trackable through to resolution |
| BR-20 | Users must be able to see a burndown of debt over time to measure team progress |
| BR-21 | Debt items must be pushable to existing project management tools (Jira, Linear) without manual data re-entry |

### 5.6 Governance & Compliance

| ID | Business Requirement |
|---|---|
| BR-22 | The platform must produce audit-ready documentation for GDPR and India's DPDP Act |
| BR-23 | The platform must produce a SOC 2 readiness checklist aligned to Trust Service Criteria |
| BR-24 | The platform must produce an AppExchange security self-assessment for ISV partners |
| BR-25 | All compliance reports must be printable to PDF without additional tooling |

### 5.7 Security & Privacy

| ID | Business Requirement |
|---|---|
| BR-26 | The platform must not store Salesforce access tokens or passwords in persistent storage |
| BR-27 | Marketing Cloud credentials must be encrypted at rest |
| BR-28 | Access to each org's data must be restricted to the session that authenticated with that org |
| BR-29 | The platform must enforce rate limiting to prevent abuse |

---

## 6. Constraints

| Constraint | Description |
|---|---|
| **No Salesforce agent / managed package** | The platform must work using only standard OAuth scopes — no Salesforce-side installation required |
| **Read-only access** | The platform must never write to customer orgs |
| **Browser-only client** | No desktop app or browser extension; must work in any modern browser |
| **No paid third-party charting libraries** | All visualisations must be built using native web APIs or inline SVG |
| **Credential security** | No plaintext credentials in code, commits, or logs |
| **Zero-setup for end users** | No SF org configuration required to use the platform for Salesforce audits |

---

## 7. Assumptions

- Salesforce orgs are accessed via standard Connected App OAuth — customers do not need to install anything
- Marketing Cloud orgs require a one-time Installed Package setup (5 minutes; read-only scopes only)
- Users accessing the platform are authorised by their organisation to audit the connected orgs
- The platform operates in a trust-but-verify model — it reports what metadata says, not what processes do
- Compliance reports are a starting point for human review, not a legal opinion

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Salesforce API scope changes break collection | Medium | High | Version-lock API calls; graceful partial audit with `isPartial` flag |
| Customer shares audit link publicly, exposing org data | Low | High | Link expiry (30 days); no PII in audit data by default |
| Marketing Cloud API rate limits hit during audit | Medium | Medium | Parallel-limited collection; audit completes partially if some endpoints fail |
| Jira/Linear credential interception | Low | High | Credentials sent per-request, never stored; HTTPS enforced |
| False positives in compliance reports cause over-confidence | Medium | High | Prominent disclaimer on all compliance report pages |

---

## 9. Success Metrics

| Metric | Definition | Target |
|---|---|---|
| Time to first score | Login → completed audit result | < 2 minutes |
| Returning user rate | Users who audit the same org 2+ times within 30 days | > 40% |
| Debt tracker adoption | Findings added to debt tracker / total findings shown | > 30% |
| Compliance report exports | Reports generated per audit | > 0.5 exports per user session |
| Portfolio use | Users with 2+ orgs in portfolio view | > 20% of logged-in users |
| AI guide usage | AI fix guide requests per audit | > 1 per session |

---

## 10. Scope Summary

### In Scope (Sprint 1 + Sprint 2 — Complete)

- Salesforce org audit (8 categories, weighted scoring, A–F grade)
- Marketing Cloud audit (5 categories)
- Operational health panels (SF + MC)
- Audit history, score trends, recurring issue detection
- AI-powered remediation guide (streaming)
- Multi-org portfolio with fleet score and attention filter
- Multi-org comparison view with category breakdown
- Custom user-defined rules engine
- White-label / consulting mode PDF reports
- Compliance reports: GDPR/DPDP, SOC 2, ISV AppExchange
- Technical Debt Tracker (backlog, burndown, Jira push, Linear push)
- Shareable report links (30-day expiry)
- Scheduled audits (daily / weekly / monthly) with email delivery
- Knowledge base documentation site (/docs)
- User accounts (registration, login, session management)
- Dismissed findings (acknowledge-and-hide)

### Out of Scope

- Salesforce managed package installation
- Automated writing to customer orgs
- Slack / Teams notification integration
- Native mobile application
- Role-based access control within a team account
- Anomaly detection / ML baseline modelling

---

*This document represents the business requirements baseline for SFHealth v2.0.*
