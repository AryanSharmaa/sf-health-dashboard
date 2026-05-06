/**
 * Marketing Cloud Health Scoring Engine
 */

const WEIGHTS = {
  emailDeliverability: 30,
  journeyHealth:       25,
  automationHealth:    20,
  senderAuth:          15,
  accountHygiene:      10,
};

// ─── Category scorers ─────────────────────────────────────────────────────────

function scoreEmailDeliverability(es = {}) {
  const issues = [];
  let score = 100;

  const sd = es.sendDefinitions || {};
  if (sd.total === 0) {
    issues.push({ priority: "medium", action: "No email send definitions found — create send definitions for your email sends" });
    score -= 15;
  }

  const sp = es.senderProfiles || {};
  if (sp.inactive > 0) {
    issues.push({ priority: "low", action: `${sp.inactive} inactive sender profile(s) found — review and remove unused profiles` });
    score -= Math.min(10, sp.inactive * 3);
  }
  if (sp.total === 0) {
    issues.push({ priority: "high", action: "No sender profiles configured — set up sender profiles before sending" });
    score -= 20;
  }

  return { score: Math.max(0, score), issues, weight: WEIGHTS.emailDeliverability, issueCount: issues.length };
}

function scoreSenderAuth(es = {}) {
  const issues = [];
  let score = 100;

  const sa = es.senderAuth || {};

  if (sa.totalDomains === 0) {
    issues.push({ priority: "high", action: "No sending domains configured — set up a Private Domain for better deliverability" });
    score -= 30;
  } else if (sa.unauthenticatedDomains > 0) {
    issues.push({
      priority: "high",
      action: `${sa.unauthenticatedDomains} sending domain(s) not authenticated — configure DKIM/SAP for all sending domains`,
    });
    score -= Math.min(35, sa.unauthenticatedDomains * 12);
  }

  if (!sa.hasSendClassification) {
    issues.push({ priority: "medium", action: "No send classifications configured — set up send classifications to manage CAN-SPAM compliance" });
    score -= 20;
  }

  if (sa.authenticatedDomains > 0 && sa.unauthenticatedDomains === 0 && sa.hasSendClassification) {
    score = 100; // Perfect auth setup
  }

  return { score: Math.max(0, score), issues, weight: WEIGHTS.senderAuth, issueCount: issues.length };
}

function scoreJourneyHealth(jb = {}) {
  const issues = [];
  let score = 100;

  if (jb.errored > 0) {
    issues.push({
      priority: "critical",
      action: `${jb.errored} journey(s) in error/system-stopped state — immediately review: ${(jb.erroredNames || []).join(", ")}`,
    });
    score -= Math.min(40, jb.errored * 15);
  }

  if (jb.abandonedDrafts > 0) {
    issues.push({
      priority: "medium",
      action: `${jb.abandonedDrafts} draft journey(s) not modified in 90+ days — clean up or complete abandoned journeys`,
    });
    score -= Math.min(15, jb.abandonedDrafts * 5);
  }

  if (jb.zombieJourneys > 0) {
    issues.push({
      priority: "high",
      action: `${jb.zombieJourneys} active journey(s) with 0 contacts in last 30 days — verify entry sources or deactivate`,
    });
    score -= Math.min(20, jb.zombieJourneys * 8);
  }

  if (jb.missingExitCriteria > 0) {
    issues.push({
      priority: "high",
      action: `${jb.missingExitCriteria} active journey(s) missing exit criteria — contacts may remain stuck indefinitely`,
    });
    score -= Math.min(20, jb.missingExitCriteria * 7);
  }

  if (jb.paused > 0) {
    issues.push({
      priority: "low",
      action: `${jb.paused} journey(s) currently paused — confirm these are intentionally paused: ${(jb.pausedNames || []).slice(0,3).join(", ")}`,
    });
    score -= Math.min(10, jb.paused * 3);
  }

  return { score: Math.max(0, score), issues, weight: WEIGHTS.journeyHealth, issueCount: issues.length };
}

function scoreAutomationHealth(as = {}) {
  const issues = [];
  let score = 100;

  if (as.errored > 0) {
    issues.push({
      priority: "critical",
      action: `${as.errored} automation(s) in error state — immediately fix: ${(as.erroredNames || []).join(", ")}`,
    });
    score -= Math.min(40, as.errored * 15);
  }

  if (as.overdue > 0) {
    issues.push({
      priority: "high",
      action: `${as.overdue} scheduled automation(s) have not run within expected window — check schedule and error logs`,
    });
    score -= Math.min(20, as.overdue * 8);
  }

  if (as.noNotification > 0 && as.total > 0) {
    const pct = Math.round((as.noNotification / as.total) * 100);
    if (pct > 50) {
      issues.push({
        priority: "medium",
        action: `${pct}% of automations have no error notifications configured — enable notifications so failures are caught immediately`,
      });
      score -= 15;
    }
  }

  if (as.longRunning > 0) {
    issues.push({
      priority: "medium",
      action: `${as.longRunning} automation(s) consistently run over 2 hours — review for optimisation or parallelisation`,
    });
    score -= Math.min(10, as.longRunning * 4);
  }

  return { score: Math.max(0, score), issues, weight: WEIGHTS.automationHealth, issueCount: issues.length };
}

function scoreAccountHygiene(de = {}, jb = {}, as = {}) {
  const issues = [];
  let score = 100;

  if (de.noRetention > 0) {
    issues.push({
      priority: "medium",
      action: `${de.noRetention} data extension(s) have no retention policy — configure data retention to manage storage and comply with privacy regulations`,
    });
    score -= Math.min(25, de.noRetention * 3);
  }

  const totalItems = (jb.total || 0) + (as.total || 0) + (de.total || 0);
  if (totalItems === 0) {
    issues.push({ priority: "low", action: "No journeys, automations, or data extensions found — ensure API scopes are correct" });
    score -= 10;
  }

  return { score: Math.max(0, score), issues, weight: WEIGHTS.accountHygiene, issueCount: issues.length };
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

function scoreMcHealth(metadata) {
  const { emailStudio = {}, journeyBuilder = {}, automationStudio = {}, dataExtensions = {} } = metadata;

  const categories = {
    emailDeliverability: scoreEmailDeliverability(emailStudio),
    journeyHealth:       scoreJourneyHealth(journeyBuilder),
    automationHealth:    scoreAutomationHealth(automationStudio),
    senderAuth:          scoreSenderAuth(emailStudio),
    accountHygiene:      scoreAccountHygiene(dataExtensions, journeyBuilder, automationStudio),
  };

  // Weighted overall score
  let overallScore = 0;
  for (const [key, cat] of Object.entries(categories)) {
    overallScore += cat.score * (cat.weight / 100);
  }
  overallScore = Math.round(overallScore);

  const grade =
    overallScore >= 90 ? "A" :
    overallScore >= 80 ? "B" :
    overallScore >= 70 ? "C" :
    overallScore >= 60 ? "D" : "F";

  // Collect all issues sorted by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const allIssues = Object.entries(categories)
    .flatMap(([cat, data]) => data.issues.map(i => ({ ...i, category: cat })))
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

  const topRecommendedActions = allIssues.slice(0, 8);

  const isPartial = metadata.partialModules?.length > 0;

  return {
    overallScore,
    grade,
    categories,
    topRecommendedActions,
    isPartial,
    partialModules: metadata.partialModules || [],
    orgName:      metadata.orgName,
    subdomain:    metadata.subdomain,
    generatedAt:  new Date().toISOString(),
  };
}

module.exports = { scoreMcHealth };
