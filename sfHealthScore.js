/**
 * Salesforce Org Health Scoring Engine
 */

// ─── Org-type weight profiles ─────────────────────────────────────────────────

const WEIGHT_PROFILES = {
  isv: {
    label:        "ISV / App Builder",
    automation:    10, security:     20, dataQuality:  10,
    apiUsage:      20, codeQuality:  30, userAdoption: 10,
  },
  enterprise: {
    label:        "Enterprise (500+ users)",
    automation:    20, security:     25, dataQuality:  20,
    apiUsage:       5, codeQuality:  15, userAdoption: 15,
  },
  smb: {
    label:        "SMB",
    automation:    20, security:     15, dataQuality:  20,
    apiUsage:      10, codeQuality:  10, userAdoption: 25,
  },
  nonprofit: {
    label:        "Nonprofit",
    automation:    15, security:     20, dataQuality:  25,
    apiUsage:       5, codeQuality:  10, userAdoption: 25,
  },
  default: {
    label:        "Standard",
    automation:    20, security:     20, dataQuality:  15,
    apiUsage:      15, codeQuality:  15, userAdoption: 15,
  },
};

function detectOrgProfile(orgType, userCount) {
  const t = (orgType || "").toLowerCase();
  if (t.includes("developer"))                                                   return "isv";
  if (t.includes("nonprofit") || t.includes("foundation") || t.includes("ngo")) return "nonprofit";
  if ((userCount || 0) >= 500) return "enterprise";
  if ((userCount || 0) <= 50)  return "smb";
  return "default";
}

// ─── Benchmark percentile tables ──────────────────────────────────────────────
// pct[i] = % of orgs scoring BELOW (i * 10). Intermediate scores are interpolated.

const BENCHMARK_DATA = {
  small:      { label: "small orgs (< 25 users)",        pct: [0, 1,  3,  7, 15, 27, 43, 61, 78, 90, 97] },
  mid:        { label: "mid-market orgs (25–200 users)",  pct: [0, 1,  4,  9, 19, 32, 49, 67, 82, 92, 97] },
  large:      { label: "large orgs (200–1000 users)",     pct: [0, 2,  5, 11, 22, 36, 53, 71, 84, 93, 98] },
  enterprise: { label: "enterprise orgs (1000+ users)",   pct: [0, 2,  6, 13, 25, 40, 58, 75, 87, 94, 98] },
};

function computeBenchmark(score, userCount) {
  const u       = userCount || 0;
  const sizeKey = u < 25 ? "small" : u < 200 ? "mid" : u < 1000 ? "large" : "enterprise";
  const { label, pct } = BENCHMARK_DATA[sizeKey];
  const idx        = Math.min(Math.floor(score / 10), 9);
  const frac       = (score % 10) / 10;
  const percentile = Math.round(pct[idx] + (pct[idx + 1] - pct[idx]) * frac);
  return {
    percentile,
    sizeCategory: sizeKey,
    label,
    message: `Your score of ${score} is better than ${percentile}% of ${label}.`,
  };
}

// ─── Category scorers ────────────────────────────────────────────────────────

function scoreAutomation(meta) {
  const issues = [];
  let score = 100;

  const { flows = [], workflows = [], processBuildersActive = 0 } = meta.automation ?? {};

  const inactiveFlows = flows.filter((f) => !f.isActive).length;
  const inactivePct   = flows.length ? inactiveFlows / flows.length : 0;
  if (inactivePct > 0.5) {
    score -= 20;
    issues.push({ priority: "high", action: `${inactiveFlows} of ${flows.length} Flows are inactive — audit and remove unused flows to reduce clutter.` });
  } else if (inactivePct > 0.25) {
    score -= 10;
    issues.push({ priority: "medium", action: `${inactiveFlows} inactive Flows detected — review and deactivate or delete obsolete ones.` });
  }

  if (workflows > 0) {
    score -= Math.min(25, workflows * 5);
    issues.push({ priority: "high", action: `${workflows} legacy Workflow Rule(s) found — migrate to Flow before Salesforce retires them.` });
  }

  if (processBuildersActive > 0) {
    score -= Math.min(20, processBuildersActive * 5);
    issues.push({ priority: "high", action: `${processBuildersActive} active Process Builder(s) found — migrate to Flow (Record-Triggered) for better performance.` });
  }

  return { score: Math.max(0, score), issues };
}

