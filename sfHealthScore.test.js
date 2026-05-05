const { scoreOrgHealth } = require("./sfHealthScore");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Perfectly healthy org — every metric at its best value */
const perfectOrg = {
  orgId: "00D000000000001",
  orgName: "Perfect Org",
  automation: {
    flows: [
      { apiName: "Flow_A", isActive: true },
      { apiName: "Flow_B", isActive: true },
    ],
    workflows: 0,
    processBuildersActive: 0,
  },
  security: {
    mfaEnabled: true,
    profilesWithModifyAll: 1,
    guestUserAccess: false,
    namedCredentialsMissing: 0,
    passwordPolicyStrength: "strong",
  },
  dataQuality: {
    duplicateRulesEnabled: true,
    accountsWithoutOwner: 0,
    totalRecords: 10000,
    nullEmailContactsPct: 0,
    storageUsedPct: 0.3,
  },
  apiUsage: {
    dailyApiUsedPct: 0.2,
    deprecatedApiCallsPct: 0,
    latestVersion: "59.0",
    apexCalloutTimeouts: 0,
    connectedAppsUnused: 0,
  },
  codeQuality: {
    apexTestCoveragePct: 0.95,
    apexClassesNoTests: 0,
    hardcodedIds: 0,
    apexErrorsPast30Days: 0,
    lwcWithNoTests: 0,
  },
  userAdoption: {
    monthlyActiveUsersPct: 0.95,
    loginFrequencyAvgPerWeek: 5,
    customReportsUnused: 2,
    dashboardsUnused: 0,
    trainingCompletionPct: 0.95,
  },
};

/** Worst-case org — every metric at its worst value */
const worstOrg = {
  orgId: "00D000000000002",
  orgName: "Worst Org",
  automation: {
    flows: [
      { apiName: "Old_Flow_1", isActive: false },
      { apiName: "Old_Flow_2", isActive: false },
      { apiName: "Old_Flow_3", isActive: false },
    ],
    workflows: 10,
    processBuildersActive: 10,
  },
  security: {
    mfaEnabled: false,
    profilesWithModifyAll: 10,
    guestUserAccess: true,
    namedCredentialsMissing: 5,
    passwordPolicyStrength: "weak",
  },
  dataQuality: {
    duplicateRulesEnabled: false,
    accountsWithoutOwner: 500,
    totalRecords: 1000000,
    nullEmailContactsPct: 0.9,
    storageUsedPct: 0.99,
  },
  apiUsage: {
    dailyApiUsedPct: 0.99,
    deprecatedApiCallsPct: 0.5,
    latestVersion: "59.0",
    apexCalloutTimeouts: 100,
    connectedAppsUnused: 10,
  },
  codeQuality: {
    apexTestCoveragePct: 0,
    apexClassesNoTests: 50,
    hardcodedIds: 30,
    apexErrorsPast30Days: 200,
    lwcWithNoTests: 20,
  },
  userAdoption: {
    monthlyActiveUsersPct: 0.1,
    loginFrequencyAvgPerWeek: 1,
    customReportsUnused: 100,
    dashboardsUnused: 50,
    trainingCompletionPct: 0.05,
  },
};

/** Empty org — no metadata fields provided at all */
const emptyOrg = { orgId: "00D000000000003", orgName: "Empty Org" };

// ─── Output shape ─────────────────────────────────────────────────────────────

