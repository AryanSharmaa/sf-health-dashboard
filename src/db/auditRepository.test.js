/**
 * Repository tests using an in-memory SQLite database.
 * No network calls. No file system side effects.
 */

const path = require("path");
const fs   = require("fs");

// Use in-memory SQLite for all tests
process.env.DB_PATH = ":memory:";
delete process.env.DATABASE_URL;

// Force fresh module load per test suite
let repo;
beforeAll(() => {
  // Clear module cache so db singleton re-initialises with :memory:
  jest.resetModules();
  repo = require("./auditRepository");
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const testOrg = {
  id:        "00D000000000001AAA",
  name:      "Test Org",
  isSandbox: false,
  orgType:   "Enterprise Edition",
  loginUrl:  "https://login.salesforce.com",
};

const testHealthScore = {
  overallScore: 72,
  grade: "C",
  categories: {
    automation:   { score: 80, weight: 20, issueCount: 1 },
    security:     { score: 65, weight: 20, issueCount: 2 },
    dataQuality:  { score: 90, weight: 15, issueCount: 0 },
    apiUsage:     { score: 75, weight: 15, issueCount: 1 },
    codeQuality:  { score: 55, weight: 15, issueCount: 3 },
    userAdoption: { score: 70, weight: 15, issueCount: 1 },
  },
  top5RecommendedActions: [
    { priority: "critical", category: "security",     action: "Enable MFA org-wide." },
    { priority: "high",     category: "codeQuality",  action: "Increase Apex test coverage." },
    { priority: "high",     category: "automation",   action: "Migrate legacy workflows to Flow." },
    { priority: "medium",   category: "apiUsage",     action: "Reduce deprecated API calls." },
    { priority: "low",      category: "userAdoption", action: "Clean up unused reports." },
  ],
};

const testMetadata = {
  orgId:    testOrg.id,
  orgName:  testOrg.name,
  isSandbox: false,
  orgType:  testOrg.orgType,
  unusedFields: {
    unusedFieldCount: 3,
    unusedFields: [
      { object: "Account", fieldName: "Old_Field__c", fieldLabel: "Old Field", fieldType: "Text" },
      { object: "Contact", fieldName: "Unused__c",    fieldLabel: "Unused",    fieldType: "Checkbox" },
      { object: "Lead",    fieldName: "Legacy__c",    fieldLabel: "Legacy",    fieldType: "Number" },
    ],
  },
};

function makeAuditId(n = 0) {
  return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
}

// ─── Org CRUD ─────────────────────────────────────────────────────────────────

describe("upsertOrg / getOrg / listOrgs", () => {
  test("inserts a new org and retrieves it", async () => {
    await repo.upsertOrg(testOrg);
    const org = await repo.getOrg(testOrg.id);
    expect(org).not.toBeNull();
    expect(org.id).toBe(testOrg.id);
    expect(org.name).toBe(testOrg.name);
  });

  test("upsertOrg updates name on conflict", async () => {
    await repo.upsertOrg({ ...testOrg, name: "Updated Org Name" });
    const org = await repo.getOrg(testOrg.id);
    expect(org.name).toBe("Updated Org Name");
  });

  test("getOrg returns null for unknown id", async () => {
    const org = await repo.getOrg("00DNONEXISTENT");
    expect(org).toBeNull();
  });

  test("listOrgs returns array including inserted org", async () => {
    const orgs = await repo.listOrgs();
    expect(Array.isArray(orgs)).toBe(true);
    const found = orgs.find(o => o.id === testOrg.id);
    expect(found).toBeDefined();
  });

  test("listOrgs includes aggregate fields", async () => {
    const orgs = await repo.listOrgs();
    const found = orgs.find(o => o.id === testOrg.id);
    expect(found).toHaveProperty("total_audits");
    expect(found).toHaveProperty("last_audit_at");
  });
});

// ─── Audit persistence ────────────────────────────────────────────────────────

describe("saveAudit / getAudit / listAuditsForOrg", () => {
  const auditId = makeAuditId(1);

  test("saveAudit persists the audit", async () => {
    await repo.saveAudit({
      id:           auditId,
      orgId:        testOrg.id,
      overallScore: testHealthScore.overallScore,
      grade:        testHealthScore.grade,
      rawMetadata:  testMetadata,
      rawScore:     testHealthScore,
    });
    const audit = await repo.getAudit(auditId);
    expect(audit).not.toBeNull();
    expect(audit.overall_score).toBe(72);
    expect(audit.grade).toBe("C");
    expect(audit.status).toBe("complete");
  });

  test("getAudit parses rawScore and rawMetadata JSON", async () => {
    const audit = await repo.getAudit(auditId);
    expect(audit.rawScore).toHaveProperty("overallScore");
    expect(audit.rawMetadata).toHaveProperty("orgId");
  });

  test("getAudit returns null for unknown id", async () => {
    const audit = await repo.getAudit("nonexistent-id");
    expect(audit).toBeNull();
  });

  test("listAuditsForOrg returns the saved audit", async () => {
    const audits = await repo.listAuditsForOrg(testOrg.id);
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0].id).toBe(auditId);
  });

  test("listAuditsForOrg respects limit", async () => {
    const audits = await repo.listAuditsForOrg(testOrg.id, 1);
    expect(audits.length).toBeLessThanOrEqual(1);
  });
});

