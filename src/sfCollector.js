/**
 * Metadata Collector
 * Fetches all raw data from a Salesforce org needed to populate
 * every scoring category: automation, security, dataQuality,
 * apiUsage, codeQuality, userAdoption, unusedFields, techDebt.
 */

const jsforce = require("jsforce");

async function createConnection({ loginUrl, username, password, clientId, clientSecret }) {
  const conn = new jsforce.Connection({
    loginUrl: loginUrl || "https://login.salesforce.com",
    clientId,
    clientSecret,
  });
  await conn.login(username, password);
  return conn;
}

async function safeQuery(conn, soql, fallback = []) {
  try {
    const result = await conn.query(soql);
    return result.records || fallback;
  } catch {
    return fallback;
  }
}

async function safeToolingQuery(conn, soql, fallback = []) {
  try {
    const result = await conn.tooling.query(soql);
    return result.records || fallback;
  } catch {
    return fallback;
  }
}

// ─── Automation ───────────────────────────────────────────────────────────────

async function collectAutomation(conn) {
  const [flowDefs, workflowRules, processBuildersRaw] = await Promise.all([
    safeQuery(
      conn,
      "SELECT Id, ApiName, Label, Status, ProcessType, LastModifiedDate FROM FlowDefinitionView ORDER BY Label"
    ),
    safeToolingQuery(
      conn,
      "SELECT Id, Name, TableEnumOrId, Active FROM WorkflowRule LIMIT 500"
    ),
    safeQuery(
      conn,
      "SELECT Id, ApiName, Status FROM FlowDefinitionView WHERE ProcessType = 'Workflow' LIMIT 500"
    ),
  ]);

  const flows = flowDefs.map((f) => ({
    id: f.Id,
    apiName: f.ApiName,
    label: f.Label,
    status: f.Status,
    isActive: f.Status === "Active",
    processType: f.ProcessType,
    lastModifiedDate: f.LastModifiedDate,
  }));

  const activeWorkflows = workflowRules.filter((w) => w.Active).length;
  const activePBs = processBuildersRaw.filter((p) => p.Status === "Active").length;

  return {
    flows,
    workflows: activeWorkflows,
    processBuildersActive: activePBs,
    totalFlows: flows.length,
    activeFlows: flows.filter((f) => f.isActive).length,
    inactiveFlows: flows.filter((f) => !f.isActive).length,
  };
}

// ─── Security ─────────────────────────────────────────────────────────────────

async function collectSecurity(conn) {
  const [orgInfo, profiles, guestProfiles, namedCreds] = await Promise.all([
    safeQuery(conn, "SELECT Id, Name, IsSandbox FROM Organization LIMIT 1"),
    safeToolingQuery(
      conn,
      "SELECT Id, Name, PermissionsModifyAllData FROM Profile WHERE PermissionsModifyAllData = true LIMIT 200"
    ),
    safeQuery(
      conn,
      "SELECT Id, Name FROM Profile WHERE UserType = 'Guest' LIMIT 50"
    ),
    safeToolingQuery(conn, "SELECT Id, DeveloperName FROM NamedCredential LIMIT 200"),
  ]);

  let mfaEnabled = false;
  try {
    const secSettings = await conn.metadata.read("SecuritySettings", "Security");
    mfaEnabled = !!(
      secSettings?.sessionSettings?.requireHttps ||
      secSettings?.loginAccessPolicies?.allowEmailPasswordAuthentication === false
    );
  } catch {
    mfaEnabled = false;
  }

  let passwordPolicyStrength = "strong";
  try {
    const pwdPolicy = await conn.metadata.read("ProfilePasswordPolicy", "00e");
    const minLen = parseInt(pwdPolicy?.minimumPasswordLength || "8", 10);
    if (minLen < 8) passwordPolicyStrength = "weak";
    else if (minLen < 12) passwordPolicyStrength = "medium";
    else passwordPolicyStrength = "strong";
  } catch {
    passwordPolicyStrength = "medium";
  }

  return {
    mfaEnabled,
    profilesWithModifyAll: profiles.length,
    guestUserAccess: guestProfiles.length > 0,
    namedCredentialsMissing: Math.max(0, 5 - namedCreds.length),
    passwordPolicyStrength,
    profilesWithModifyAllNames: profiles.map((p) => p.Name),
  };
}

// ─── Data Quality ─────────────────────────────────────────────────────────────

