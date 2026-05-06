/**
 * Scheduled audit runner — uses node-cron to fire hourly, checks which
 * schedules are due, runs the audit, persists results, and emails a report.
 *
 * Runs in-process alongside the Express server (started from server.js).
 */

const cron    = require("node-cron");
const crypto  = require("crypto");
const { v4: uuidv4 } = require("uuid");

const repo    = require("./db/auditRepository");
const { collectOrgMetadataFromToken } = require("./sfCollector");
const { scoreOrgHealth }  = require("../sfHealthScore");
const { generateHTML, generateJSON } = require("./reportGenerator");
const { sendAuditReport } = require("./mailer");

const SHARE_TTL_DAYS = 30;

function shouldRunNow(schedule) {
  const now = new Date();
  const utcDay  = now.getUTCDay();   // 0 Sun … 6 Sat
  const utcHour = now.getUTCHours();

  if (schedule.frequency === "daily") {
    return utcHour === schedule.hour;
  }
  if (schedule.frequency === "weekly") {
    return utcDay === schedule.day_of_week && utcHour === schedule.hour;
  }
  if (schedule.frequency === "monthly") {
    // Run on the 1st of each month at the configured hour
    return now.getUTCDate() === 1 && utcHour === schedule.hour;
  }
  return false;
}

function wasAlreadyRunThisHour(schedule) {
  if (!schedule.last_run_at) return false;
  const last = new Date(schedule.last_run_at);
  const now  = new Date();
  return (
    last.getUTCFullYear() === now.getUTCFullYear() &&
    last.getUTCMonth()    === now.getUTCMonth() &&
    last.getUTCDate()     === now.getUTCDate() &&
    last.getUTCHours()    === now.getUTCHours()
  );
}

async function runScheduledAudit(schedule) {
  const jobId = uuidv4();
  console.log(`[scheduler] Running scheduled audit for "${schedule.org_name}" (${schedule.id})`);

  try {
    const metadata    = await collectOrgMetadataFromToken({
      instanceUrl:  schedule.instance_url,
      accessToken:  schedule.access_token,
    });
    const healthScore = scoreOrgHealth(metadata);
    const report      = generateJSON(healthScore, metadata);
    const html        = generateHTML(healthScore, metadata);

    await repo.persistAuditResult({ auditId: jobId, metadata, healthScore });

    // Create a 30-day shareable link
    const token     = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 86400000).toISOString();
    await repo.createShare({ token, auditId: jobId, orgId: metadata.orgId || schedule.org_id, expiresAt });

    // Get score delta
    const delta = await repo.getScoreDelta(metadata.orgId || schedule.org_id);

    await sendAuditReport({
      to:         schedule.email,
      orgName:    schedule.org_name,
      score:      healthScore.overallScore,
      grade:      healthScore.grade,
      shareToken: token,
      topActions: healthScore.top5RecommendedActions || [],
      delta:      delta?.delta ?? null,
    });

    await repo.updateScheduleLastRun({
      id:    schedule.id,
      score: healthScore.overallScore,
      grade: healthScore.grade,
    });

    console.log(`[scheduler] Done "${schedule.org_name}" score=${healthScore.overallScore}`);
  } catch (err) {
    console.error(`[scheduler] Failed for "${schedule.org_name}":`, err.message);
  }
}

async function tick() {
  try {
    const schedules = await repo.listAllEnabledSchedules();
    for (const s of schedules) {
      if (shouldRunNow(s) && !wasAlreadyRunThisHour(s)) {
        runScheduledAudit(s).catch(() => {}); // fire-and-forget per schedule
      }
    }
  } catch (err) {
    console.error("[scheduler] tick error:", err.message);
  }
}

function startScheduler() {
  // Run at minute 0 of every hour
  cron.schedule("0 * * * *", tick);
  console.log("  Scheduler: running (checks every hour)");
}

module.exports = { startScheduler };