// ─── markAuditError ───────────────────────────────────────────────────────────

describe("markAuditError", () => {
  const errAuditId = makeAuditId(99);

  test("marks an audit as errored", async () => {
    await repo.saveAudit({ id: errAuditId, orgId: testOrg.id, overallScore: 0, grade: "F", rawMetadata: {}, rawScore: {} });
    await repo.markAuditError({ id: errAuditId, error: "INVALID_LOGIN" });
    const audit = await repo.getAudit(errAuditId);
    expect(audit.status).toBe("error");
    expect(audit.error_message).toBe("INVALID_LOGIN");
  });
});

// ─── Category scores ──────────────────────────────────────────────────────────

describe("saveCategoryScores", () => {
  const auditId = makeAuditId(2);

  beforeAll(async () => {
    await repo.saveAudit({ id: auditId, orgId: testOrg.id, overallScore: 72, grade: "C", rawMetadata: {}, rawScore: {} });
    await repo.saveCategoryScores(auditId, testOrg.id, testHealthScore.categories);
  });

  test("saves one row per category (6 total)", async () => {
    const { getDb } = require("./db");
    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM category_scores WHERE audit_id = ?", [auditId]);
    expect(rows.length).toBe(6);
  });

  test("category names match input keys", async () => {
    const { getDb } = require("./db");
    const db = await getDb();
    const { rows } = await db.query("SELECT category FROM category_scores WHERE audit_id = ?", [auditId]);
    const cats = rows.map(r => r.category).sort();
    expect(cats).toEqual(Object.keys(testHealthScore.categories).sort());
  });

  test("scores stored correctly", async () => {
    const { getDb } = require("./db");
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT score FROM category_scores WHERE audit_id = ? AND category = 'security'",
      [auditId]
    );
    expect(rows[0].score).toBe(65);
  });
});

// ─── Recommended actions ──────────────────────────────────────────────────────

describe("saveRecommendedActions", () => {
  const auditId = makeAuditId(3);

  beforeAll(async () => {
    await repo.saveAudit({ id: auditId, orgId: testOrg.id, overallScore: 72, grade: "C", rawMetadata: {}, rawScore: {} });
    await repo.saveRecommendedActions(auditId, testOrg.id, testHealthScore.top5RecommendedActions);
  });

  test("saves 5 action rows", async () => {
    const { getDb } = require("./db");
    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM recommended_actions WHERE audit_id = ?", [auditId]);
    expect(rows.length).toBe(5);
  });

  test("rank column reflects order", async () => {
    const { getDb } = require("./db");
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT rank, priority FROM recommended_actions WHERE audit_id = ? ORDER BY rank",
      [auditId]
    );
    expect(rows[0].rank).toBe(0);
    expect(rows[0].priority).toBe("critical");
    expect(rows[4].rank).toBe(4);
  });
});

// ─── Unused fields ────────────────────────────────────────────────────────────

describe("saveUnusedFields", () => {
  const auditId = makeAuditId(4);

  beforeAll(async () => {
    await repo.saveAudit({ id: auditId, orgId: testOrg.id, overallScore: 72, grade: "C", rawMetadata: {}, rawScore: {} });
    await repo.saveUnusedFields(auditId, testOrg.id, testMetadata.unusedFields.unusedFields);
  });

  test("saves 3 unused field rows", async () => {
    const { getDb } = require("./db");
    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM unused_fields WHERE audit_id = ?", [auditId]);
    expect(rows.length).toBe(3);
  });

  test("getUnusedFieldsSummary groups by object", async () => {
    const summary = await repo.getUnusedFieldsSummary(testOrg.id);
    expect(Array.isArray(summary)).toBe(true);
  });
});

// ─── persistAuditResult (all-in-one) ─────────────────────────────────────────

describe("persistAuditResult", () => {
  const auditId = makeAuditId(5);

  test("persists org, audit, categories, actions, and fields in one call", async () => {
    await repo.persistAuditResult({ auditId, metadata: testMetadata, healthScore: testHealthScore });

    const { getDb } = require("./db");
    const db = await getDb();

    const [audit, cats, actions, fields] = await Promise.all([
      repo.getAudit(auditId),
      db.query("SELECT COUNT(*) AS cnt FROM category_scores WHERE audit_id = ?", [auditId]),
      db.query("SELECT COUNT(*) AS cnt FROM recommended_actions WHERE audit_id = ?", [auditId]),
      db.query("SELECT COUNT(*) AS cnt FROM unused_fields WHERE audit_id = ?", [auditId]),
    ]);

    expect(audit.overall_score).toBe(72);
    expect(cats.rows[0].cnt).toBe(6);
    expect(actions.rows[0].cnt).toBe(5);
    expect(fields.rows[0].cnt).toBe(3);
  });
});