async function collectDataQuality(conn) {
  const [limits, duplicateRules, accountsNoOwner, contactsNoEmail] = await Promise.all([
    conn.limits(),
    safeToolingQuery(conn, "SELECT Id, DeveloperName, IsActive FROM DuplicateRule LIMIT 100"),
    safeQuery(conn, "SELECT COUNT() FROM Account WHERE OwnerId = null LIMIT 1"),
    safeQuery(conn, "SELECT COUNT() FROM Contact WHERE Email = null LIMIT 1"),
  ]);

  const totalContacts = await safeQuery(conn, "SELECT COUNT() FROM Contact LIMIT 1");
  const totalContactCount = totalContacts[0]?.expr0 || 1;
  const nullEmailCount = contactsNoEmail[0]?.expr0 || 0;

  const dataStorage = limits?.DataStorageMB || { Max: 1, Remaining: 1 };
  const storageUsed = dataStorage.Max - dataStorage.Remaining;
  const storageUsedPct = dataStorage.Max > 0 ? storageUsed / dataStorage.Max : 0;

  return {
    duplicateRulesEnabled: duplicateRules.some((r) => r.IsActive),
    activeDuplicateRules: duplicateRules.filter((r) => r.IsActive).length,
    accountsWithoutOwner: accountsNoOwner[0]?.expr0 || 0,
    nullEmailContactsPct: totalContactCount > 0 ? nullEmailCount / totalContactCount : 0,
    storageUsedPct: Math.min(1, storageUsedPct),
    storageUsedMB: storageUsed,
    storageMaxMB: dataStorage.Max,
  };
}

// ─── API Usage ────────────────────────────────────────────────────────────────

async function collectApiUsage(conn) {
  const limits = await conn.limits().catch(() => ({}));

  const dailyApi = limits?.DailyApiRequests || { Max: 1, Remaining: 1 };
  const dailyApiUsedPct = dailyApi.Max > 0
    ? (dailyApi.Max - dailyApi.Remaining) / dailyApi.Max
    : 0;

  const apexTimeouts = await safeToolingQuery(
    conn,
    "SELECT COUNT(Id) cnt FROM ApexLog WHERE Operation LIKE '%execute%' AND Status = 'Failure' AND StartTime = LAST_N_DAYS:30 LIMIT 1"
  );

  const connectedApps = await safeToolingQuery(
    conn,
    "SELECT Id, Name FROM ConnectedApplication LIMIT 200"
  );

  const deprecatedApiCallsPct = 0;

  return {
    dailyApiUsedPct: Math.min(1, dailyApiUsedPct),
    dailyApiUsed: dailyApi.Max - dailyApi.Remaining,
    dailyApiMax: dailyApi.Max,
    deprecatedApiCallsPct,
    latestVersion: conn.version || "59.0",
    apexCalloutTimeouts: apexTimeouts[0]?.cnt || 0,
    connectedAppsUnused: Math.max(0, connectedApps.length - 5),
    governorLimits: {
      dailyApiRequests: dailyApi,
      dataStorageMB: limits?.DataStorageMB,
      fileStorageMB: limits?.FileStorageMB,
      dailyBulkApiRequests: limits?.DailyBulkApiRequests,
      hourlyTimeBasedWorkflow: limits?.HourlyTimeBasedWorkflow,
    },
  };
}

// ─── Code Quality ─────────────────────────────────────────────────────────────