function scoreSecurity(meta) {
  const issues = [];
  let score = 100;

  const {
    mfaEnabled             = false,
    profilesWithModifyAll  = 0,
    guestUserAccess        = false,
    namedCredentialsMissing = 0,
    passwordPolicyStrength = "strong",
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
    accountsWithoutOwner  = 0,
    nullEmailContactsPct  = 0,
    storageUsedPct        = 0,
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
    score -= 15;
    issues.push({ priority: "high", action: `${(nullEmailContactsPct * 100).toFixed(1)}% of Contacts have no email address — run a data enrichment campaign to improve reachability.` });
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
    dailyApiUsedPct       = 0,
    deprecatedApiCallsPct = 0,
    apexCalloutTimeouts   = 0,
    connectedAppsUnused   = 0,
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
    apexTestCoveragePct   = 0,
    apexClassesNoTests    = 0,
    hardcodedIds          = 0,
    apexErrorsPast30Days  = 0,
    lwcWithNoTests        = 0,
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
    monthlyActiveUsersPct    = 0,
    loginFrequencyAvgPerWeek = 0,
    customReportsUnused      = 0,
    trainingCompletionPct    = 0,
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
  const userCount  = orgMetadata.userAdoption?.totalLicensedUsers || 0;
  const profileKey = detectOrgProfile(orgMetadata.orgType, userCount);
  const profile    = WEIGHT_PROFILES[profileKey];

  const scorers = {
    automation:   scoreAutomation(orgMetadata),
    security:     scoreSecurity(orgMetadata),
    dataQuality:  scoreDataQuality(orgMetadata),
    apiUsage:     scoreApiUsage(orgMetadata),
    codeQuality:  scoreCodeQuality(orgMetadata),
    userAdoption: scoreUserAdoption(orgMetadata),
  };

  const overallScore = Object.entries(scorers).reduce((total, [cat]) => {
    return total + (scorers[cat].score * profile[cat]) / 100;
  }, 0);

  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const allIssues    = Object.entries(scorers).flatMap(([cat, result]) =>
    result.issues.map((issue) => ({ category: cat, ...issue }))
  );
  allIssues.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

  const categories = Object.fromEntries(
    Object.entries(scorers).map(([cat, result]) => [
      cat,
      {
        score:                Math.round(result.score),
        weight:               profile[cat],
        weightedContribution: Math.round((result.score * profile[cat]) / 100),
        issueCount:           result.issues.length,
      },
    ])
  );

  const roundedScore   = Math.round(overallScore);
  const confidence     = orgMetadata.confidence || {};
  const partialModules = confidence.partialModules || [];
  const isPartial      = partialModules.length > 0;

  return {
    orgId:        orgMetadata.orgId   ?? "unknown",
    orgName:      orgMetadata.orgName ?? "unknown",
    generatedAt:  new Date().toISOString(),
    overallScore: roundedScore,
    grade:        gradeFromScore(overallScore),
    orgProfile:   { key: profileKey, label: profile.label },
    isPartial,
    partialModules,
    confidence:   confidence.overall || (isPartial ? "partial" : "complete"),
    benchmark:    computeBenchmark(roundedScore, userCount),
    categories,
    top5RecommendedActions: allIssues.slice(0, 5),
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
  orgId:   "00D000000000001",
  orgName: "Acme Corp Production",
  orgType: "Enterprise Edition",
  automation: {
    flows: [
      { apiName: "Lead_Assignment",      isActive: true  },
      { apiName: "Opp_Stage_Update",     isActive: true  },
      { apiName: "Old_Campaign_Flow",    isActive: false },
      { apiName: "Legacy_Welcome_Email", isActive: false },
    ],
    workflows: 3,
    processBuildersActive: 2,
  },
  security: {
    mfaEnabled: true, profilesWithModifyAll: 5,
    guestUserAccess: true, namedCredentialsMissing: 2, passwordPolicyStrength: "medium",
  },
  dataQuality: {
    duplicateRulesEnabled: true, accountsWithoutOwner: 12,
    totalRecords: 150000, nullEmailContactsPct: 0.18, storageUsedPct: 0.72,
  },
  apiUsage: {
    dailyApiUsedPct: 0.65, deprecatedApiCallsPct: 0.05,
    latestVersion: "59.0", apexCalloutTimeouts: 8, connectedAppsUnused: 3,
  },
  codeQuality: {
    apexTestCoveragePct: 0.78, apexClassesNoTests: 4,
    hardcodedIds: 7, apexErrorsPast30Days: 22, lwcWithNoTests: 6,
  },
  userAdoption: {
    totalLicensedUsers: 250,
    monthlyActiveUsersPct: 0.68, loginFrequencyAvgPerWeek: 4,
    customReportsUnused: 25, dashboardsUnused: 8, trainingCompletionPct: 0.55,
  },
};

const result = scoreOrgHealth(sampleMetadata);
console.log(JSON.stringify(result, null, 2));

module.exports = { scoreOrgHealth };