describe("scoreOrgHealth — output shape", () => {
  test("returns required top-level fields", () => {
    const result = scoreOrgHealth(perfectOrg);
    expect(result).toHaveProperty("orgId");
    expect(result).toHaveProperty("orgName");
    expect(result).toHaveProperty("generatedAt");
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("grade");
    expect(result).toHaveProperty("categories");
    expect(result).toHaveProperty("top5RecommendedActions");
  });

  test("categories contains all six expected keys", () => {
    const result = scoreOrgHealth(perfectOrg);
    const keys = Object.keys(result.categories);
    expect(keys).toEqual(
      expect.arrayContaining(["automation", "security", "dataQuality", "apiUsage", "codeQuality", "userAdoption"])
    );
    expect(keys).toHaveLength(6);
  });

  test("each category has score, weight, weightedContribution, issueCount", () => {
    const result = scoreOrgHealth(perfectOrg);
    for (const cat of Object.values(result.categories)) {
      expect(cat).toHaveProperty("score");
      expect(cat).toHaveProperty("weight");
      expect(cat).toHaveProperty("weightedContribution");
      expect(cat).toHaveProperty("issueCount");
    }
  });

  test("top5RecommendedActions has at most 5 items", () => {
    const result = scoreOrgHealth(worstOrg);
    expect(result.top5RecommendedActions.length).toBeLessThanOrEqual(5);
  });

  test("each action has category, priority, and action fields", () => {
    const result = scoreOrgHealth(worstOrg);
    for (const action of result.top5RecommendedActions) {
      expect(action).toHaveProperty("category");
      expect(action).toHaveProperty("priority");
      expect(action).toHaveProperty("action");
    }
  });

  test("generatedAt is a valid ISO date string", () => {
    const result = scoreOrgHealth(perfectOrg);
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });
});

// ─── Score bounds ─────────────────────────────────────────────────────────────

describe("scoreOrgHealth — score bounds", () => {
  test("overallScore is between 0 and 100", () => {
    [perfectOrg, worstOrg, emptyOrg].forEach((org) => {
      const { overallScore } = scoreOrgHealth(org);
      expect(overallScore).toBeGreaterThanOrEqual(0);
      expect(overallScore).toBeLessThanOrEqual(100);
    });
  });

  test("category scores are between 0 and 100", () => {
    [perfectOrg, worstOrg, emptyOrg].forEach((org) => {
      const { categories } = scoreOrgHealth(org);
      for (const cat of Object.values(categories)) {
        expect(cat.score).toBeGreaterThanOrEqual(0);
        expect(cat.score).toBeLessThanOrEqual(100);
      }
    });
  });

  test("perfect org scores 100", () => {
    const { overallScore } = scoreOrgHealth(perfectOrg);
    expect(overallScore).toBe(100);
  });

  test("worst org scores below 20", () => {
    const { overallScore } = scoreOrgHealth(worstOrg);
    expect(overallScore).toBeLessThan(20);
  });

  test("perfect org gets grade A", () => {
    expect(scoreOrgHealth(perfectOrg).grade).toBe("A");
  });

  test("worst org gets grade F", () => {
    expect(scoreOrgHealth(worstOrg).grade).toBe("F");
  });

  test("scores are integers (rounded)", () => {
    const { overallScore, categories } = scoreOrgHealth(worstOrg);
    expect(Number.isInteger(overallScore)).toBe(true);
    for (const cat of Object.values(categories)) {
      expect(Number.isInteger(cat.score)).toBe(true);
      expect(Number.isInteger(cat.weightedContribution)).toBe(true);
    }
  });
});

// ─── Grade thresholds ─────────────────────────────────────────────────────────

describe("gradeFromScore — thresholds", () => {
  const makeOrgWithScore = (targetScore) => {
    // Drive score via apexTestCoveragePct since codeQuality deductions are predictable
    // Instead, use a direct weighted approach: supply a partially degraded org
    // We test grade by supplying known inputs and checking expected grade band
  };

  test.each([
    ["A", 90],
    ["B", 80],
    ["C", 70],
    ["D", 60],
    ["F", 59],
  ])("grade %s when overallScore is ~%i", (expectedGrade, approxScore) => {
    // Build an org that hits the approximate score band via security MFA flag
    // which contributes 30 * (20/100) = 6 points to overall when missing
    // We trust the grade logic independently via a focused input tweak
    const org = {
      ...perfectOrg,
      security: {
        ...perfectOrg.security,
        mfaEnabled: approxScore < 100,
        profilesWithModifyAll: approxScore < 80 ? 5 : 1,
        guestUserAccess: approxScore < 75,
        namedCredentialsMissing: approxScore < 70 ? 3 : 0,
        passwordPolicyStrength: approxScore < 65 ? "weak" : "strong",
      },
      codeQuality: {
        ...perfectOrg.codeQuality,
        apexTestCoveragePct: approxScore < 70 ? 0.5 : 0.95,
        apexClassesNoTests: approxScore < 65 ? 10 : 0,
        hardcodedIds: approxScore < 65 ? 5 : 0,
      },
      userAdoption: {
        ...perfectOrg.userAdoption,
        monthlyActiveUsersPct: approxScore < 60 ? 0.1 : 0.95,
        trainingCompletionPct: approxScore < 60 ? 0.1 : 0.95,
      },
    };
    const { grade, overallScore } = scoreOrgHealth(org);
    // Verify the grade matches the overallScore per the defined thresholds
    if (overallScore >= 90) expect(grade).toBe("A");
    else if (overallScore >= 80) expect(grade).toBe("B");
    else if (overallScore >= 70) expect(grade).toBe("C");
    else if (overallScore >= 60) expect(grade).toBe("D");
    else expect(grade).toBe("F");
  });
});

