/**
 * Express API server — OAuth-first, production-hardened.
 */

require("dotenv").config();
const express     = require("express");
const cors        = require("cors");
const helmet      = require("helmet");
const compression = require("compression");
const rateLimit   = require("express-rate-limit");
const path        = require("path");
const { v4: uuidv4 } = require("uuid");

const { collectOrgMetadataFromToken, collectOrgMetadata } = require("./sfCollector");
const { scoreOrgHealth }           = require("../sfHealthScore");
const { generateHTML, generateJSON } = require("./reportGenerator");
const repo       = require("./db/auditRepository");
const authRoutes = require("./authRoutes");
const { getSession } = require("./oauth");

const app = express();

// ─── Security & perf ──────────────────────────────────────────────────────────

app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'"],
      imgSrc:        ["'self'", "data:"],
      connectSrc:    ["'self'"],
    },
  },
}));

app.use(compression());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : true;

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// Cookie parser (lightweight, no extra dependency)
app.use((req, _res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach(pair => {
    const [k, ...v] = pair.trim().split("=");
    if (k) req.cookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  next();
});

app.use(express.static(path.join(__dirname, "../public"), { maxAge: "1h" }));

// ─── Rate limiting ────────────────────────────────────────────────────────────

const auditLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many audit requests. Please wait 10 minutes." },
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
});

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireSession(req, res, next) {
  const session = getSession(req.cookies?.sf_session);
  if (!session) return res.status(401).json({ error: "Not connected. Please connect your Salesforce org first." });
  req.sfSession = session;
  next();
}

// In-memory job store for in-flight audits
const runningJobs = new Map();

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.use("/auth", authRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "2.0.0", timestamp: new Date().toISOString() });
});

// ─── Start audit (OAuth session) ──────────────────────────────────────────────

app.post("/api/audit", auditLimiter, requireSession, async (req, res) => {
  const jobId  = uuidv4();
  const { accessToken, instanceUrl, orgId, orgName } = req.sfSession;

  runningJobs.set(jobId, { status: "running", startedAt: new Date().toISOString() });

  ;(async () => {
    try {
      const metadata    = await collectOrgMetadataFromToken({ instanceUrl, accessToken });
      const healthScore = scoreOrgHealth(metadata);
      const report      = generateJSON(healthScore, metadata);
      const html        = generateHTML(healthScore, metadata);

      await repo.persistAuditResult({ auditId: jobId, metadata, healthScore });

      runningJobs.set(jobId, {
        status: "complete",
        startedAt:   runningJobs.get(jobId)?.startedAt,
        completedAt: new Date().toISOString(),
        report, html,
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

// ─── Poll job ─────────────────────────────────────────────────────────────────

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

app.get("/api/audit/:jobId/report.html", readLimiter, (req, res) => {
  const job = runningJobs.get(req.params.jobId);
  if (!job?.html) return res.status(404).json({ error: "Report not ready." });
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Content-Disposition", `attachment; filename="sf-health-${req.params.jobId}.html"`);
  res.send(job.html);
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

// ─── Orgs & history ───────────────────────────────────────────────────────────

app.get("/api/orgs", readLimiter, async (_req, res) => {
  try { res.json(await repo.listOrgs()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/orgs/:orgId/audits", readLimiter, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    res.json(await repo.listAuditsForOrg(req.params.orgId, limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

app.get("/api/orgs/:orgId/issues", readLimiter, async (req, res) => {
  try {
    const [latest, recurring] = await Promise.all([
      repo.getTopIssuesByPriority(req.params.orgId),
      repo.getRecurringIssues(req.params.orgId),
    ]);
    res.json({ latest, recurring });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
