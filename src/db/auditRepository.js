/**
 * Audit Repository — all DB read/write operations for audits, orgs,
 * category scores, actions, and unused fields.
 */

const { getDb } = require("./db");

// ─── Orgs ─────────────────────────────────────────────────────────────────────

async function upsertOrg({ id, name, isSandbox = false, orgType, loginUrl }) {
  const db = await getDb();
  await db.query(
    `INSERT INTO orgs (id, name, is_sandbox, org_type, login_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name       = excluded.name,
       is_sandbox = excluded.is_sandbox,
       org_type   = excluded.org_type,
       login_url  = excluded.login_url,
       updated_at = excluded.updated_at`,
    [id, name, isSandbox ? 1 : 0, orgType || null, loginUrl || null, new Date().toISOString()]
  );
}

async function listOrgs() {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT o.*,
            COUNT(a.id)          AS total_audits,
            MAX(a.created_at)    AS last_audit_at,
            MAX(a.overall_score) AS best_score,
            (SELECT a2.overall_score FROM audits a2
             WHERE a2.org_id = o.id ORDER BY a2.created_at DESC LIMIT 1) AS latest_score
     FROM orgs o
     LEFT JOIN audits a ON a.org_id = o.id
     GROUP BY o.id
     ORDER BY last_audit_at DESC`
  );
  return rows;
}

async function getOrg(orgId) {
  const db = await getDb();
  const { rows } = await db.query("SELECT * FROM orgs WHERE id = ?", [orgId]);
  return rows[0] || null;
}

// ─── Audits ───────────────────────────────────────────────────────────────────

async function createAudit({ id, orgId, status = "running" }) {
  const db = await getDb();
  await db.query(
    `INSERT INTO audits (id, org_id, overall_score, grade, status) VALUES (?, ?, 0, '?', ?)`,
    [id, orgId, status]
  );
}

async function saveAudit({ id, orgId, overallScore, grade, rawMetadata, rawScore }) {
  const db = await getDb();
  await db.query(
    `INSERT INTO audits (id, org_id, overall_score, grade, status, raw_metadata, raw_score)
     VALUES (?, ?, ?, ?, 'complete', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       overall_score = excluded.overall_score,
       grade         = excluded.grade,
       status        = 'complete',
       raw_metadata  = excluded.raw_metadata,
       raw_score     = excluded.raw_score`,
    [id, orgId, overallScore, grade,
     JSON.stringify(rawMetadata), JSON.stringify(rawScore)]
  );
}

async function markAuditError({ id, error }) {
  const db = await getDb();
  await db.query(
    `UPDATE audits SET status = 'error', error_message = ? WHERE id = ?`,
    [error, id]
  );
}

async function getAudit(auditId) {
  const db = await getDb();
  const { rows } = await db.query("SELECT * FROM audits WHERE id = ?", [auditId]);
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    ...row,
    rawMetadata: row.raw_metadata ? JSON.parse(row.raw_metadata) : null,
    rawScore:    row.raw_score    ? JSON.parse(row.raw_score)    : null,
  };
}

async function listAuditsForOrg(orgId, limit = 20) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT id, org_id, overall_score, grade, status, error_message, created_at
     FROM audits WHERE org_id = ? ORDER BY created_at DESC LIMIT ?`,
    [orgId, limit]
  );
  return rows;
}

// ─── Category scores ──────────────────────────────────────────────────────────

async function saveCategoryScores(auditId, orgId, categories) {
  const db = await getDb();
  for (const [category, data] of Object.entries(categories)) {
    await db.query(
      `INSERT INTO category_scores (audit_id, org_id, category, score, weight, issue_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditId, orgId, category, data.score, data.weight, data.issueCount]
    );
  }
}

// ─── Recommended actions ──────────────────────────────────────────────────────

async function saveRecommendedActions(auditId, orgId, actions) {
  const db = await getDb();
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    await db.query(
      `INSERT INTO recommended_actions (audit_id, org_id, priority, category, action, rank)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditId, orgId, a.priority, a.category, a.action, i]
    );
  }
}

// ─── Unused fields ────────────────────────────────────────────────────────────