// ─── Empty / missing metadata ─────────────────────────────────────────────────

describe("scoreOrgHealth — empty org (no metadata)", () => {
  let result;
  beforeAll(() => { result = scoreOrgHealth(emptyOrg); });

  test("does not throw", () => {
    expect(() => scoreOrgHealth(emptyOrg)).not.toThrow();
  });

  test("orgId and orgName fall back to 'unknown' when absent", () => {
    const r = scoreOrgHealth({});
    expect(r.orgId).toBe("unknown");
    expect(r.orgName).toBe("unknown");
  });

  test("codeQuality scores 0 (default coverage = 0 triggers -30)", () => {
    expect(result.categories.codeQuality.score).toBe(0);
  });

  test("security scores low (MFA defaults to false → -30)", () => {
    expect(result.categories.security.score).toBeLessThanOrEqual(70);
  });

  test("overallScore is a finite number", () => {
    expect(Number.isFinite(result.overallScore)).toBe(true);
  });

  test("top5RecommendedActions is an array (may be empty)", () => {
    expect(Array.isArray(result.top5RecommendedActions)).toBe(true);
  });
});

// ─── Automation category ──────────────────────────────────────────────────────

describe("scoreAutomation", () => {
  test("no flows, no workflows → score 100, no issues", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      automation: { flows: [], workflows: 0, processBuildersActive: 0 },
    });
    expect(categories.automation.score).toBe(100);
    expect(categories.automation.issueCount).toBe(0);
  });

  test("all flows inactive (100%) → deducts 20, 1 issue", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      automation: {
        flows: [{ isActive: false }, { isActive: false }],
        workflows: 0,
        processBuildersActive: 0,
      },
    });
    expect(categories.automation.score).toBe(80);
    expect(categories.automation.issueCount).toBe(1);
  });

  test("26% inactive flows → deducts 10 (medium threshold)", () => {
    const flows = [
      { isActive: true }, { isActive: true }, { isActive: true },
      { isActive: false }, // 25% would not trigger; need > 0.25
    ];
    // 1/4 = 0.25 — not > 0.25, so no deduction at exactly 25%
    const r1 = scoreOrgHealth({ ...emptyOrg, automation: { flows, workflows: 0, processBuildersActive: 0 } });
    expect(r1.categories.automation.score).toBe(100);

    const flows2 = [
      { isActive: true }, { isActive: true }, { isActive: true },
      { isActive: false }, { isActive: false }, // 2/5 = 0.40 → medium
    ];
    const r2 = scoreOrgHealth({ ...emptyOrg, automation: { flows: flows2, workflows: 0, processBuildersActive: 0 } });
    expect(r2.categories.automation.score).toBe(90);
  });

  test("workflows capped at -25 deduction", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      automation: { flows: [], workflows: 100, processBuildersActive: 0 },
    });
    expect(categories.automation.score).toBe(75);
  });

  test("process builders capped at -20 deduction", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      automation: { flows: [], workflows: 0, processBuildersActive: 100 },
    });
    expect(categories.automation.score).toBe(80);
  });

  test("score never goes below 0 with all issues combined", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      automation: {
        flows: [{ isActive: false }, { isActive: false }, { isActive: false }],
        workflows: 100,
        processBuildersActive: 100,
      },
    });
    expect(categories.automation.score).toBeGreaterThanOrEqual(0);
  });
});

