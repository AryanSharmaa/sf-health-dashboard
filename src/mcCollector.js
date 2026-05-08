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

  const erroredNames  = errored.map(j => j.name || j.key).slice(0, 50);
  const pausedNames   = paused.map(j => j.name || j.key).slice(0, 50);
  const activeNames   = active.map(j => j.name || j.key).slice(0, 50);
  const draftNames    = draft.map(j => j.name || j.key).slice(0, 50);

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
    activeNames,
    draftNames,
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

  const allNames     = automations.map(a => a.name || a.key).filter(Boolean).slice(0, 50);
  const erroredNames = errored.map(a => a.name || a.key).slice(0, 50);
  const runningNames = running.map(a => a.name || a.key).slice(0, 50);
  const pausedNames  = paused.map(a => a.name || a.key).slice(0, 50);
  const inactiveNames = inactive.map(a => a.name || a.key).slice(0, 50);

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
    allNames,
    erroredNames,
    runningNames,
    pausedNames,
    inactiveNames,
  };
}

// ─── Data Extensions hygiene ──────────────────────────────────────────────────

async function collectDataExtensions(subdomain, token) {
  // Try three endpoints in order — different MC configs expose different ones
  // 1. Asset API (most orgs) — lists all DEs as content assets (type 330)
  // 2. /data/v1/customobjects — Contact Builder / synchronized DEs only
  // 3. Empty fallback
  let des = [];

  const assetData = await safeGet(
    subdomain,
    "/asset/v1/content/assets?$filter=assetType.id%20eq%20330&$pageSize=200&$orderBy=id%20DESC",
    token, null
  );
  if (assetData?.items?.length > 0) {
    des = assetData.items.map(a => ({
      name:              a.name,
      customerKey:       a.customerKey || a.name,
      retentionPeriod:   a.dataExtension?.retentionPeriod ?? null,
      dataRetentionPeriod: a.dataExtension?.dataRetentionPeriod ?? null,
      isSendable:        a.dataExtension?.isSendable ?? false,
      rowCount:          a.dataExtension?.rowCount ?? 0,
    }));
  } else {
    // Fallback: Contact Builder / synchronized DEs
    const syncData = await safeGet(
      subdomain,
      "/data/v1/customobjects?$pageSize=200",
      token, { items: [] }
    );
    des = (syncData?.items || []).map(d => ({
      name:              d.name,
      customerKey:       d.customerKey,
      retentionPeriod:   d.retentionPeriod ?? null,
      dataRetentionPeriod: d.dataRetentionPeriod ?? null,
      isSendable:        d.isSendable ?? false,
      rowCount:          d.rowCount ?? 0,
    }));
  }

  const noRetention = des.filter(d => !d.retentionPeriod && !d.dataRetentionPeriod);
  const sendable    = des.filter(d => d.isSendable === true);

  return {
    total:             des.length,
    sendable:          sendable.length,
    noRetention:       noRetention.length,
    allNames:          des.map(d => d.name || d.customerKey).filter(Boolean).slice(0, 50),
    noRetentionNames:  noRetention.map(d => d.name || d.customerKey).filter(Boolean).slice(0, 50),
  };
}

// ─── Operational Health ───────────────────────────────────────────────────────