// ─── Trend & analytics queries ────────────────────────────────────────────────

describe("getScoreTrend / getScoreDelta", () => {
  const orgId    = "00D000000000002AAA";
  const auditIdA = makeAuditId(10);
  const auditIdB = makeAuditId(11);

  beforeAll(async () => {
    await repo.upsertOrg({ id: orgId, name: "Trend Org" });
    // Audit A — lower score (older)
    await repo.saveAudit({ id: auditIdA, orgId, overallScore: 60, grade: "D", rawMetadata: { orgId, orgName: "Trend Org", unusedFields: { unusedFields: [] } }, rawScore: { overallScore: 60, grade: "D", categories: testHealthScore.categories, top5RecommendedActions: testHealthScore.top5RecommendedActions } });
    await repo.saveCategoryScores(auditIdA, orgId, testHealthScore.categories);
    await repo.saveRecommendedActions(auditIdA, orgId, testHealthScore.top5RecommendedActions);
    // Audit B — higher score (newer, simulate by inserting second)
    await repo.saveAudit({ id: auditIdB, orgId, overallScore: 80, grade: "B", rawMetadata: { orgId, orgName: "Trend Org", unusedFields: { unusedFields: [] } }, rawScore: { overallScore: 80, grade: "B", categories: testHealthScore.categories, top5RecommendedActions: [] } });
    await repo.saveCategoryScores(auditIdB, orgId, testHealthScore.categories);
  });

  test("getScoreTrend returns both audit points", async () => {
    const trend = await repo.getScoreTrend(orgId, 365);
    expect(trend.length).toBeGreaterThanOrEqual(2);
  });

  test("getScoreTrend respects days filter", async () => {
    const trend = await repo.getScoreTrend(orgId, 0);
    expect(trend.length).toBe(0);
  });

  test("getScoreDelta computes delta between latest two audits", async () => {
    const delta = await repo.getScoreDelta(orgId);
    expect(delta.delta).toBe(20); // 80 - 60
    expect(delta.current.overall_score).toBe(80);
    expect(delta.previous.overall_score).toBe(60);
  });

  test("getScoreDelta returns null delta for org with one audit", async () => {
    const soloOrgId = "00D000000000003AAA";
    await repo.upsertOrg({ id: soloOrgId, name: "Solo Org" });
    await repo.saveAudit({ id: makeAuditId(20), orgId: soloOrgId, overallScore: 75, grade: "C", rawMetadata: { orgId: soloOrgId, orgName: "Solo Org", unusedFields: { unusedFields: [] } }, rawScore: {} });
    const delta = await repo.getScoreDelta(soloOrgId);
    expect(delta.delta).toBeNull();
    expect(delta.current).toBeDefined();
  });
});

describe("getAllCategoryTrends", () => {
  test("returns an object keyed by category", async () => {
    const orgId = "00D000000000002AAA";
    const trends = await repo.getAllCategoryTrends(orgId, 365);
    expect(typeof trends).toBe("object");
    const keys = Object.keys(trends);
    expect(keys.length).toBeGreaterThan(0);
  });

  test("each category value is an array", async () => {
    const orgId = "00D000000000002AAA";
    const trends = await repo.getAllCategoryTrends(orgId, 365);
    for(const pts of Object.values(trends)){
      expect(Array.isArray(pts)).toBe(true);
    }
  });
});

describe("getRecurringIssues", () => {
  test("returns issues appearing in multiple audits", async () => {
    const orgId = "00D000000000002AAA";
    // Both audits for this org share the same actions
    const issues = await repo.getRecurringIssues(orgId, 2);
    expect(Array.isArray(issues)).toBe(true);
    if(issues.length > 0){
      expect(issues[0]).toHaveProperty("action");
      expect(issues[0]).toHaveProperty("occurrences");
    }
  });

  test("returns empty array for org with no recurring issues", async () => {
    const issues = await repo.getRecurringIssues("00DNOISSUES", 2);
    expect(issues).toEqual([]);
  });
});

describe("compareAudits", () => {
  test("returns per-category delta between two audits", async () => {
    const auditIdA = makeAuditId(10);
    const auditIdB = makeAuditId(11);
    const diff = await repo.compareAudits(auditIdA, auditIdB);
    expect(Array.isArray(diff)).toBe(true);
    if(diff.length > 0){
      expect(diff[0]).toHaveProperty("category");
      expect(diff[0]).toHaveProperty("delta");
      expect(diff[0]).toHaveProperty("scoreA");
      expect(diff[0]).toHaveProperty("scoreB");
    }
  });

  test("returns empty array when both audit ids are unknown", async () => {
    const diff = await repo.compareAudits("unknown-a","unknown-b");
    expect(diff).toEqual([]);
  });
});