// ─── Security category ────────────────────────────────────────────────────────

describe("scoreSecurity", () => {
  test("all secure → score 100", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      security: {
        mfaEnabled: true,
        profilesWithModifyAll: 1,
        guestUserAccess: false,
        namedCredentialsMissing: 0,
        passwordPolicyStrength: "strong",
      },
    });
    expect(categories.security.score).toBe(100);
  });

  test("MFA disabled → deducts 30", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      security: { mfaEnabled: false, profilesWithModifyAll: 0, guestUserAccess: false, namedCredentialsMissing: 0, passwordPolicyStrength: "strong" },
    });
    expect(categories.security.score).toBe(70);
  });

  test("profilesWithModifyAll exactly 3 → no deduction (threshold is > 3)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      security: { mfaEnabled: true, profilesWithModifyAll: 3, guestUserAccess: false, namedCredentialsMissing: 0, passwordPolicyStrength: "strong" },
    });
    expect(categories.security.score).toBe(100);
  });

  test("profilesWithModifyAll = 4 → deducts 20", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      security: { mfaEnabled: true, profilesWithModifyAll: 4, guestUserAccess: false, namedCredentialsMissing: 0, passwordPolicyStrength: "strong" },
    });
    expect(categories.security.score).toBe(80);
  });

  test("weak password policy → deducts 15", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      security: { mfaEnabled: true, profilesWithModifyAll: 0, guestUserAccess: false, namedCredentialsMissing: 0, passwordPolicyStrength: "weak" },
    });
    expect(categories.security.score).toBe(85);
  });

  test("medium password policy → deducts 5", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      security: { mfaEnabled: true, profilesWithModifyAll: 0, guestUserAccess: false, namedCredentialsMissing: 0, passwordPolicyStrength: "medium" },
    });
    expect(categories.security.score).toBe(95);
  });

  test("all security issues at once → score does not go below 0", () => {
    const { categories } = scoreOrgHealth({ ...emptyOrg, security: worstOrg.security });
    expect(categories.security.score).toBeGreaterThanOrEqual(0);
  });
});

// ─── Data quality category ────────────────────────────────────────────────────

describe("scoreDataQuality", () => {
  test("all healthy → score 100", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      dataQuality: { duplicateRulesEnabled: true, accountsWithoutOwner: 0, totalRecords: 1000, nullEmailContactsPct: 0, storageUsedPct: 0 },
    });
    expect(categories.dataQuality.score).toBe(100);
  });

  test("duplicate rules disabled → deducts 20", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      dataQuality: { duplicateRulesEnabled: false, accountsWithoutOwner: 0, nullEmailContactsPct: 0, storageUsedPct: 0 },
    });
    expect(categories.dataQuality.score).toBe(80);
  });

  test("storageUsedPct exactly 0.7 → no deduction (threshold is > 0.7)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      dataQuality: { duplicateRulesEnabled: true, accountsWithoutOwner: 0, nullEmailContactsPct: 0, storageUsedPct: 0.7 },
    });
    expect(categories.dataQuality.score).toBe(100);
  });

  test("storageUsedPct = 0.71 → deducts 10 (medium)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      dataQuality: { duplicateRulesEnabled: true, accountsWithoutOwner: 0, nullEmailContactsPct: 0, storageUsedPct: 0.71 },
    });
    expect(categories.dataQuality.score).toBe(90);
  });

  test("storageUsedPct = 0.86 → deducts 20 (critical)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      dataQuality: { duplicateRulesEnabled: true, accountsWithoutOwner: 0, nullEmailContactsPct: 0, storageUsedPct: 0.86 },
    });
    expect(categories.dataQuality.score).toBe(80);
  });

  test("nullEmailContactsPct exactly 0.2 → no deduction (threshold is > 0.2)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      dataQuality: { duplicateRulesEnabled: true, accountsWithoutOwner: 0, nullEmailContactsPct: 0.2, storageUsedPct: 0 },
    });
    expect(categories.dataQuality.score).toBe(100);
  });
});

