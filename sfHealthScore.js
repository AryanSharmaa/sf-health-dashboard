/**
 * Salesforce Org Health Scoring Engine
 *
 * Input:  orgMetadata object (see sampleMetadata below for shape)
 * Output: health score JSON with per-category scores + top 5 recommended actions
 */

// --- Scoring weights (must sum to 100) ---
const CATEGORY_WEIGHTS = {
  automation:    20,
  security:      20,
  dataQuality:   15,
  apiUsage:      15,
  codeQuality:   15,
  userAdoption:  15,
};

// ─── Category scorers ────────────────────────────────────────────────────────

function scoreAutomation(meta) {
  const issues = [];
  let score = 100;

  const { flows = [], workflows = [], processBuildersActive = 0 } = meta.automation ?? {};

  const inactiveFlows = flows.filter((f) => !f.isActive).length;
  const inactivePct = flows.length ? inactiveFlows / flows.length : 0;
  if (inactivePct > 0.5) {
    score -= 20;
    issues.push({
      priority: "high",
      action: `${inactiveFlows} of ${flows.length} Flows are inactive — audit and remove unused flows to reduce clutter.`,
    });
  } else if (inactivePct > 0.25) {
    score -= 10;
    issues.push({
      priority: "medium",
      action: `${inactiveFlows} inactive Flows detected — review and deactivate or delete obsolete ones.`,
    });
  }

  if (workflows > 0) {
    score -= Math.min(25, workflows * 5);
    issues.push({
      priority: "high",
      action: `${workflows} legacy Workflow Rule(s) found — migrate to Flow before Salesforce retires them.`,
    });
  }

  if (processBuildersActive > 0) {
    score -= Math.min(20, processBuildersActive * 5);
    issues.push({
      priority: "high",
      action: `${processBuildersActive} active Process Builder(s) found — migrate to Flow (Record-Triggered) for better performance.`,
    });
  }

  return { score: Math.max(0, score), issues };
}

function scoreSecurity(meta) {
  const issues = [];
  let score = 100;

  const {
    mfaEnabled = false,
    profilesWithModifyAll = 0,
    guestUserAccess = false,
    namedCredentialsMissing = 0,
    passwordPolicyStrength = "strong", // "weak" | "medium" | "strong"
  } = meta.security ?? {};

  if (!mfaEnabled) {
    score -= 30;
    issues.push({ priority: "critical", action: "MFA is not enforced — enable MFA org-wide immediately to meet Salesforce requirements." });
  }

  if (profilesWithModifyAll > 3) {
    score -= 20;
    issues.push({ priority: "high", action: `${profilesWithModifyAll} profiles have 'Modify All Data' — follow least-privilege and reduce to only essential admins.` });
  }

  if (guestUserAccess) {
    score -= 15;
    issues.push({ priority: "high", action: "Guest User has broad object access — restrict Guest User profile permissions to minimum required." });
  }

  if (namedCredentialsMissing > 0) {
    score -= 10;
    issues.push({ priority: "medium", action: `${namedCredentialsMissing} integration(s) use hardcoded credentials — migrate to Named Credentials.` });
  }

  if (passwordPolicyStrength === "weak") {
    score -= 15;
    issues.push({ priority: "high", action: "Password policy is weak — enforce minimum length ≥ 12, complexity, and lockout settings." });
  } else if (passwordPolicyStrength === "medium") {
    score -= 5;
    issues.push({ priority: "low", action: "Password policy could be stronger — consider increasing minimum length and expiry period." });
  }

  return { score: Math.max(0, score), issues };
}

function scoreDataQuality(meta) {
  const issues = [];
  let score = 100;

  const {
    duplicateRulesEnabled = false,
    accountsWithoutOwner = 0,
    totalRecords = 0,
    nullEmailContactsPct = 0,  // 0–1
    storageUsedPct = 0,         // 0–1
  } = meta.dataQuality ?? {};

  if (!duplicateRulesEnabled) {
    score -= 20;
    issues.push({ priority: "high", action: "No Duplicate Rules are active — enable Duplicate Management to prevent data degradation." });
  }

  if (accountsWithoutOwner > 0) {
    score -= 10;
    issues.push({ priority: "medium", action: `${accountsWithoutOwner} Account(s) have no owner — assign owners to ensure proper visibility and follow-up.` });
  }

  if (nullEmailContactsPct > 0.2) {
    const pct = (nullEmailContactsPct * 100).toFixed(1);
    score -= 15;
    issues.push({ priority: "high", action: `${pct}% of Contacts have no email address — run a data enrichment campaign to improve reachability.` });
  }

  if (storageUsedPct > 0.85) {
    score -= 20;
    issues.push({ priority: "critical", action: `Storage is at ${(storageUsedPct * 100).toFixed(0)}% capacity — archive or delete stale records before hitting limits.` });
  } else if (storageUsedPct > 0.7) {
    score -= 10;
    issues.push({ priority: "medium", action: `Storage at ${(storageUsedPct * 100).toFixed(0)}% — plan for archiving or additional storage in the next quarter.` });
  }

  return { score: Math.max(0, score), issues };
}

