/**
 * Marketing Cloud Metadata Collector
 * Gathers data across Email Studio, Journey Builder, and Automation Studio.
 */

const https = require("https");
const { getValidToken } = require("./mcOAuth");

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function mcGet(subdomain, path, token) {
  return new Promise((resolve, reject) => {
    const hostname = `${subdomain}.rest.marketingcloudapis.com`;
    const options = {
      hostname,
      path,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: {} }); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function safeGet(subdomain, path, token, fallback = null) {
  try {
    const { status, data } = await mcGet(subdomain, path, token);
    if (status === 200) return data;
    return fallback;
  } catch { return fallback; }
}

// ─── Account info ─────────────────────────────────────────────────────────────

async function collectAccountInfo(subdomain, token) {
  const data = await safeGet(subdomain, "/platform/v1/accounts", token, {});
  const acc  = Array.isArray(data.items) ? data.items[0] : (data.items || data);
  return {
    accountId:   acc?.id           || acc?.ID           || null,
    accountName: acc?.name         || acc?.Name         || subdomain,
    timezone:    acc?.timezone?.name || null,
    locale:      acc?.locale?.locale || null,
  };
}

// ─── Email Studio ─────────────────────────────────────────────────────────────

async function collectEmailStudio(subdomain, token) {
  const [sendDefs, trackedLinks, bounce] = await Promise.all([
    safeGet(subdomain, "/messaging/v1/email/definitions?$pageSize=200", token, { definitions: [] }),
    safeGet(subdomain, "/messaging/v1/email/definitions?$pageSize=50&status=active", token, { definitions: [] }),
    safeGet(subdomain, "/data/v1/async/dataextensions/key:BounceData_DE/rows", token, null),
  ]);

  const definitions = sendDefs?.definitions || sendDefs?.items || [];
  const activeCount = definitions.filter(d => d.status === "active").length;
  const inactiveCount = definitions.filter(d => d.status === "inactive").length;

  // Check sender authentication via send classifications
  const sendClassifications = await safeGet(subdomain, "/email/v1/sendclassification", token, { items: [] });
  const classItems = sendClassifications?.items || sendClassifications?.SendClassification || [];
  const hasSendClassification = classItems.length > 0;

  // SAP / DKIM / SPF — check private domains
  const domains = await safeGet(subdomain, "/platform/v1/domains", token, { items: [] });
  const domainItems = domains?.items || [];
  const authenticatedDomains  = domainItems.filter(d => d.authenticated === true || d.status === "verified");
  const unauthenticatedDomains = domainItems.filter(d => d.authenticated !== true && d.status !== "verified");

  // From addresses (sender profiles)
  const senderProfiles = await safeGet(subdomain, "/email/v1/senderprofile", token, { items: [] });
  const senderItems = senderProfiles?.items || senderProfiles?.SenderProfile || [];
  const activeSenders   = senderItems.filter(s => !s.archived && !s.deleted);
  const inactiveSenders = senderItems.filter(s => s.archived || s.deleted);

  return {
    sendDefinitions: {
      total:    definitions.length,
      active:   activeCount,
      inactive: inactiveCount,
    },
    senderAuth: {
      totalDomains:          domainItems.length,
      authenticatedDomains:  authenticatedDomains.length,
      unauthenticatedDomains: unauthenticatedDomains.length,
      hasSendClassification,
      domainNames: authenticatedDomains.map(d => d.domain || d.name).filter(Boolean).slice(0, 5),
    },
    senderProfiles: {
      total:    senderItems.length,
      active:   activeSenders.length,
      inactive: inactiveSenders.length,
    },
  };
}

// ─── Journey Builder ──────────────────────────────────────────────────────────

async function collectJourneyBuilder(subdomain, token) {
  const data = await safeGet(
    subdomain,
    "/interaction/v1/interactions?$pageSize=200&extras=all",
    token,
    { items: [] }
  );

  const journeys = data?.items || data?.interactions || [];
  const now      = Date.now();
  const days30   = 30 * 24 * 60 * 60 * 1000;
  const days90   = 90 * 24 * 60 * 60 * 1000;

  const active  = journeys.filter(j => j.status === "Running");
  const paused  = journeys.filter(j => j.status === "Paused");
  const errored = journeys.filter(j => j.status === "SystemStopped" || j.status === "Error");
  const draft   = journeys.filter(j => j.status === "Draft");

  // Abandoned drafts (older than 90 days)
  const abandonedDrafts = draft.filter(j => {
    const modified = new Date(j.modifiedDate || j.lastModifiedDate || 0).getTime();
    return modified > 0 && (now - modified) > days90;
  });

  // Zombie journeys — active but stats suggest 0 recent contacts
  const zombieJourneys = active.filter(j => {
    const stats = j.stats || j.statistics;
    if (!stats) return false;
    const lastRun = new Date(j.lastPublishedDate || j.modifiedDate || 0).getTime();
    return stats.currentPopulation === 0 && (now - lastRun) > days30;
  });

  // Journeys missing exit criteria
  const missingExitCriteria = active.filter(j => {
    const exits = j.exits || j.exitCriteria;
    return !exits || (Array.isArray(exits) && exits.length === 0);
  });

  // Re-entry not configured on active journeys
  const noReentryConfig = active.filter(j =>
    j.entryMode === undefined || j.entryMode === null
  );

  // Error journey names for reporting
  const erroredNames = errored.map(j => j.name || j.key).slice(0, 5);
  const pausedNames  = paused.map(j => j.name || j.key).slice(0, 5);

  return {
    total:   journeys.length,
    active:  active.length,
    paused:  paused.length,
    errored: errored.length,
    draft:   draft.length,
    abandonedDrafts:     abandonedDrafts.length,
    zombieJourneys:      zombieJourneys.length,
    missingExitCriteria: missingExitCriteria.length,
    noReentryConfig:     noReentryConfig.length,
    erroredNames,
    pausedNames,
  };
}

// ─── Automation Studio ────────────────────────────────────────────────────────

async function collectAutomationStudio(subdomain, token) {
  const data = await safeGet(
    subdomain,
    "/automation/v1/automations?$pageSize=200",
    token,
    { items: [] }
  );

  const automations = data?.items || data?.automation || [];

  const scheduled  = automations.filter(a => a.automationType === "scheduled" || a.scheduleTypeId === 1);
  const triggered  = automations.filter(a => a.automationType === "triggered"  || a.scheduleTypeId === 2);

  // Status breakdown
  const errored   = automations.filter(a =>
    a.status === 3 || a.statusId === 3 || (a.lastRunStatus || "").toLowerCase().includes("error")
  );
  const running   = automations.filter(a => a.status === 1 || a.statusId === 1);
  const paused    = automations.filter(a => a.status === 2 || a.statusId === 2 || a.isPaused === true);
  const inactive  = automations.filter(a => a.status === 0 || a.statusId === 0);

  // Automations overdue — scheduled ones that haven't run in expected window
  const now = Date.now();
  const overdueAutomations = scheduled.filter(a => {
    const lastRun = new Date(a.lastRunTime || a.lastRunDate || 0).getTime();
    if (!lastRun) return false;
    // Scheduled daily but hasn't run in 2+ days = overdue
    return (now - lastRun) > 2 * 24 * 60 * 60 * 1000;
  });

  // No notification configured — heuristic: check if notificationEnabled field exists
  const noNotification = automations.filter(a =>
    a.notificationEnabled === false || a.notificationEnabled === undefined
  );

  // Long-running: average run time > 2 hours (7200 seconds)
  const longRunning = automations.filter(a => {
    const avg = a.avgRunTime || a.averageRunTime || 0;
    return avg > 7200;
  });

  const erroredNames = errored.map(a => a.name || a.key).slice(0, 5);

  return {
    total:    automations.length,
    scheduled: scheduled.length,
    triggered: triggered.length,
    running:   running.length,
    paused:    paused.length,
    inactive:  inactive.length,
    errored:   errored.length,
    overdue:       overdueAutomations.length,
    noNotification: noNotification.length,
    longRunning:    longRunning.length,
    erroredNames,
  };
}

// ─── Data Extensions hygiene ──────────────────────────────────────────────────

async function collectDataExtensions(subdomain, token) {
  const data = await safeGet(
    subdomain,
    "/data/v1/customobjects?$pageSize=200",
    token,
    { items: [] }
  );

  const des    = data?.items || data?.definitions || [];
  const noRetention = des.filter(d => !d.retentionPeriod && !d.dataRetentionPeriod);
  const sendable    = des.filter(d => d.isSendable === true);

  return {
    total:        des.length,
    sendable:     sendable.length,
    noRetention:  noRetention.length,
  };
}

// ─── Operational Health ───────────────────────────────────────────────────────

async function collectOperationalHealth(subdomain, token) {

  function statusFromCount(count, warnAt, critAt) {
    return count >= critAt ? "critical" : count >= warnAt ? "warning" : "ok";
  }

  // ── API, Data & Automations ──────────────────────────────────────────────────

  // Locked API users (blocked accounts)
  const lockedUsers = await safeGet(subdomain, "/platform/v1/users?$filter=isLocked%20eq%20true&$pageSize=50", token, { items: [] });
  const lockedUserCount = (lockedUsers?.items || []).length;

  // Data Extension row counts — flag DEs over 5M rows as threshold breach
  const deData = await safeGet(subdomain, "/data/v1/customobjects?$pageSize=200", token, { items: [] });
  const des = deData?.items || [];
  const largeDEs = des.filter(d => (d.rowCount || d.rowcount || 0) > 5000000);

  // Automations detail
  const autoData = await safeGet(subdomain, "/automation/v1/automations?$pageSize=200", token, { items: [] });
  const automations = autoData?.items || autoData?.automation || [];
  const now = Date.now();

  const autoErrored  = automations.filter(a => a.status === 3 || a.statusId === 3 || (a.lastRunStatus || "").toLowerCase().includes("error"));
  const autoPaused   = automations.filter(a => a.status === 2 || a.statusId === 2 || a.isPaused === true);
  const autoStopped  = automations.filter(a => a.status === 0 || a.statusId === 0);
  const autoSkipped  = automations.filter(a => (a.lastRunStatus || "").toLowerCase().includes("skipped"));
  const autoLongRun  = automations.filter(a => (a.avgRunTime || a.averageRunTime || 0) > 7200);
  const autoOverdue  = automations.filter(a => {
    const lastRun = new Date(a.lastRunTime || a.lastRunDate || 0).getTime();
    return lastRun > 0 && (now - lastRun) > 2 * 24 * 60 * 60 * 1000;
  });

  // Critical send automations (those with "send" in name and scheduled)
  const criticalSendAutos = automations.filter(a =>
    (a.name || "").toLowerCase().includes("send") &&
    (a.automationType === "scheduled" || a.scheduleTypeId === 1)
  );

  const apiDataAutomations = {
    lockedUsers:        { count: lockedUserCount,      status: statusFromCount(lockedUserCount, 1, 5) },
    largeDEs:           { count: largeDEs.length,      status: statusFromCount(largeDEs.length, 1, 5), names: largeDEs.map(d => d.name).slice(0, 3) },
    autoNotOnSchedule:  { count: autoOverdue.length,   status: statusFromCount(autoOverdue.length, 1, 5) },
    autoLongRunning:    { count: autoLongRun.length,   status: statusFromCount(autoLongRun.length, 1, 3) },
    autoErrored:        { count: autoErrored.length,   status: statusFromCount(autoErrored.length, 1, 5), names: autoErrored.map(a => a.name).slice(0, 3) },
    autoSkipped:        { count: autoSkipped.length,   status: statusFromCount(autoSkipped.length, 1, 5) },
    autoStopped:        { count: autoStopped.length,   status: statusFromCount(autoStopped.length, 3, 10) },
    autoPaused:         { count: autoPaused.length,    status: statusFromCount(autoPaused.length, 3, 10) },
    criticalSendAutos:  { count: criticalSendAutos.length, status: criticalSendAutos.some(a => a.status === 3) ? "critical" : "ok" },
  };

  // ── Email ────────────────────────────────────────────────────────────────────

  // Triggered send definitions — errors and queue age
  const triggeredSends = await safeGet(subdomain, "/messaging/v1/email/definitions?$pageSize=200", token, { definitions: [] });
  const tsDefs = triggeredSends?.definitions || triggeredSends?.items || [];
  const tsErrored = tsDefs.filter(d => d.status === "error" || d.status === "inactive");

  // High priority sends (priority = high)
  const highPrioritySends = tsDefs.filter(d => (d.options?.priority || "").toLowerCase() === "high");

  // Deliverability: check bounce/complaint categories from send summary
  const sendSummary = await safeGet(subdomain, "/data/v1/async/dataextensions/key:ENT.TrackingSendSummary/rows?$pageSize=10", token, null);

  // Send speed — check total definitions vs active (ratio signals backlog)
  const totalDefs  = tsDefs.length;
  const activeDefs = tsDefs.filter(d => d.status === "active").length;
  const sendSpeedStatus = totalDefs > 0 && activeDefs / totalDefs < 0.5 ? "warning" : "ok";

  // Threshold: flag if > 500 active triggered send definitions
  const tsThresholdBreach = activeDefs > 500;

  const email = {
    sendSpeed:          { activeDefs, totalDefs, status: sendSpeedStatus },
    highPrioritySends:  { count: highPrioritySends.length, status: "ok" },
    triggeredErrored:   { count: tsErrored.length,         status: statusFromCount(tsErrored.length, 1, 10), names: tsErrored.map(d => d.name).slice(0, 3) },
    triggeredThreshold: { count: activeDefs,               status: tsThresholdBreach ? "warning" : "ok", threshold: 500 },
    deliverability:     { status: sendSummary ? "ok" : "warning", available: !!sendSummary },
  };

  // ── Mobile ───────────────────────────────────────────────────────────────────

  const mobileDefs = await safeGet(subdomain, "/messaging/v1/push/definitions?$pageSize=200", token, { definitions: [] });
  const mobileSends = mobileDefs?.definitions || mobileDefs?.items || [];
  const mobileErrored = mobileSends.filter(d => d.status === "error" || d.status === "inactive");
  const mobileActive  = mobileSends.filter(d => d.status === "active");
  const mobileThresholdBreach = mobileActive.length > 200;

  const mobile = {
    sendsErrored:   { count: mobileErrored.length, status: statusFromCount(mobileErrored.length, 1, 5), names: mobileErrored.map(d => d.name).slice(0, 3) },
    sendThreshold:  { count: mobileActive.length,  status: mobileThresholdBreach ? "warning" : "ok", threshold: 200 },
    zeroSends:      { count: mobileSends.length === 0 ? 1 : 0, status: mobileSends.length === 0 ? "warning" : "ok" },
  };

  // ── Journey Builder ──────────────────────────────────────────────────────────

  const jbData = await safeGet(subdomain, "/interaction/v1/interactions?$pageSize=200&extras=all", token, { items: [] });
  const journeys = jbData?.items || jbData?.interactions || [];
  const jbActive  = journeys.filter(j => j.status === "Running");
  const jbErrored = journeys.filter(j => j.status === "SystemStopped" || j.status === "Error");

  // JB email sends — check activities for email steps with errors
  const jbEmailErrored = journeys.filter(j =>
    (j.activities || []).some(a => a.type === "EMAILV2" && a.outcomes?.some(o => o.invalid > 0))
  );

  // Zero injection — active journeys with 0 contacts currently in journey
  const zeroInjection = jbActive.filter(j => {
    const pop = j.stats?.currentPopulation ?? j.statistics?.currentPopulation;
    return pop !== undefined && pop === 0;
  });

  // JB threshold: flag if > 100 active journeys
  const jbThresholdBreach = jbActive.length > 100;

  const journeyBuilder = {
    emailErrored:    { count: jbEmailErrored.length, status: statusFromCount(jbEmailErrored.length, 1, 5), names: jbEmailErrored.map(j => j.name).slice(0, 3) },
    sendThreshold:   { count: jbActive.length,       status: jbThresholdBreach ? "warning" : "ok", threshold: 100 },
    zeroInjection:   { count: zeroInjection.length,  status: statusFromCount(zeroInjection.length, 1, 5), names: zeroInjection.map(j => j.name).slice(0, 3) },
    errored:         { count: jbErrored.length,      status: statusFromCount(jbErrored.length, 1, 5) },
  };

  // ── MC Connector ─────────────────────────────────────────────────────────────

  // Synchronized Data Sources status
  const syncSources = await safeGet(subdomain, "/interaction/v1/interactions/status?$pageSize=50", token, null);

  // Check Contact Builder / Data Designer sync status
  const syncData = await safeGet(subdomain, "/contacts/v1/datamodelschema?$pageSize=1", token, null);

  // Tracking extract / data sync freshness — check if tracking DE has recent data
  const trackingData = await safeGet(subdomain, "/data/v1/async/dataextensions/key:ENT.TRACKING_EXTRACT/rows?$pageSize=1", token, null);

  const connector = {
    dataSyncDeferment: { status: syncSources ? "ok" : "warning",  available: !!syncSources },
    syncStalled:       { status: syncData    ? "ok" : "warning",  available: !!syncData },
    trackingStalled:   { status: trackingData ? "ok" : "warning", available: !!trackingData },
  };

  return { apiDataAutomations, email, mobile, journeyBuilder, connector };
}

// ─── Main collector ───────────────────────────────────────────────────────────

async function collectMcMetadata(session) {
  const token     = await getValidToken(session);
  const subdomain = session.subdomain;

  const partialModules = [];

  async function safe(name, fn) {
    try { return await fn(); }
    catch (err) { partialModules.push({ module: name, reason: err.message }); return {}; }
  }

  const [accountInfo, emailStudio, journeyBuilder, automationStudio, dataExtensions, operationalHealth] = await Promise.all([
    safe("Account",              () => collectAccountInfo(subdomain, token)),
    safe("Email Studio",         () => collectEmailStudio(subdomain, token)),
    safe("Journey Builder",      () => collectJourneyBuilder(subdomain, token)),
    safe("Automation Studio",    () => collectAutomationStudio(subdomain, token)),
    safe("Data Extensions",      () => collectDataExtensions(subdomain, token)),
    safe("Operational Health",   () => collectOperationalHealth(subdomain, token)),
  ]);

  return {
    subdomain,
    orgName:         accountInfo.accountName || subdomain,
    accountId:       accountInfo.accountId,
    emailStudio,
    journeyBuilder,
    automationStudio,
    dataExtensions,
    operationalHealth,
    partialModules,
    collectedAt: new Date().toISOString(),
  };
}

module.exports = { collectMcMetadata };
