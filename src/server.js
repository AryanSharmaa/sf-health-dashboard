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

const crypto  = require("crypto");

const { collectOrgMetadataFromToken, collectOrgMetadata } = require("./sfCollector");
const { scoreOrgHealth }           = require("../sfHealthScore");
const { generateHTML, generateJSON } = require("./reportGenerator");
const repo       = require("./db/auditRepository");
const authRoutes = require("./authRoutes");
const { getSession } = require("./oauth");
const { generateRemediationGuide } = require("./aiAdvisor");
const { fetchToken, createMcSession, getMcSession, deleteMcSession } = require("./mcOAuth");
const { collectMcMetadata } = require("./mcCollector");
const { scoreMcHealth }     = require("./mcHealthScore");
const { startScheduler }    = require("./scheduler");

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

// Landing page at root, app at /app — never cached
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/landing.html"));
});
app.get("/app", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/index.html"));
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

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many AI requests. Please wait a minute." },
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

// ─── Shared report (public, no auth) ─────────────────────────────────────────

app.get("/share/:token", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/share.html"));
});

app.get("/api/share/:token", readLimiter, async (req, res) => {
  const share = await repo.getShare(req.params.token).catch(() => null);
  if (!share) return res.status(404).json({ error: "Report not found or link expired." });
  if (new Date(share.expires_at) < new Date()) {
    return res.status(410).json({ error: "This share link has expired." });
  }
  const audit = await repo.getAudit(share.audit_id).catch(() => null);
  if (!audit) return res.status(404).json({ error: "Audit not found." });
  res.json({ share, report: audit.rawScore, metadata: audit.rawMetadata });
});

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

// ─── AI Remediation Advisor ───────────────────────────────────────────────────

app.post("/api/audit/:jobId/advise", aiLimiter, requireSession, async (req, res) => {
  const { action, category, priority } = req.body || {};
  if (!action || !category || !priority) {
    return res.status(400).json({ error: "action, category, and priority are required." });
  }

  const { accessToken, instanceUrl } = req.sfSession;
  const job        = runningJobs.get(req.params.jobId);
  const report     = job?.report || null;
  const orgName    = report?.orgName || "Unknown";
  const orgProfile = report?.orgProfile || null;

  try {
    const guide = await generateRemediationGuide({ action, category, priority, orgProfile, orgName, instanceUrl, accessToken });
    res.json({ guide });
  } catch (err) {
    if (err.isUnavailable) return res.json({ unavailable: true });
    res.status(500).json({ error: err.message });
  }
});

// ─── Share a report ───────────────────────────────────────────────────────────

app.post("/api/audit/:jobId/share", readLimiter, requireSession, async (req, res) => {
  const job = runningJobs.get(req.params.jobId);
  if (!job?.report) {
    const dbAudit = await repo.getAudit(req.params.jobId).catch(() => null);
    if (!dbAudit) return res.status(404).json({ error: "Audit not found." });
  }

  const existing = await repo.listSharesForAudit(req.params.jobId).catch(() => []);
  if (existing.length > 0 && new Date(existing[0].expires_at) > new Date()) {
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    return res.json({ token: existing[0].token, url: `${appUrl}/share/${existing[0].token}`, expiresAt: existing[0].expires_at });
  }

  const token     = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const orgId     = job?.report?.orgId || req.sfSession.orgId;

  await repo.createShare({ token, auditId: req.params.jobId, orgId, expiresAt });
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  res.json({ token, url: `${appUrl}/share/${token}`, expiresAt });
});

// ─── PDF download ─────────────────────────────────────────────────────────────

app.get("/api/audit/:jobId/report.pdf", readLimiter, (req, res) => {
  const job = runningJobs.get(req.params.jobId);
  if (!job?.html) return res.status(404).json({ error: "Report not ready." });
  // Serve the HTML report with a print stylesheet injected — browser renders it as PDF via window.print
  const printHtml = job.html.replace(
    "</head>",
    `<style>@media screen{body{background:#fff}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
     <script>window.addEventListener('load',()=>window.print())</script></head>`
  );
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Content-Disposition", `inline; filename="sf-health-${req.params.jobId}.html"`);
  res.send(printHtml);
});

// ─── Scheduled audits ─────────────────────────────────────────────────────────

app.post("/api/schedules", readLimiter, requireSession, async (req, res) => {
  const { email, frequency = "weekly", dayOfWeek = 1, hour = 9 } = req.body || {};
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email required." });
  if (!["daily", "weekly", "monthly"].includes(frequency)) return res.status(400).json({ error: "Invalid frequency." });

  const { accessToken, instanceUrl, orgId, orgName, refreshToken, clientId, clientSecret, loginUrl } = req.sfSession;
  const id = uuidv4();

  await repo.createSchedule({
    id, orgId, orgName, instanceUrl, accessToken,
    refreshToken: refreshToken || null,
    clientId:     clientId    || null,
    clientSecret: clientSecret || null,
    loginUrl:     loginUrl    || null,
    email, frequency,
    dayOfWeek: parseInt(dayOfWeek),
    hour:      parseInt(hour),
  });

  res.json({ id, email, frequency, dayOfWeek, hour, enabled: true });
});