function scoreApiUsage(meta) {
  const issues = [];
  let score = 100;

  const {
    dailyApiUsedPct = 0,       // 0–1
    deprecatedApiCallsPct = 0, // 0–1 (calls using retired API versions)
    apexCalloutTimeouts = 0,
    connectedAppsUnused = 0,
  } = meta.apiUsage ?? {};

  if (dailyApiUsedPct > 0.9) {
    score -= 30;
    issues.push({ priority: "critical", action: `API usage is at ${(dailyApiUsedPct * 100).toFixed(0)}% of daily limit — optimize batch jobs and request patterns immediately.` });
  } else if (dailyApiUsedPct > 0.7) {
    score -= 15;
    issues.push({ priority: "high", action: `API usage is at ${(dailyApiUsedPct * 100).toFixed(0)}% — review integrations for redundant calls and implement caching.` });
  }

  if (deprecatedApiCallsPct > 0) {
    score -= 20;
    issues.push({ priority: "high", action: `${(deprecatedApiCallsPct * 100).toFixed(1)}% of API calls use deprecated versions — upgrade integrations to API v${meta.apiUsage?.latestVersion ?? "59.0"}.` });
  }

  if (apexCalloutTimeouts > 10) {
    score -= 15;
    issues.push({ priority: "medium", action: `${apexCalloutTimeouts} Apex callout timeouts in the last 30 days — add retry logic and check external endpoint health.` });
  }

  if (connectedAppsUnused > 0) {
    score -= 10;
    issues.push({ priority: "low", action: `${connectedAppsUnused} Connected App(s) appear unused — revoke access to reduce attack surface.` });
  }

  return { score: Math.max(0, score), issues };
}

function scoreCodeQuality(meta) {
  const issues = [];
  let score = 100;

  const {
    apexTestCoveragePct = 0,  // 0–1
    apexClassesNoTests = 0,
    hardcodedIds = 0,
    apexErrorsPast30Days = 0,
    lwcWithNoTests = 0,
  } = meta.codeQuality ?? {};

  if (apexTestCoveragePct < 0.75) {
    score -= 30;
    issues.push({ priority: "critical", action: `Apex test coverage is ${(apexTestCoveragePct * 100).toFixed(0)}% — increase to ≥ 75% to enable safe deployments to production.` });
  } else if (apexTestCoveragePct < 0.85) {
    score -= 10;
    issues.push({ priority: "medium", action: `Apex test coverage is ${(apexTestCoveragePct * 100).toFixed(0)}% — aim for ≥ 85% for production confidence.` });
  }

  if (apexClassesNoTests > 0) {
    score -= 15;
    issues.push({ priority: "high", action: `${apexClassesNoTests} Apex class(es) have zero test coverage — write unit tests before next deployment.` });
  }

  if (hardcodedIds > 0) {
    score -= 15;
    issues.push({ priority: "high", action: `${hardcodedIds} hardcoded Salesforce ID(s) found in code — replace with Custom Labels or Custom Metadata.` });
  }

  if (apexErrorsPast30Days > 50) {
    score -= 20;
    issues.push({ priority: "high", action: `${apexErrorsPast30Days} Apex errors in the last 30 days — investigate and resolve root causes in error logs.` });
  }

  if (lwcWithNoTests > 0) {
    score -= 10;
    issues.push({ priority: "medium", action: `${lwcWithNoTests} LWC component(s) have no Jest tests — add UI tests to catch regressions early.` });
  }

  return { score: Math.max(0, score), issues };
}