async function saveUnusedFields(auditId, orgId, unusedFields = []) {
  const db = await getDb();
  for (const f of unusedFields) {
    await db.query(
      `INSERT INTO unused_fields (audit_id, org_id, object_name, field_name, field_label, field_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [auditId, orgId, f.object, f.fieldName, f.fieldLabel || null, f.fieldType || null]
    );
  }
}

// ─── Convenience: save everything after a completed audit ─────────────────────

async function persistAuditResult({ auditId, metadata, healthScore }) {
  const orgId = metadata.orgId || "unknown";

  await upsertOrg({
    id:       orgId,
    name:     metadata.orgName || "unknown",
    isSandbox: metadata.isSandbox || false,
    orgType:  metadata.orgType,
  });

  await saveAudit({
    id:           auditId,
    orgId,
    overallScore: healthScore.overallScore,
    grade:        healthScore.grade,
    rawMetadata:  metadata,
    rawScore:     healthScore,
  });

  await saveCategoryScores(auditId, orgId, healthScore.categories);
  await saveRecommendedActions(auditId, orgId, healthScore.top5RecommendedActions);
  await saveUnusedFields(auditId, orgId, metadata.unusedFields?.unusedFields || []);
}

// ─── History & trending queries ───────────────────────────────────────────────

async function getScoreTrend(orgId, days = 90) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { rows } = await db.query(
    `SELECT id, overall_score, grade, created_at
     FROM audits
     WHERE org_id = ? AND status = 'complete' AND created_at >= ?
     ORDER BY created_at ASC`,
    [orgId, since]
  );
  return rows;
}

async function getCategoryTrend(orgId, category, days = 90) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { rows } = await db.query(
    `SELECT cs.score, cs.issue_count, cs.created_at
     FROM category_scores cs
     WHERE cs.org_id = ? AND cs.category = ? AND cs.created_at >= ?
     ORDER BY cs.created_at ASC`,
    [orgId, category, since]
  );
  return rows;
}

async function getAllCategoryTrends(orgId, days = 90) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { rows } = await db.query(
    `SELECT cs.category, cs.score, cs.issue_count, cs.created_at, a.overall_score
     FROM category_scores cs
     JOIN audits a ON a.id = cs.audit_id
     WHERE cs.org_id = ? AND cs.created_at >= ? AND a.status = 'complete'
     ORDER BY cs.created_at ASC`,
    [orgId, since]
  );

  // Group by category
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({ score: row.score, issueCount: row.issue_count, createdAt: row.created_at });
  }
  return grouped;
}

async function getScoreDelta(orgId) {
  const db = await getDb();
  // Get the two most recent completed audits
  const { rows } = await db.query(
    `SELECT overall_score, grade, created_at FROM audits
     WHERE org_id = ? AND status = 'complete'
     ORDER BY created_at DESC LIMIT 2`,
    [orgId]
  );
  if (rows.length < 2) return { delta: null, current: rows[0] || null, previous: null };
  return {
    delta:    rows[0].overall_score - rows[1].overall_score,
    current:  rows[0],
    previous: rows[1],
  };
}

async function getTopIssuesByPriority(orgId, limit = 10) {
  const db = await getDb();
  // Most recent audit's actions
  const { rows: latestAudit } = await db.query(
    `SELECT id FROM audits WHERE org_id = ? AND status = 'complete' ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  );
  if (!latestAudit[0]) return [];

  const { rows } = await db.query(
    `SELECT priority, category, action, rank FROM recommended_actions
     WHERE audit_id = ?
     ORDER BY rank ASC LIMIT ?`,
    [latestAudit[0].id, limit]
  );
  return rows;
}

async function getRecurringIssues(orgId, minOccurrences = 3) {
  const db = await getDb();
  // Actions that appear in multiple audits — these are chronic issues
  const { rows } = await db.query(
    `SELECT action, category, priority, COUNT(*) AS occurrences
     FROM recommended_actions
     WHERE org_id = ?
     GROUP BY action, category, priority
     HAVING COUNT(*) >= ?
     ORDER BY occurrences DESC`,
    [orgId, minOccurrences]
  );
  return rows;
}

async function getUnusedFieldsSummary(orgId) {
  const db = await getDb();
  const { rows: latestAudit } = await db.query(
    `SELECT id FROM audits WHERE org_id = ? AND status = 'complete' ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  );
  if (!latestAudit[0]) return [];

  const { rows } = await db.query(
    `SELECT object_name, COUNT(*) AS unused_count
     FROM unused_fields WHERE audit_id = ?
     GROUP BY object_name ORDER BY unused_count DESC`,
    [latestAudit[0].id]
  );
  return rows;
}

async function compareAudits(auditIdA, auditIdB) {
  const db = await getDb();
  const [a, b] = await Promise.all([
    db.query("SELECT * FROM category_scores WHERE audit_id = ?", [auditIdA]),
    db.query("SELECT * FROM category_scores WHERE audit_id = ?", [auditIdB]),
  ]);

  const mapById = (rows) => Object.fromEntries(rows.map((r) => [r.category, r]));
  const scoresA = mapById(a.rows);
  const scoresB = mapById(b.rows);
  const categories = [...new Set([...Object.keys(scoresA), ...Object.keys(scoresB)])];

  return categories.map((cat) => ({
    category: cat,
    scoreA: scoresA[cat]?.score ?? null,
    scoreB: scoresB[cat]?.score ?? null,
    delta: (scoresA[cat]?.score ?? 0) - (scoresB[cat]?.score ?? 0),
  }));
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

async function saveFeedback({ orgId, username, rating, easeOfUse, usefulness, wouldRecommend, comment }) {
  const db = await getDb();
  await db.query(
    `INSERT INTO feedback (org_id, username, rating, ease_of_use, usefulness, would_recommend, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orgId || null, username || null, rating, easeOfUse || null, usefulness || null, wouldRecommend ?? null, comment || null]
  );
}

async function listFeedback(limit = 50) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?`, [limit]
  );
  return rows;
}

async function getFeedbackStats() {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT
       COUNT(*)                        AS total,
       ROUND(AVG(rating), 1)           AS avg_rating,
       ROUND(AVG(ease_of_use), 1)      AS avg_ease,
       ROUND(AVG(usefulness), 1)       AS avg_usefulness,
       SUM(CASE WHEN would_recommend = 1 THEN 1 ELSE 0 END) AS would_recommend_count
     FROM feedback`
  );
  return rows[0] || {};
}

