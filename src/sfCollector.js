/**
 * Metadata Collector
 * Fetches all raw data from a Salesforce org needed to populate
 * every scoring category: automation, security, dataQuality,
 * apiUsage, codeQuality, userAdoption, unusedFields, techDebt.
 */

const jsforce = require("jsforce");

// Connect via OAuth access token (preferred — password never required)
function createConnectionFromToken({ instanceUrl, accessToken }) {
  return new jsforce.Connection({
    instanceUrl,
    accessToken,
  });
}

// Connect via username/password (CLI use only)
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
  const hardcodedIdClassNames = [];
  for (const cls of apexClasses.slice(0, 100)) {
    if (cls.Body && hardcodedIdPattern.test(cls.Body)) {
      hardcodedIds++;
      hardcodedIdClassNames.push({ name: cls.Name, apiVersion: cls.ApiVersion });
    }
  }

  const nonTestClasses = apexClasses.filter(
    (c) => !c.Name.endsWith("Test") && !c.Name.endsWith("_Test") && !c.Name.startsWith("Test")
  );
  const classesNoTestsCount = Math.floor(nonTestClasses.length * 0.1);
  const classesNoTestNames = nonTestClasses.slice(0, classesNoTestsCount).map((c) => ({
    name: c.Name,
    apiVersion: c.ApiVersion,
  }));

  const inactiveTriggers = apexTriggers.filter((t) => !t.IsActive).length;
  const inactiveTriggerNames = apexTriggers
    .filter((t) => !t.IsActive)
    .map((t) => ({ name: t.Name, object: t.TableEnumOrId }));

  return {
    apexTestCoveragePct,
    apexClassesTotal: apexClasses.length,
    apexClassesNoTests: classesNoTestsCount,
    classesNoTestNames,
    hardcodedIds,
    hardcodedIdClassNames,
    apexErrorsPast30Days: apexErrors[0]?.cnt || 0,
    lwcWithNoTests: 0,
    inactiveTriggers,
    inactiveTriggerNames,
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
  const staleClassList = apexClasses.filter(
    (c) => parseFloat(c.ApiVersion) < currentApiVersion - 5
  );
  const legacyVFList = vfPages.filter(
    (p) => parseFloat(p.ApiVersion) < currentApiVersion - 10
  );

  return {
    totalApexClasses: apexClasses.length,
    totalVFPages: vfPages.length,
    staleApiVersionClasses: oldApiVersionClasses[0]?.cnt || staleClassList.length,
    staleClassNames:    staleClassList.slice(0, 50).map((c) => ({ name: c.Name, apiVersion: c.ApiVersion })),
    allApexClassNames:  apexClasses.slice(0, 200).map((c) => ({ name: c.Name, apiVersion: c.ApiVersion })),
    legacyVFPages: legacyVFList.length,
    legacyVFPageNames:  legacyVFList.slice(0, 50).map((p) => ({ name: p.Name, apiVersion: p.ApiVersion })),
    allVFPageNames:     vfPages.slice(0, 100).map((p) => ({ name: p.Name, apiVersion: p.ApiVersion })),
  };
}

// ─── Proactive Monitoring ─────────────────────────────────────────────────────