async function collectOperationalHealth(subdomain, token) {

  function s(count, warnAt, critAt) {
    return count >= critAt ? "critical" : count >= warnAt ? "warning" : "ok";
  }

  async function safeSection(fn) {
    try { return await fn(); } catch { return null; }
  }

  const now = Date.now();

  // ── API, Data & Automations ──────────────────────────────────────────────────
  const apiDataAutomations = await safeSection(async () => {
    const [lockedUsersRes, deData, autoData] = await Promise.all([
      safeGet(subdomain, "/platform/v1/users?$filter=isLocked%20eq%20true&$pageSize=50", token, { items: [] }),
      safeGet(subdomain, "/data/v1/customobjects?$pageSize=200", token, { items: [] }),
      safeGet(subdomain, "/automation/v1/automations?$pageSize=200", token, { items: [] }),
    ]);
    const lockedUserCount = (lockedUsersRes?.items || []).length;
    const des = deData?.items || [];
    const largeDEs = des.filter(d => (d.rowCount || d.rowcount || 0) > 5000000);
    const automations = autoData?.items || autoData?.automation || [];
    const autoErrored = automations.filter(a => a.status === 3 || a.statusId === 3 || (a.lastRunStatus || "").toLowerCase().includes("error"));
    const autoPaused  = automations.filter(a => a.status === 2 || a.statusId === 2 || a.isPaused === true);
    const autoStopped = automations.filter(a => a.status === 0 || a.statusId === 0);
    const autoSkipped = automations.filter(a => (a.lastRunStatus || "").toLowerCase().includes("skipped"));
    const autoLongRun = automations.filter(a => (a.avgRunTime || a.averageRunTime || 0) > 7200);
    const autoOverdue = automations.filter(a => { const lr = new Date(a.lastRunTime || a.lastRunDate || 0).getTime(); return lr > 0 && (now - lr) > 2 * 86400000; });
    const criticalSendAutos = automations.filter(a => (a.name || "").toLowerCase().includes("send") && (a.automationType === "scheduled" || a.scheduleTypeId === 1));
    const n = a => (a.name || a.key || "").trim();
    return {
      lockedUsers:       { count: lockedUserCount,          status: s(lockedUserCount, 1, 5) },
      largeDEs:          { count: largeDEs.length,          status: s(largeDEs.length, 1, 5),   names: largeDEs.map(d => d.name).filter(Boolean).slice(0, 50) },
      autoNotOnSchedule: { count: autoOverdue.length,       status: s(autoOverdue.length, 1, 5), names: autoOverdue.map(n).filter(Boolean).slice(0, 50) },
      autoLongRunning:   { count: autoLongRun.length,       status: s(autoLongRun.length, 1, 3), names: autoLongRun.map(n).filter(Boolean).slice(0, 50) },
      autoErrored:       { count: autoErrored.length,       status: s(autoErrored.length, 1, 5), names: autoErrored.map(n).filter(Boolean).slice(0, 50) },
      autoSkipped:       { count: autoSkipped.length,       status: s(autoSkipped.length, 1, 5), names: autoSkipped.map(n).filter(Boolean).slice(0, 50) },
      autoStopped:       { count: autoStopped.length,       status: s(autoStopped.length, 3, 10), names: autoStopped.map(n).filter(Boolean).slice(0, 50) },
      autoPaused:        { count: autoPaused.length,        status: s(autoPaused.length, 3, 10), names: autoPaused.map(n).filter(Boolean).slice(0, 50) },
      criticalSendAutos: { count: criticalSendAutos.length, status: criticalSendAutos.some(a => a.status === 3) ? "critical" : "ok", names: criticalSendAutos.map(n).filter(Boolean).slice(0, 50) },
    };
  });

  // ── Email ────────────────────────────────────────────────────────────────────
  const email = await safeSection(async () => {
    const [triggeredSends, sendSummary] = await Promise.all([
      safeGet(subdomain, "/messaging/v1/email/definitions?$pageSize=200", token, { definitions: [] }),
      safeGet(subdomain, "/data/v1/async/dataextensions/key:ENT.TrackingSendSummary/rows?$pageSize=10", token, null),
    ]);
    const tsDefs = triggeredSends?.definitions || triggeredSends?.items || [];
    const tsErrored = tsDefs.filter(d => d.status === "error" || d.status === "inactive");
    const highPrioritySends = tsDefs.filter(d => (d.options?.priority || "").toLowerCase() === "high");
    const activeDefs = tsDefs.filter(d => d.status === "active").length;
    const totalDefs  = tsDefs.length;
    return {
      sendSpeed:          { activeDefs, totalDefs, status: totalDefs > 0 && activeDefs / totalDefs < 0.5 ? "warning" : "ok" },
      highPrioritySends:  { count: highPrioritySends.length, status: "ok" },
      triggeredErrored:   { count: tsErrored.length, status: s(tsErrored.length, 1, 10), names: tsErrored.map(d => d.name).filter(Boolean).slice(0, 50) },
      triggeredThreshold: { count: activeDefs, status: activeDefs > 500 ? "warning" : "ok", threshold: 500 },
      deliverability:     { status: sendSummary ? "ok" : "warning", available: !!sendSummary },
    };
  });

  // ── Mobile ───────────────────────────────────────────────────────────────────
  const mobile = await safeSection(async () => {
    const mobileDefs = await safeGet(subdomain, "/messaging/v1/push/definitions?$pageSize=200", token, { definitions: [] });
    const mobileSends = mobileDefs?.definitions || mobileDefs?.items || [];
    const mobileErrored = mobileSends.filter(d => d.status === "error" || d.status === "inactive");
    const mobileActive  = mobileSends.filter(d => d.status === "active");
    return {
      sendsErrored:  { count: mobileErrored.length, status: s(mobileErrored.length, 1, 5), names: mobileErrored.map(d => d.name).filter(Boolean).slice(0, 50) },
      sendThreshold: { count: mobileActive.length,  status: mobileActive.length > 200 ? "warning" : "ok", threshold: 200 },
      zeroSends:     { count: mobileSends.length === 0 ? 1 : 0, status: mobileSends.length === 0 ? "warning" : "ok" },
    };
  });

  // ── Journey Builder ──────────────────────────────────────────────────────────
  const journeyBuilder = await safeSection(async () => {
    const jbData = await safeGet(subdomain, "/interaction/v1/interactions?$pageSize=200&extras=all", token, { items: [] });
    const journeys  = jbData?.items || jbData?.interactions || [];
    const jbActive  = journeys.filter(j => j.status === "Running");
    const jbErrored = journeys.filter(j => j.status === "SystemStopped" || j.status === "Error");
    const jbEmailErrored = journeys.filter(j => (j.activities || []).some(a => a.type === "EMAILV2" && a.outcomes?.some(o => o.invalid > 0)));
    const zeroInjection  = jbActive.filter(j => { const pop = j.stats?.currentPopulation ?? j.statistics?.currentPopulation; return pop !== undefined && pop === 0; });
    return {
      emailErrored:  { count: jbEmailErrored.length, status: s(jbEmailErrored.length, 1, 5), names: jbEmailErrored.map(j => j.name).filter(Boolean).slice(0, 50) },
      sendThreshold: { count: jbActive.length,       status: jbActive.length > 100 ? "warning" : "ok", threshold: 100, names: jbActive.map(j => j.name).filter(Boolean).slice(0, 50) },
      zeroInjection: { count: zeroInjection.length,  status: s(zeroInjection.length, 1, 5), names: zeroInjection.map(j => j.name).filter(Boolean).slice(0, 50) },
      errored:       { count: jbErrored.length,      status: s(jbErrored.length, 1, 5), names: jbErrored.map(j => j.name).filter(Boolean).slice(0, 50) },
    };
  });

  // ── MC Connector ─────────────────────────────────────────────────────────────
  const connector = await safeSection(async () => {
    const [syncSources, syncData, trackingData] = await Promise.all([
      safeGet(subdomain, "/interaction/v1/interactions/status?$pageSize=50", token, null),
      safeGet(subdomain, "/contacts/v1/datamodelschema?$pageSize=1", token, null),
      safeGet(subdomain, "/data/v1/async/dataextensions/key:ENT.TRACKING_EXTRACT/rows?$pageSize=1", token, null),
    ]);
    return {
      dataSyncDeferment: { status: syncSources  ? "ok" : "warning", available: !!syncSources },
      syncStalled:       { status: syncData     ? "ok" : "warning", available: !!syncData },
      trackingStalled:   { status: trackingData ? "ok" : "warning", available: !!trackingData },
    };
  });

  return {
    apiDataAutomations: apiDataAutomations || {},
    email:              email              || {},
    mobile:             mobile             || {},
    journeyBuilder:     journeyBuilder     || {},
    connector:          connector          || {},
  };
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