// ─── Support tickets ──────────────────────────────────────────────────────────

async function createTicket({ orgId, username, category, subject, description }) {
  const db = await getDb();
  await db.query(
    `INSERT INTO support_tickets (org_id, username, category, subject, description)
     VALUES (?, ?, ?, ?, ?)`,
    [orgId || null, username || null, category, subject, description]
  );
}

async function listTickets(status = null, limit = 50) {
  const db = await getDb();
  const { rows } = status
    ? await db.query(`SELECT * FROM support_tickets WHERE status = ? ORDER BY created_at DESC LIMIT ?`, [status, limit])
    : await db.query(`SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT ?`, [limit]);
  return rows;
}

async function updateTicketStatus(id, status) {
  const db = await getDb();
  await db.query(
    `UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?`,
    [status, new Date().toISOString(), id]
  );
}

// ─── Shared reports ───────────────────────────────────────────────────────────

async function createShare({ token, auditId, orgId, expiresAt }) {
  const db = await getDb();
  await db.query(
    `INSERT INTO shared_reports (token, audit_id, org_id, expires_at) VALUES (?, ?, ?, ?)`,
    [token, auditId, orgId, expiresAt]
  );
}

async function getShare(token) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT * FROM shared_reports WHERE token = ?`, [token]
  );
  return rows[0] || null;
}

async function listSharesForAudit(auditId) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT token, expires_at, created_at FROM shared_reports WHERE audit_id = ? ORDER BY created_at DESC`,
    [auditId]
  );
  return rows;
}

async function deleteShare(token) {
  const db = await getDb();
  await db.query(`DELETE FROM shared_reports WHERE token = ?`, [token]);
}

// ─── Scheduled audits ─────────────────────────────────────────────────────────

async function createSchedule({ id, orgId, orgName, instanceUrl, accessToken, refreshToken, clientId, clientSecret, loginUrl, email, frequency, dayOfWeek, hour }) {
  const db = await getDb();
  await db.query(
    `INSERT INTO scheduled_audits
       (id, org_id, org_name, instance_url, access_token, refresh_token, client_id, client_secret, login_url, email, frequency, day_of_week, hour)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, orgId, orgName, instanceUrl, accessToken, refreshToken || null, clientId || null, clientSecret || null, loginUrl || null, email, frequency, dayOfWeek, hour]
  );
}

async function getSchedule(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM scheduled_audits WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function listSchedulesForOrg(orgId) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT id, org_name, email, frequency, day_of_week, hour, enabled, last_run_at, last_score, last_grade, created_at
     FROM scheduled_audits WHERE org_id = ? ORDER BY created_at DESC`,
    [orgId]
  );
  return rows;
}

async function listAllEnabledSchedules() {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT * FROM scheduled_audits WHERE enabled = 1 OR enabled = TRUE`
  );
  return rows;
}

async function updateScheduleLastRun({ id, score, grade }) {
  const db = await getDb();
  await db.query(
    `UPDATE scheduled_audits SET last_run_at = ?, last_score = ?, last_grade = ?, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), score, grade, new Date().toISOString(), id]
  );
}