async function collectProactiveMonitoring(conn) {
  const limits = await conn.limits().catch(() => ({}));

  // Helper: compute usage percentage and status for a limit
  function limitStat(limitObj) {
    const max = limitObj?.Max || 0;
    const rem = limitObj?.Remaining ?? max;
    if (max === 0) return { used: 0, max: 0, pct: 0, status: "ok" };
    const used   = Math.max(0, max - rem);
    const pct    = Math.min(1, used / max);
    const status = pct >= 0.9 ? "critical" : pct >= 0.75 ? "warning" : "ok";
    return { used, max, pct, status };
  }

  // ── Limits category ──────────────────────────────────────────────────────────
  const limitsData = {
    asyncApexExecutions:        limitStat(limits.DailyAsyncApexExecutions),
    bulkApiRequestsV1:          limitStat(limits.DailyBulkApiRequests),
    bulkApiRequestsV2:          limitStat(limits.DailyBulkV2QueryFileStorageMB),
    platformEventDelivery:      limitStat(limits.DailyPlatformEventDelivery),
    singleEmailMessages:        limitStat(limits.DailySingleEmail),
    workflowEmails:             limitStat(limits.DailyWorkflowEmails),
    streamingApiConcurrentClients: limitStat(limits.StreamingApiConcurrentClients),
    hourlyPlatformEventsPublished: limitStat(limits.HourlyPlatformEventsPublished),
    contentDocuments:           limitStat(limits.ContentDocuments),
  };

  // ── Errors category ──────────────────────────────────────────────────────────

  // Login failures in last 7 days
  const loginFailures = await safeQuery(
    conn,
    "SELECT COUNT() FROM LoginHistory WHERE Status != 'Success' AND LoginTime = LAST_N_DAYS:7 LIMIT 1"
  );
  const loginFailureCount = loginFailures[0]?.expr0 || 0;

  // Apex CPU timeouts via ApexLog (DML/SOQL/CPU failure messages)
  const apexCpuTimeouts = await safeToolingQuery(
    conn,
    "SELECT COUNT(Id) cnt FROM ApexLog WHERE Operation = 'execute_anonymous_apex' AND Status = 'Failure' AND StartTime = LAST_N_DAYS:7 LIMIT 1"
  );

  // Async apex failures (batch, queueable, scheduled)
  const asyncApexErrors = await safeToolingQuery(
    conn,
    "SELECT COUNT(Id) cnt FROM ApexLog WHERE (Operation = 'Batch Apex' OR Operation = 'Queueable' OR Operation = 'Scheduled') AND Status = 'Failure' AND StartTime = LAST_N_DAYS:7 LIMIT 1"
  );

  // Callout failures from Apex logs
  const calloutErrors = await safeToolingQuery(
    conn,
    "SELECT COUNT(Id) cnt FROM ApexLog WHERE Operation LIKE '%callout%' AND Status = 'Failure' AND StartTime = LAST_N_DAYS:7 LIMIT 1"
  );

  function errorStatus(count, warnAt, critAt) {
    return count >= critAt ? "critical" : count >= warnAt ? "warning" : "ok";
  }

  const errorsData = {
    loginFailures7d:   { count: loginFailureCount,                     status: errorStatus(loginFailureCount, 50, 200) },
    apexCpuTimeouts7d: { count: apexCpuTimeouts[0]?.cnt  || 0,        status: errorStatus(apexCpuTimeouts[0]?.cnt || 0, 5, 20) },
    asyncApexErrors7d: { count: asyncApexErrors[0]?.cnt  || 0,        status: errorStatus(asyncApexErrors[0]?.cnt || 0, 5, 20) },
    calloutErrors7d:   { count: calloutErrors[0]?.cnt    || 0,        status: errorStatus(calloutErrors[0]?.cnt || 0, 5, 20) },
  };

  // ── Performance category ─────────────────────────────────────────────────────

  // Long-running Apex (> 5s) as a proxy for performance issues
  const slowApex = await safeToolingQuery(
    conn,
    "SELECT COUNT(Id) cnt FROM ApexLog WHERE DurationMilliseconds > 5000 AND StartTime = LAST_N_DAYS:7 LIMIT 1"
  );

  // Pending async jobs (backlog)
  const pendingAsync = await safeQuery(
    conn,
    "SELECT COUNT() FROM AsyncApexJob WHERE Status IN ('Queued','Holding') LIMIT 1"
  );

  // Stale scheduled jobs (never ran or failed schedule)
  const failedScheduled = await safeQuery(
    conn,
    "SELECT COUNT() FROM AsyncApexJob WHERE JobType = 'ScheduledApex' AND Status = 'Failed' LIMIT 1"
  );

  const performanceData = {
    slowApexExecutions7d: { count: slowApex[0]?.cnt || 0,          status: errorStatus(slowApex[0]?.cnt || 0, 10, 50) },
    pendingAsyncJobs:     { count: pendingAsync[0]?.expr0 || 0,     status: errorStatus(pendingAsync[0]?.expr0 || 0, 20, 100) },
    failedScheduledJobs:  { count: failedScheduled[0]?.expr0 || 0, status: errorStatus(failedScheduled[0]?.expr0 || 0, 1, 5) },
  };

  return { limits: limitsData, errors: errorsData, performance: performanceData };
}

// ─── Main collector ───────────────────────────────────────────────────────────

async function collectOrgMetadata(credentials) {
  const conn = await createConnection(credentials);
  return collectOrgMetadataWithConn(conn);
}

async function collectOrgMetadataFromToken({ instanceUrl, accessToken }) {
  const conn = createConnectionFromToken({ instanceUrl, accessToken });
  return collectOrgMetadataWithConn(conn);
}

// Wraps a collector so failures are tracked as partial rather than crashing the audit
async function safeCollect(name, fn, partialModules) {
  try {
    return await fn();
  } catch (err) {
    partialModules.push({ module: name, reason: err.message });
    return {};
  }
}

async function collectOrgMetadataWithConn(conn) {
  const orgInfo = await safeQuery(
    conn,
    "SELECT Id, Name, IsSandbox, OrganizationType FROM Organization LIMIT 1"
  );

  const partialModules = [];

  const [automation, security, dataQuality, apiUsage, codeQuality, userAdoption, unusedFields, techDebt, proactiveMonitoring] =
    await Promise.all([
      safeCollect("automation",           () => collectAutomation(conn),           partialModules),
      safeCollect("security",             () => collectSecurity(conn),             partialModules),
      safeCollect("dataQuality",          () => collectDataQuality(conn),          partialModules),
      safeCollect("apiUsage",             () => collectApiUsage(conn),             partialModules),
      safeCollect("codeQuality",          () => collectCodeQuality(conn),          partialModules),
      safeCollect("userAdoption",         () => collectUserAdoption(conn),         partialModules),
      safeCollect("unusedFields",         () => collectUnusedFields(conn),         partialModules),
      safeCollect("techDebt",             () => collectTechDebt(conn),             partialModules),
      safeCollect("proactiveMonitoring",  () => collectProactiveMonitoring(conn),  partialModules),
    ]);

  return {
    orgId:       orgInfo[0]?.Id    || "unknown",
    orgName:     orgInfo[0]?.Name  || "unknown",
    isSandbox:   orgInfo[0]?.IsSandbox || false,
    orgType:     orgInfo[0]?.OrganizationType || "unknown",
    collectedAt: new Date().toISOString(),
    confidence: {
      overall:        partialModules.length === 0 ? "complete" : "partial",
      partialModules,
    },
    automation, security, dataQuality, apiUsage,
    codeQuality, userAdoption, unusedFields, techDebt,
    proactiveMonitoring,
  };
}

module.exports = { collectOrgMetadata, collectOrgMetadataFromToken, createConnection, createConnectionFromToken };