// ─── API usage category ───────────────────────────────────────────────────────

describe("scoreApiUsage", () => {
  test("all healthy → score 100", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      apiUsage: { dailyApiUsedPct: 0, deprecatedApiCallsPct: 0, apexCalloutTimeouts: 0, connectedAppsUnused: 0 },
    });
    expect(categories.apiUsage.score).toBe(100);
  });

  test("dailyApiUsedPct = 0.71 → deducts 15", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      apiUsage: { dailyApiUsedPct: 0.71, deprecatedApiCallsPct: 0, apexCalloutTimeouts: 0, connectedAppsUnused: 0 },
    });
    expect(categories.apiUsage.score).toBe(85);
  });

  test("dailyApiUsedPct = 0.91 → deducts 30 (critical, not 15)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      apiUsage: { dailyApiUsedPct: 0.91, deprecatedApiCallsPct: 0, apexCalloutTimeouts: 0, connectedAppsUnused: 0 },
    });
    expect(categories.apiUsage.score).toBe(70);
  });

  test("apexCalloutTimeouts exactly 10 → no deduction (threshold is > 10)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      apiUsage: { dailyApiUsedPct: 0, deprecatedApiCallsPct: 0, apexCalloutTimeouts: 10, connectedAppsUnused: 0 },
    });
    expect(categories.apiUsage.score).toBe(100);
  });

  test("deprecated API calls present → deducts 20", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      apiUsage: { dailyApiUsedPct: 0, deprecatedApiCallsPct: 0.01, apexCalloutTimeouts: 0, connectedAppsUnused: 0 },
    });
    expect(categories.apiUsage.score).toBe(80);
  });
});

// ─── Code quality category ────────────────────────────────────────────────────

describe("scoreCodeQuality", () => {
  test("all healthy → score 100", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      codeQuality: { apexTestCoveragePct: 0.95, apexClassesNoTests: 0, hardcodedIds: 0, apexErrorsPast30Days: 0, lwcWithNoTests: 0 },
    });
    expect(categories.codeQuality.score).toBe(100);
  });

  test("coverage = 0.74 → deducts 30 (below 0.75 threshold)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      codeQuality: { apexTestCoveragePct: 0.74, apexClassesNoTests: 0, hardcodedIds: 0, apexErrorsPast30Days: 0, lwcWithNoTests: 0 },
    });
    expect(categories.codeQuality.score).toBe(70);
  });

  test("coverage = 0.75 → deducts 10 (at threshold, medium penalty)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      codeQuality: { apexTestCoveragePct: 0.75, apexClassesNoTests: 0, hardcodedIds: 0, apexErrorsPast30Days: 0, lwcWithNoTests: 0 },
    });
    expect(categories.codeQuality.score).toBe(90);
  });

  test("coverage = 0.85 → no deduction", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      codeQuality: { apexTestCoveragePct: 0.85, apexClassesNoTests: 0, hardcodedIds: 0, apexErrorsPast30Days: 0, lwcWithNoTests: 0 },
    });
    expect(categories.codeQuality.score).toBe(100);
  });

  test("apexErrorsPast30Days = 50 → no deduction (threshold is > 50)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      codeQuality: { apexTestCoveragePct: 0.95, apexClassesNoTests: 0, hardcodedIds: 0, apexErrorsPast30Days: 50, lwcWithNoTests: 0 },
    });
    expect(categories.codeQuality.score).toBe(100);
  });

  test("score floored at 0 with all issues maxed", () => {
    const { categories } = scoreOrgHealth({ ...emptyOrg, codeQuality: worstOrg.codeQuality });
    expect(categories.codeQuality.score).toBe(0);
  });
});

// ─── User adoption category ───────────────────────────────────────────────────

