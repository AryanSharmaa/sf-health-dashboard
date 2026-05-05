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
};