app.get("/api/schedules", readLimiter, requireSession, async (req, res) => {
  try {
    const rows = await repo.listSchedulesForOrg(req.sfSession.orgId);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/api/schedules/:id", readLimiter, requireSession, async (req, res) => {
  const { enabled } = req.body || {};
  if (enabled === undefined) return res.status(400).json({ error: "enabled required." });
  const schedule = await repo.getSchedule(req.params.id).catch(() => null);
  if (!schedule || schedule.org_id !== req.sfSession.orgId) return res.status(404).json({ error: "Not found." });
  await repo.updateScheduleEnabled(req.params.id, !!enabled);
  res.json({ ok: true });
});

app.delete("/api/schedules/:id", readLimiter, requireSession, async (req, res) => {
  const schedule = await repo.getSchedule(req.params.id).catch(() => null);
  if (!schedule || schedule.org_id !== req.sfSession.orgId) return res.status(404).json({ error: "Not found." });
  await repo.deleteSchedule(req.params.id);
  res.json({ ok: true });
});

// ─── Feedback ─────────────────────────────────────────────────────────────────

app.post("/api/feedback", readLimiter, async (req, res) => {
  const { rating, easeOfUse, usefulness, wouldRecommend, comment } = req.body || {};
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "rating 1–5 required." });
  const session = getSession(req.cookies?.sf_session);
  try {
    await repo.saveFeedback({
      orgId:          session?.orgId    || null,
      username:       session?.username || null,
      rating, easeOfUse, usefulness, wouldRecommend, comment,
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Support tickets ──────────────────────────────────────────────────────────

app.post("/api/support", readLimiter, async (req, res) => {
  const { category, subject, description } = req.body || {};
  if (!category || !subject || !description) return res.status(400).json({ error: "category, subject, description required." });
  if (subject.length > 200) return res.status(400).json({ error: "Subject too long (max 200 chars)." });
  if (description.length > 2000) return res.status(400).json({ error: "Description too long (max 2000 chars)." });
  const session = getSession(req.cookies?.sf_session);
  try {
    await repo.createTicket({
      orgId:       session?.orgId    || null,
      username:    session?.username || null,
      category, subject, description,
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Admin dashboard ──────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorised." });
  }
  next();
}

app.get("/api/admin/feedback", requireAdmin, async (req, res) => {
  try {
    const [items, stats] = await Promise.all([repo.listFeedback(100), repo.getFeedbackStats()]);
    res.json({ stats, items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/admin/tickets", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || null;
    res.json(await repo.listTickets(status, 100));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/api/admin/tickets/:id", requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!["open","in_progress","resolved"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  try {
    await repo.updateTicketStatus(req.params.id, status);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Gemini probe (debug only) ───────────────────────────────────────────────

app.get("/api/gemini-probe", async (req, res) => {
  const https = require("https");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.json({ ok: false, error: "GEMINI_API_KEY not set in environment." });

  const body = JSON.stringify({
    contents: [{ parts: [{ text: "Say hello in one word." }] }],
    generationConfig: { maxOutputTokens: 10 },
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      };
      const r = https.request(opts, resp => {
        let raw = "";
        resp.on("data", c => raw += c);
        resp.on("end", () => {
          try { resolve({ status: resp.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: resp.statusCode, body: raw.slice(0, 500) }); }
        });
      });
      r.on("error", reject);
      r.write(body);
      r.end();
    });
    const text = result.body?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    res.json({ ok: result.status === 200, status: result.status, text, raw: result.body });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ─── Einstein probe (debug only) ─────────────────────────────────────────────

app.get("/api/einstein-probe", requireSession, async (req, res) => {
  const { accessToken, instanceUrl } = req.sfSession;
  const https = require("https");
  const paths = [
    `/services/data/v62.0/connect/llm/generations`,
    `/services/data/v62.0/einstein/llm/prompt`,
    `/services/data/v62.0/einstein/llm/generate`,
    `/services/data/v62.0/connect/einstein/llm/generations`,
    `/services/data/v62.0/connect/ai/llm/generations`,
  ];

  const results = await Promise.all(paths.map(path =>
    new Promise(resolve => {
      const parsed = new URL(instanceUrl);
      const opts = {
        hostname: parsed.hostname,
        path,
        method:   "POST",
        headers:  { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}`, "Content-Length": 2 },
      };
      const r = https.request(opts, resp => {
        let raw = "";
        resp.on("data", c => raw += c);
        resp.on("end", () => {
          try { resolve({ path, status: resp.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ path, status: resp.statusCode, body: raw.slice(0, 200) }); }
        });
      });
      r.on("error", e => resolve({ path, status: "error", body: e.message }));
      r.write("{}");
      r.end();
    })
  ));

  res.json({ instanceUrl, results });
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

// ─── Marketing Cloud routes ───────────────────────────────────────────────────

const mcJobs = new Map();

function requireMcSession(req, res, next) {
  const session = getMcSession(req.cookies?.mc_session);
  if (!session) return res.status(401).json({ error: "Not connected to Marketing Cloud." });
  req.mcSession = session;
  next();
}

// Connect — exchange credentials for a token and create a session
app.post("/api/mc/connect", auditLimiter, async (req, res) => {
  const { subdomain, clientId, clientSecret, mid, eid } = req.body || {};
  if (!subdomain || !clientId || !clientSecret) {
    return res.status(400).json({ error: "subdomain, clientId, and clientSecret are required." });
  }
  try {
    const data = await fetchToken({ subdomain, clientId, clientSecret, mid, eid });
    const sessionId = createMcSession({
      subdomain, clientId, clientSecret, mid, eid,
      accessToken: data.access_token,
      expiresIn:   data.expires_in,
      accountId:   data.rest_instance_url,
      orgName:     subdomain,
    });
    res.cookie("mc_session", sessionId, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   8 * 60 * 60 * 1000,
    });
    res.json({ connected: true, subdomain, mid: mid || null, eid: eid || null });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Session check
app.get("/api/mc/session", (req, res) => {
  const session = getMcSession(req.cookies?.mc_session);
  if (!session) return res.json({ connected: false });
  res.json({
    connected: true,
    subdomain: session.subdomain,
    orgName:   session.orgName,
    mid:       session.mid  || null,
    eid:       session.eid  || null,
  });
});

// Disconnect
app.post("/api/mc/disconnect", (req, res) => {
  const sid = req.cookies?.mc_session;
  if (sid) deleteMcSession(sid);
  res.clearCookie("mc_session", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
  res.json({ ok: true });
});

// Start MC audit
app.post("/api/mc/audit", auditLimiter, requireMcSession, (req, res) => {
  const jobId = uuidv4();
  mcJobs.set(jobId, { status: "running", startedAt: new Date().toISOString() });

  ;(async () => {
    try {
      const metadata   = await collectMcMetadata(req.mcSession);
      const healthScore = scoreMcHealth(metadata);
      mcJobs.set(jobId, {
        status: "complete",
        startedAt:   mcJobs.get(jobId)?.startedAt,
        completedAt: new Date().toISOString(),
        report: { ...healthScore, metadata },
      });
    } catch (err) {
      mcJobs.set(jobId, {
        status: "error",
        startedAt: mcJobs.get(jobId)?.startedAt,
        error: err.message,
      });
    }
  })();

  res.status(202).json({ jobId, status: "running" });
});

// MC AI remediation guide
app.post("/api/mc/audit/:jobId/advise", aiLimiter, requireMcSession, async (req, res) => {
  const { action, category, priority } = req.body || {};
  if (!action || !category || !priority) {
    return res.status(400).json({ error: "action, category, and priority are required." });
  }
  const job     = mcJobs.get(req.params.jobId);
  const orgName = job?.report?.orgName || req.mcSession.subdomain || "Marketing Cloud";

  try {
    // MC doesn't have Einstein on most orgs — go straight to Anthropic, Einstein not applicable
    const guide = await generateRemediationGuide({ action, category, priority, orgProfile: { label: "Marketing Cloud" }, orgName, instanceUrl: null, accessToken: null });
    res.json({ guide });
  } catch (err) {
    if (err.isUnavailable) return res.json({ unavailable: true });
    res.status(500).json({ error: err.message });
  }
});

// Poll MC job
app.get("/api/mc/audit/:jobId", readLimiter, (req, res) => {
  const job = mcJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.status !== "complete") {
    return res.json({ jobId: req.params.jobId, status: job.status, error: job.error || null });
  }
  res.json({ jobId: req.params.jobId, ...job });
});

// ─── Admin page ───────────────────────────────────────────────────────────────

app.get("/admin", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/admin.html"));
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  // Auth/app routes → app; share routes → share page; else → landing
  if (req.path.startsWith("/auth") || req.path.startsWith("/app")) {
    return res.sendFile(path.join(__dirname, "../public/index.html"));
  }
  if (req.path.startsWith("/share/")) {
    return res.sendFile(path.join(__dirname, "../public/share.html"));
  }
  res.sendFile(path.join(__dirname, "../public/landing.html"));
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
  startScheduler();
});

module.exports = app;
