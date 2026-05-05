/**
 * Express API server — production-hardened.
 */

require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const compression = require("compression");
const rateLimit  = require("express-rate-limit");
const path       = require("path");
const { v4: uuidv4 } = require("uuid");

const { collectOrgMetadata }       = require("./sfCollector");
const { scoreOrgHealth }           = require("../sfHealthScore");
const { generateHTML, generateJSON } = require("./reportGenerator");
const repo = require("./db/auditRepository");

const app = express();

// ─── Security & perf middleware ───────────────────────────────────────────────

app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],   // inline JS in index.html
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:"],
      connectSrc:  ["'self'"],
    },
  },
}));

app.use(compression());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : true; // allow all in dev

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public"), { maxAge: "1h" }));

// ─── Rate limiting ────────────────────────────────────────────────────────────

// 5 audit starts per IP per 10 minutes — prevent abuse
const auditLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many audit requests from this IP. Please wait 10 minutes." },
});

// 60 read requests per IP per minute
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// In-memory store for in-flight jobs (cleared on restart — that's fine)
const runningJobs = new Map();

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0", timestamp: new Date().toISOString() });
});

// ─── Start audit ──────────────────────────────────────────────────────────────

app.post("/api/audit", auditLimiter, async (req, res) => {
  const { loginUrl, username, password, clientId, clientSecret } = req.body;

  if (!username || typeof username !== "string" || username.length > 254)
    return res.status(400).json({ error: "Invalid username." });
  if (!password || typeof password !== "string" || password.length > 512)
    return res.status(400).json({ error: "Invalid password." });

  const jobId = uuidv4();
  runningJobs.set(jobId, { status: "running", startedAt: new Date().toISOString() });

  // Kick off async — respond immediately with jobId
  ;(async () => {
    try {
      const credentials = {
        loginUrl:     `https://${(loginUrl || "login.salesforce.com").replace(/^https?:\/\//, "")}`,
        username:     username.trim(),
        password,
        clientId:     clientId  || undefined,
        clientSecret: clientSecret || undefined,
      };

      const metadata    = await collectOrgMetadata(credentials);
      const healthScore = scoreOrgHealth(metadata);
      const report      = generateJSON(healthScore, metadata);
      const html        = generateHTML(healthScore, metadata);

      await repo.persistAuditResult({ auditId: jobId, metadata, healthScore });

      runningJobs.set(jobId, {
        status: "complete",
        startedAt:   runningJobs.get(jobId)?.startedAt,
        completedAt: new Date().toISOString(),
        report,
        html,
      });
    } catch (err) {
      await repo.markAuditError({ id: jobId, error: err.message }).catch(() => {});
      runningJobs.set(jobId, {
        status: "error",
        startedAt: runningJobs.get(jobId)?.startedAt,
        error: err.message,
      });
    }
  })();

  res.status(202).json({ jobId, status: "running" });
});

// ─── Poll job status ──────────────────────────────────────────────────────────

app.get("/api/audit/:jobId", readLimiter, async (req, res) => {
  const job = runningJobs.get(req.params.jobId);
  if (job) {
    if (job.status !== "complete") {
      return res.json({ jobId: req.params.jobId, status: job.status, error: job.error || null });
    }
    const { html, ...safeJob } = job;
    return res.json({ jobId: req.params.jobId, ...safeJob });
  }
  const dbAudit = await repo.getAudit(req.params.jobId).catch(() => null);
  if (!dbAudit) return res.status(404).json({ error: "Job not found." });
  return res.json({ jobId: req.params.jobId, status: dbAudit.status, report: dbAudit.rawScore });
});

// ─── Download reports ─────────────────────────────────────────────────────────

app.get("/api/audit/:jobId/report.html", readLimiter, async (req, res) => {
  const job  = runningJobs.get(req.params.jobId);
  const html = job?.html;
  if (!html) return res.status(404).json({ error: "Report not ready." });
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Content-Disposition", `attachment; filename="sf-health-${req.params.jobId}.html"`);
  res.send(html);
});

app.get("/api/audit/:jobId/report.json", readLimiter, async (req, res) => {
  const job = runningJobs.get(req.params.jobId);
  if (job?.status === "complete") {
    res.setHeader("Content-Disposition", `attachment; filename="sf-health-${req.params.jobId}.json"`);
    return res.json(job.report);
  }
  const dbAudit = await repo.getAudit(req.params.jobId).catch(() => null);
  if (!dbAudit) return res.status(404).json({ error: "Report not ready." });
  res.setHeader("Content-Disposition", `attachment; filename="sf-health-${req.params.jobId}.json"`);
  res.json(dbAudit.rawScore);
});

// ─── Score-only (pre-collected metadata) ─────────────────────────────────────

app.post("/api/score", readLimiter, (req, res) => {
  try {
    res.json(scoreOrgHealth(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Orgs ─────────────────────────────────────────────────────────────────────

app.get("/api/orgs", readLimiter, async (_req, res) => {
  try { res.json(await repo.listOrgs()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/orgs/:orgId", readLimiter, async (req, res) => {
  try {
    const org = await repo.getOrg(req.params.orgId);
    if (!org) return res.status(404).json({ error: "Org not found." });
    res.json(org);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Audit history ────────────────────────────────────────────────────────────

app.get("/api/orgs/:orgId/audits", readLimiter, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    res.json(await repo.listAuditsForOrg(req.params.orgId, limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Trends ───────────────────────────────────────────────────────────────────

app.get("/api/orgs/:orgId/trend", readLimiter, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 90, 365);
    const [trend, delta, categoryTrends, recurringIssues, unusedSummary] = await Promise.all([
      repo.getScoreTrend(req.params.orgId, days),
      repo.getScoreDelta(req.params.orgId),
      repo.getAllCategoryTrends(req.params.orgId, days),
      repo.getRecurringIssues(req.params.orgId),
      repo.getUnusedFieldsSummary(req.params.orgId),
    ]);
    res.json({ orgId: req.params.orgId, days, trend, delta, categoryTrends, recurringIssues, unusedSummary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/orgs/:orgId/trend/:category", readLimiter, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 90, 365);
    res.json(await repo.getCategoryTrend(req.params.orgId, req.params.category, days));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/orgs/:orgId/issues", readLimiter, async (req, res) => {
  try {
    const [latest, recurring] = await Promise.all([
      repo.getTopIssuesByPriority(req.params.orgId),
      repo.getRecurringIssues(req.params.orgId),
    ]);
    res.json({ latest, recurring });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Compare audits ───────────────────────────────────────────────────────────

app.get("/api/compare", readLimiter, async (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.status(400).json({ error: "Provide ?a=auditId&b=auditId" });
  try { res.json(await repo.compareAudits(a, b)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error." });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  SF Health Dashboard → http://localhost:${PORT}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || "development"}\n`);
});

module.exports = app;