function scoreUserAdoption(meta) {
  const issues = [];
  let score = 100;

  const {
    monthlyActiveUsersPct = 0, // active / total licensed users (0–1)
    loginFrequencyAvgPerWeek = 0,
    customReportsUnused = 0,
    dashboardsUnused = 0,
    trainingCompletionPct = 0, // 0–1
  } = meta.userAdoption ?? {};

  if (monthlyActiveUsersPct < 0.5) {
    score -= 30;
    issues.push({ priority: "high", action: `Only ${(monthlyActiveUsersPct * 100).toFixed(0)}% of licensed users are active — investigate adoption blockers and consider license reallocation.` });
  } else if (monthlyActiveUsersPct < 0.75) {
    score -= 15;
    issues.push({ priority: "medium", action: `${(monthlyActiveUsersPct * 100).toFixed(0)}% user adoption — run enablement sessions for low-activity user groups.` });
  }

  if (loginFrequencyAvgPerWeek < 3) {
    score -= 15;
    issues.push({ priority: "medium", action: `Average login frequency is ${loginFrequencyAvgPerWeek}x/week — promote daily habits via dashboards and notifications.` });
  }

  if (customReportsUnused > 20) {
    score -= 10;
    issues.push({ priority: "low", action: `${customReportsUnused} custom reports haven't been viewed in 90+ days — clean up report library to improve discoverability.` });
  }

  if (trainingCompletionPct < 0.6) {
    score -= 20;
    issues.push({ priority: "high", action: `Only ${(trainingCompletionPct * 100).toFixed(0)}% of users have completed onboarding training — schedule mandatory Trailhead paths.` });
  }

  return { score: Math.max(0, score), issues };
}

// ─── Main scoring function ────────────────────────────────────────────────────

function scoreOrgHealth(orgMetadata) {
  const scorers = {
    automation:   scoreAutomation(orgMetadata),
    security:     scoreSecurity(orgMetadata),
    dataQuality:  scoreDataQuality(orgMetadata),
    apiUsage:     scoreApiUsage(orgMetadata),
    codeQuality:  scoreCodeQuality(orgMetadata),
    userAdoption: scoreUserAdoption(orgMetadata),
  };

  // Weighted overall score
  const overallScore = Object.entries(CATEGORY_WEIGHTS).reduce((total, [cat, weight]) => {
    return total + (scorers[cat].score * weight) / 100;
  }, 0);

  // Collect and rank all issues by priority, then pick top 5
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const allIssues = Object.entries(scorers).flatMap(([cat, result]) =>
    result.issues.map((issue) => ({ category: cat, ...issue }))
  );
  allIssues.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const top5Actions = allIssues.slice(0, 5);

  const categories = Object.fromEntries(
    Object.entries(scorers).map(([cat, result]) => [
      cat,
      {
        score: Math.round(result.score),
        weight: CATEGORY_WEIGHTS[cat],
        weightedContribution: Math.round((result.score * CATEGORY_WEIGHTS[cat]) / 100),
        issueCount: result.issues.length,
      },
    ])
  );

  return {
    orgId: orgMetadata.orgId ?? "unknown",
    orgName: orgMetadata.orgName ?? "unknown",
    generatedAt: new Date().toISOString(),
    overallScore: Math.round(overallScore),
    grade: gradeFromScore(overallScore),
    categories,
    top5RecommendedActions: top5Actions,
  };
}

function gradeFromScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ─── Sample usage ─────────────────────────────────────────────────────────────

const sampleMetadata = {
  orgId: "00D000000000001",
  orgName: "Acme Corp Production",
  automation: {
    flows: [
      { apiName: "Lead_Assignment", isActive: true },
      { apiName: "Opp_Stage_Update", isActive: true },
      { apiName: "Old_Campaign_Flow", isActive: false },
      { apiName: "Legacy_Welcome_Email", isActive: false },
    ],
    workflows: 3,
    processBuildersActive: 2,
  },
  security: {
    mfaEnabled: true,
    profilesWithModifyAll: 5,
    guestUserAccess: true,
    namedCredentialsMissing: 2,
    passwordPolicyStrength: "medium",
  },
  dataQuality: {
    duplicateRulesEnabled: true,
    accountsWithoutOwner: 12,
    totalRecords: 150000,
    nullEmailContactsPct: 0.18,
    storageUsedPct: 0.72,
  },
  apiUsage: {
    dailyApiUsedPct: 0.65,
    deprecatedApiCallsPct: 0.05,
    latestVersion: "59.0",
    apexCalloutTimeouts: 8,
    connectedAppsUnused: 3,
  },
  codeQuality: {
    apexTestCoveragePct: 0.78,
    apexClassesNoTests: 4,
    hardcodedIds: 7,
    apexErrorsPast30Days: 22,
    lwcWithNoTests: 6,
  },
  userAdoption: {
    monthlyActiveUsersPct: 0.68,
    loginFrequencyAvgPerWeek: 4,
    customReportsUnused: 25,
    dashboardsUnused: 8,
    trainingCompletionPct: 0.55,
  },
};

const result = scoreOrgHealth(sampleMetadata);
console.log(JSON.stringify(result, null, 2));

module.exports = { scoreOrgHealth };