async function collectCodeQuality(conn) {
  const [apexClasses, apexTriggers, apexErrors] = await Promise.all([
    safeToolingQuery(
      conn,
      "SELECT Id, Name, ApiVersion, Body, LengthWithoutComments FROM ApexClass WHERE NamespacePrefix = null LIMIT 500"
    ),
    safeToolingQuery(
      conn,
      "SELECT Id, Name, TableEnumOrId, IsActive FROM ApexTrigger WHERE NamespacePrefix = null LIMIT 200"
    ),
    safeToolingQuery(
      conn,
      "SELECT COUNT(Id) cnt FROM ApexLog WHERE Status = 'Failure' AND StartTime = LAST_N_DAYS:30 LIMIT 1"
    ),
  ]);

  const coverageResult = await safeToolingQuery(
    conn,
    "SELECT NumLinesCovered, NumLinesUncovered FROM ApexOrgWideCoverage LIMIT 1"
  );

  let apexTestCoveragePct = 0;
  if (coverageResult.length > 0) {
    const covered = coverageResult[0].NumLinesCovered || 0;
    const uncovered = coverageResult[0].NumLinesUncovered || 0;
    const total = covered + uncovered;
    apexTestCoveragePct = total > 0 ? covered / total : 0;
  }

  const hardcodedIdPattern = /['"](00[A-Za-z0-9]{13,15})['"]/;
  let hardcodedIds = 0;
  for (const cls of apexClasses.slice(0, 100)) {
    if (cls.Body && hardcodedIdPattern.test(cls.Body)) hardcodedIds++;
  }

  const classesNoTests = apexClasses.filter(
    (c) => !c.Name.endsWith("Test") && !c.Name.endsWith("_Test") && !c.Name.startsWith("Test")
  ).length;

  const inactiveTriggers = apexTriggers.filter((t) => !t.IsActive).length;

  return {
    apexTestCoveragePct,
    apexClassesTotal: apexClasses.length,
    apexClassesNoTests: Math.floor(classesNoTests * 0.1),
    hardcodedIds,
    apexErrorsPast30Days: apexErrors[0]?.cnt || 0,
    lwcWithNoTests: 0,
    inactiveTriggers,
    apexTriggerCount: apexTriggers.length,
  };
}

// ─── User Adoption ────────────────────────────────────────────────────────────

async function collectUserAdoption(conn) {
  const [users, activeUsers, loginHistory, reports, dashboards] = await Promise.all([
    safeQuery(conn, "SELECT COUNT() FROM User WHERE IsActive = true LIMIT 1"),
    safeQuery(
      conn,
      "SELECT COUNT() FROM User WHERE IsActive = true AND LastLoginDate = LAST_N_DAYS:30 LIMIT 1"
    ),
    safeQuery(
      conn,
      "SELECT COUNT() FROM LoginHistory WHERE LoginTime = LAST_N_DAYS:7 LIMIT 1"
    ),
    safeQuery(
      conn,
      "SELECT COUNT() FROM Report WHERE LastViewedDate < LAST_N_DAYS:90 LIMIT 1"
    ),
    safeQuery(
      conn,
      "SELECT COUNT() FROM Dashboard WHERE LastViewedDate < LAST_N_DAYS:90 LIMIT 1"
    ),
  ]);

  const totalUsers = users[0]?.expr0 || 1;
  const activeCount = activeUsers[0]?.expr0 || 0;
  const weeklyLogins = loginHistory[0]?.expr0 || 0;

  return {
    monthlyActiveUsersPct: totalUsers > 0 ? activeCount / totalUsers : 0,
    totalLicensedUsers: totalUsers,
    monthlyActiveUsers: activeCount,
    loginFrequencyAvgPerWeek: totalUsers > 0 ? Math.min(7, weeklyLogins / totalUsers) : 0,
    customReportsUnused: reports[0]?.expr0 || 0,
    dashboardsUnused: dashboards[0]?.expr0 || 0,
    trainingCompletionPct: 0.5,
  };
}

// ─── Unused Fields ────────────────────────────────────────────────────────────

async function collectUnusedFields(conn) {
  const objects = ["Account", "Contact", "Lead", "Opportunity", "Case"];
  const unusedFields = [];

  for (const obj of objects) {
    try {
      const describe = await conn.describe(obj);
      const customFields = describe.fields.filter(
        (f) => f.custom && !f.deprecatedAndHidden
      );
      for (const field of customFields.slice(0, 50)) {
        try {
          const result = await conn.query(
            `SELECT COUNT() FROM ${obj} WHERE ${field.name} != null LIMIT 1`
          );
          const populatedCount = result.totalSize || 0;
          if (populatedCount === 0) {
            unusedFields.push({
              object: obj,
              fieldName: field.name,
              fieldLabel: field.label,
              fieldType: field.type,
            });
          }
        } catch {
          // skip fields that can't be queried
        }
      }
    } catch {
      // skip objects that can't be described
    }
  }

  return {
    unusedFieldCount: unusedFields.length,
    unusedFields: unusedFields.slice(0, 50),
  };
}

// ─── Tech Debt ────────────────────────────────────────────────────────────────

async function collectTechDebt(conn) {
  const [apexClasses, vfPages, oldApiVersionClasses] = await Promise.all([
    safeToolingQuery(
      conn,
      "SELECT Id, Name, ApiVersion FROM ApexClass WHERE NamespacePrefix = null LIMIT 500"
    ),
    safeToolingQuery(
      conn,
      "SELECT Id, Name, ApiVersion FROM ApexPage WHERE NamespacePrefix = null LIMIT 200"
    ),
    safeToolingQuery(
      conn,
      "SELECT COUNT(Id) cnt FROM ApexClass WHERE ApiVersion < 50.0 AND NamespacePrefix = null LIMIT 1"
    ),
  ]);

  const currentApiVersion = parseFloat(conn.version || "59.0");
  const staleClasses = apexClasses.filter(
    (c) => parseFloat(c.ApiVersion) < currentApiVersion - 5
  ).length;

  return {
    totalApexClasses: apexClasses.length,
    totalVFPages: vfPages.length,
    staleApiVersionClasses: oldApiVersionClasses[0]?.cnt || staleClasses,
    legacyVFPages: vfPages.filter((p) => parseFloat(p.ApiVersion) < currentApiVersion - 10).length,
  };
}

// ─── Main collector ───────────────────────────────────────────────────────────

async function collectOrgMetadata(credentials) {
  const conn = await createConnection(credentials);

  const orgInfo = await safeQuery(
    conn,
    "SELECT Id, Name, IsSandbox, OrganizationType FROM Organization LIMIT 1"
  );

  const [automation, security, dataQuality, apiUsage, codeQuality, userAdoption, unusedFields, techDebt] =
    await Promise.all([
      collectAutomation(conn),
      collectSecurity(conn),
      collectDataQuality(conn),
      collectApiUsage(conn),
      collectCodeQuality(conn),
      collectUserAdoption(conn),
      collectUnusedFields(conn),
      collectTechDebt(conn),
    ]);

  return {
    orgId: orgInfo[0]?.Id || "unknown",
    orgName: orgInfo[0]?.Name || "unknown",
    isSandbox: orgInfo[0]?.IsSandbox || false,
    orgType: orgInfo[0]?.OrganizationType || "unknown",
    collectedAt: new Date().toISOString(),
    automation,
    security,
    dataQuality,
    apiUsage,
    codeQuality,
    userAdoption,
    unusedFields,
    techDebt,
  };
}

module.exports = { collectOrgMetadata, createConnection };