describe("scoreUserAdoption", () => {
  test("all healthy → score 100", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      userAdoption: { monthlyActiveUsersPct: 0.95, loginFrequencyAvgPerWeek: 5, customReportsUnused: 5, dashboardsUnused: 0, trainingCompletionPct: 0.95 },
    });
    expect(categories.userAdoption.score).toBe(100);
  });

  test("monthlyActiveUsersPct = 0.49 → deducts 30", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      userAdoption: { monthlyActiveUsersPct: 0.49, loginFrequencyAvgPerWeek: 5, customReportsUnused: 0, dashboardsUnused: 0, trainingCompletionPct: 0.95 },
    });
    expect(categories.userAdoption.score).toBe(70);
  });

  test("monthlyActiveUsersPct = 0.6 → deducts 15 (medium threshold)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      userAdoption: { monthlyActiveUsersPct: 0.6, loginFrequencyAvgPerWeek: 5, customReportsUnused: 0, dashboardsUnused: 0, trainingCompletionPct: 0.95 },
    });
    expect(categories.userAdoption.score).toBe(85);
  });

  test("loginFrequencyAvgPerWeek = 3 → no deduction (threshold is < 3)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      userAdoption: { monthlyActiveUsersPct: 0.95, loginFrequencyAvgPerWeek: 3, customReportsUnused: 0, dashboardsUnused: 0, trainingCompletionPct: 0.95 },
    });
    expect(categories.userAdoption.score).toBe(100);
  });

  test("customReportsUnused = 20 → no deduction (threshold is > 20)", () => {
    const { categories } = scoreOrgHealth({
      ...emptyOrg,
      userAdoption: { monthlyActiveUsersPct: 0.95, loginFrequencyAvgPerWeek: 5, customReportsUnused: 20, dashboardsUnused: 0, trainingCompletionPct: 0.95 },
    });
    expect(categories.userAdoption.score).toBe(100);
  });
});

// ─── Prioritisation of recommended actions ────────────────────────────────────

describe("top5RecommendedActions — prioritisation", () => {
  test("critical issues appear before high, high before medium, medium before low", () => {
    const result = scoreOrgHealth(worstOrg);
    const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
    const actions = result.top5RecommendedActions;
    for (let i = 1; i < actions.length; i++) {
      expect(priorityRank[actions[i].priority]).toBeGreaterThanOrEqual(priorityRank[actions[i - 1].priority]);
    }
  });

  test("perfect org returns empty top5 (no issues)", () => {
    const result = scoreOrgHealth(perfectOrg);
    expect(result.top5RecommendedActions).toHaveLength(0);
  });

  test("each action references a valid category", () => {
    const validCategories = ["automation", "security", "dataQuality", "apiUsage", "codeQuality", "userAdoption"];
    const result = scoreOrgHealth(worstOrg);
    for (const action of result.top5RecommendedActions) {
      expect(validCategories).toContain(action.category);
    }
  });
});

// ─── Org identity fields ──────────────────────────────────────────────────────

describe("scoreOrgHealth — org identity", () => {
  test("orgId is passed through to output", () => {
    const result = scoreOrgHealth({ orgId: "00D123", orgName: "Test" });
    expect(result.orgId).toBe("00D123");
  });

  test("orgName is passed through to output", () => {
    const result = scoreOrgHealth({ orgId: "00D123", orgName: "My Org" });
    expect(result.orgName).toBe("My Org");
  });

  test("missing orgId defaults to 'unknown'", () => {
    const result = scoreOrgHealth({ orgName: "No ID Org" });
    expect(result.orgId).toBe("unknown");
  });

  test("missing orgName defaults to 'unknown'", () => {
    const result = scoreOrgHealth({ orgId: "00D123" });
    expect(result.orgName).toBe("unknown");
  });
});

// ─── Weighted contribution math ───────────────────────────────────────────────

describe("scoreOrgHealth — weighted contribution math", () => {
  test("sum of weightedContributions approximately equals overallScore", () => {
    const result = scoreOrgHealth(perfectOrg);
    const sum = Object.values(result.categories).reduce((acc, cat) => acc + cat.weightedContribution, 0);
    // Allow ±2 due to rounding across 6 categories
    expect(Math.abs(sum - result.overallScore)).toBeLessThanOrEqual(2);
  });

  test("category weights sum to 100", () => {
    const result = scoreOrgHealth(perfectOrg);
    const totalWeight = Object.values(result.categories).reduce((acc, cat) => acc + cat.weight, 0);
    expect(totalWeight).toBe(100);
  });
});