async function updateScheduleEnabled(id, enabled) {
  const db = await getDb();
  await db.query(
    `UPDATE scheduled_audits SET enabled = ?, updated_at = ? WHERE id = ?`,
    [enabled ? 1 : 0, new Date().toISOString(), id]
  );
}

async function deleteSchedule(id) {
  const db = await getDb();
  await db.query(`DELETE FROM scheduled_audits WHERE id = ?`, [id]);
}

// ─── Portfolio data ───────────────────────────────────────────────────────────

async function getPortfolioData() {
  const db   = await getDb();
  const orgs = await listOrgs();

  if (!orgs.length) {
    return { fleetScore: null, totalOrgs: 0, worstOrg: null, attentionOrgs: [], orgs: [] };
  }

  function calcGrade(s) {
    if (s === null || s === undefined) return "?";
    if (s >= 90) return "A";
    if (s >= 80) return "B";
    if (s >= 70) return "C";
    if (s >= 60) return "D";
    return "F";
  }

  // For each org grab the two most recent complete audits (latest + previous score for trend)
  const enriched = await Promise.all(orgs.map(async org => {
    const { rows } = await db.query(
      `SELECT overall_score, created_at FROM audits
       WHERE org_id = ? AND status = 'complete'
       ORDER BY created_at DESC LIMIT 2`,
      [org.id]
    );
    const latest   = rows[0]?.overall_score ?? null;
    const previous = rows[1]?.overall_score ?? null;
    return {
      id:           org.id,
      name:         org.name,
      latestScore:  latest,
      previousScore: previous,
      grade:        calcGrade(latest),
      lastAuditAt:  org.last_audit_at || null,
      isSandbox:    !!org.is_sandbox,
    };
  }));

  const scored = enriched.filter(o => o.latestScore !== null);
  const fleetScore = scored.length
    ? Math.round(scored.reduce((s, o) => s + o.latestScore, 0) / scored.length)
    : null;

  const worstOrg = scored.length
    ? scored.reduce((w, o) => (o.latestScore < w.latestScore ? o : w))
    : null;

  const attentionOrgs = enriched.filter(o => o.grade === "D" || o.grade === "F");

  return { fleetScore, totalOrgs: enriched.length, worstOrg, attentionOrgs, orgs: enriched };
}

// ─── Custom rules ─────────────────────────────────────────────────────────────

async function listCustomRules(userId) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT * FROM custom_rules WHERE user_id = ? ORDER BY created_at ASC`,
    [userId]
  );
  return rows;
}

async function createCustomRule({ id, userId, name, ruleText }) {
  const db  = await getDb();
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO custom_rules (id, user_id, name, rule_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, name, ruleText, now, now]
  );
}

async function updateCustomRule({ id, userId, name, ruleText, enabled }) {
  const db  = await getDb();
  const now = new Date().toISOString();
  await db.query(
    `UPDATE custom_rules SET name = ?, rule_text = ?, enabled = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [name, ruleText, enabled ? 1 : 0, now, id, userId]
  );
}

async function deleteCustomRule(id, userId) {
  const db = await getDb();
  await db.query(`DELETE FROM custom_rules WHERE id = ? AND user_id = ?`, [id, userId]);
}

module.exports = {
  // Orgs
  upsertOrg, listOrgs, getOrg,
  // Audits
  createAudit, saveAudit, markAuditError, getAudit, listAuditsForOrg,
  // Detailed saves
  saveCategoryScores, saveRecommendedActions, saveUnusedFields,
  // All-in-one
  persistAuditResult,
  // Trends & analytics
  getScoreTrend, getCategoryTrend, getAllCategoryTrends,
  getScoreDelta, getTopIssuesByPriority, getRecurringIssues,
  getUnusedFieldsSummary, compareAudits,
  // Feedback
  saveFeedback, listFeedback, getFeedbackStats,
  // Support tickets
  createTicket, listTickets, updateTicketStatus,
  // Shared reports
  createShare, getShare, listSharesForAudit, deleteShare,
  // Scheduled audits
  createSchedule, getSchedule, listSchedulesForOrg, listAllEnabledSchedules,
  updateScheduleLastRun, updateScheduleEnabled, deleteSchedule,
  // Portfolio
  getPortfolioData,
  // Custom rules
  listCustomRules, createCustomRule, updateCustomRule, deleteCustomRule,
};
