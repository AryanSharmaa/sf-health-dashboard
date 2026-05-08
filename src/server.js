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
const { generateHTML, generateJSON, generateConsultingHTML } = require("./reportGenerator");
const { generateComplianceReport } = require("./complianceReport");
const repo       = require("./db/auditRepository");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const { SESSION_COOKIE: APP_SESSION_COOKIE } = require("./userRoutes");
const { getSession } = require("./oauth");
const { getAppSession } = require("./db/userRepository");
const { generateRemediationGuide, streamOpenRouter } = require("./aiAdvisor");
const { fetchToken, createMcSession, getMcSession, deleteMcSession } = require("./mcOAuth");
const { saveMcOrg, getMcOrgByMid, getMcOrgByEid, listMcOrgs, touchMcOrg } = require("./db/mcRepository");
const { collectMcMetadata } = require("./mcCollector");
const { scoreMcHealth }     = require("./mcHealthScore");
const { startScheduler }    = require("./scheduler");

const app = express();

// ─── Security & perf ──────────────────────────────────────────────────────────

app.set("trust proxy", 1);

// ─── Request ID — every response gets a unique ID for tracing ─────────────────
app.use((req, res, next) => {
  const id = uuidv4();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'"],
      imgSrc:        ["'self'", "data:", "https://login.salesforce.com", "https://test.salesforce.com"],
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
app.get("/login", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/login.html"));
});
app.get("/signup", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/signup.html"));
});
app.get("/mc-setup", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/mc-setup.html"));
});
app.get("/docs", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/docs.html"));
});
app.get("/docs/*", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/docs.html"));
});
app.use(express.static(path.join(__dirname, "../public"), { maxAge: "1h" }));

// ─── Rate limiting ────────────────────────────────────────────────────────────

function rateLimitHandler(msg) {
  return (req, res) => {
    const retryAfter = Math.ceil((res.getHeader("X-RateLimit-Reset") - Date.now()) / 1000) || 60;
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({
      error: msg,
      code: "RATE_LIMITED",
      retryAfterSeconds: retryAfter,
      requestId: req.requestId,
    });
  };
}

const auditLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  handler: rateLimitHandler("Too many audit requests. Please wait 10 minutes before running another audit."),
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  handler: rateLimitHandler("Too many requests. Please slow down."),
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  handler: rateLimitHandler("Too many AI guide requests. Please wait a minute."),
});

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireSession(req, res, next) {
  const session = getSession(req.cookies?.sf_session);
  if (!session) return res.status(401).json({
    error: "Not connected. Please connect your Salesforce org first.",
    code: "SF_SESSION_REQUIRED",
    requestId: req.requestId,
  });
  req.sfSession = session;
  next();
}

// In-memory job store for in-flight audits
const runningJobs = new Map();

// ─── App auth middleware ───────────────────────────────────────────────────────

async function requireAppAuth(req, res, next) {
  const session = await getAppSession(req.cookies?.[APP_SESSION_COOKIE]);
  if (!session) return res.status(401).json({
    error: "Please log in to use this feature.",
    code: "APP_AUTH_REQUIRED",
    loginRequired: true,
    requestId: req.requestId,
  });
  req.appUser = { id: session.user_id, email: session.email, name: session.name };
  next();
}

// Attaches req.appUser if logged in, but never rejects — MC routes use this
// so they work for both authenticated users and guests without an SF session.
async function optionalAppAuth(req, res, next) {
  try {
    const session = await getAppSession(req.cookies?.[APP_SESSION_COOKIE]);
    if (session) req.appUser = { id: session.user_id, email: session.email, name: session.name };
  } catch { /* ignore */ }
  next();
}

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.use("/auth", authRoutes);
app.use("/user", userRoutes);

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

// ─── Health & status ──────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "2.0.0", timestamp: new Date().toISOString() });
});

app.get("/api/status", async (_req, res) => {
  const start = Date.now();
  let dbStatus = "ok";
  try {
    const db = await require("./db/db").getDb();
    await db.query("SELECT 1");
  } catch {
    dbStatus = "degraded";
  }
  res.json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    services: {
      database: dbStatus,
      ai: process.env.OPENROUTER_API_KEY ? "configured" : "not_configured",
    },
    latencyMs: Date.now() - start,
  });
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

  res.status(202).json({ jobId, status: "running", requestId: req.requestId });
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

// ─── AI Remediation Advisor — streaming ──────────────────────────────────────

async function handleAdviseStream(res, { action, category, priority, orgProfile, orgName, instanceUrl, accessToken }) {
  const profile = orgProfile?.label || "Standard";
  const prompt  =
    `Org: "${orgName}" (${profile})\n` +
    `Issue priority: ${priority}\n` +
    `Category: ${category}\n` +
    `Finding: ${action}\n\n` +
    `Generate the remediation guide now.`;

  // Try streaming first — fast path
  const streamed = await streamOpenRouter(prompt, res);
  if (streamed) return;

  // Streaming failed — fall back to non-streaming wrapped as SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const guide = await generateRemediationGuide({ action, category, priority, orgProfile, orgName, instanceUrl, accessToken });
    res.write(`data: ${JSON.stringify({ token: guide })}\n\n`);
    res.write("data: [DONE]\n\n");
  } catch (err) {
    if (err.isUnavailable) res.write(`data: ${JSON.stringify({ unavailable: true })}\n\n`);
    else res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
}

app.get("/api/audit/:jobId/advise/stream", aiLimiter, requireSession, async (req, res) => {
  const { action, category, priority } = req.query;
  if (!action || !category || !priority) return res.status(400).json({ error: "action, category, and priority are required." });
  const { accessToken, instanceUrl } = req.sfSession;
  const job      = runningJobs.get(req.params.jobId);
  const report   = job?.report || null;
  await handleAdviseStream(res, {
    action, category, priority,
    orgProfile: report?.orgProfile || null,
    orgName:    report?.orgName    || "Unknown",
    instanceUrl, accessToken,
  });
});

// MC — no requireMcSession so server restarts don't block the AI call
app.get("/api/mc/audit/:jobId/advise/stream", aiLimiter, async (req, res) => {
  const { action, category, priority } = req.query;
  if (!action || !category || !priority) return res.status(400).json({ error: "action, category, and priority are required." });
  const mcSession = getMcSession(req.cookies?.mc_session);
  const job       = mcJobs.get(req.params.jobId);
  const orgName   = job?.report?.orgName || mcSession?.subdomain || "Marketing Cloud";
  await handleAdviseStream(res, {
    action, category, priority,
    orgProfile:  { label: "Marketing Cloud" },
    orgName,
    instanceUrl: null,
    accessToken: null,
  });
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

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const db = await require("./db/db").getDb();
    const { rows: users } = await db.query(
      `SELECT id, email, name, created_at FROM users ORDER BY created_at DESC`
    );
    const { rows: counts } = await db.query(
      `SELECT COUNT(*) as total FROM users`
    );
    res.json({ total: counts[0]?.total || 0, users });
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

// ─── OpenRouter probe (debug only) ───────────────────────────────────────────

app.get("/api/openrouter-probe", async (req, res) => {
  const https  = require("https");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.json({ ok: false, error: "OPENROUTER_API_KEY not set." });

  const body = JSON.stringify({
    model: "openrouter/free",
    messages: [{ role: "user", content: "Say hello in one word." }],
    max_tokens: 10,
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname: "openrouter.ai",
        path: "/api/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.APP_URL || "https://sf-health-dashboard.onrender.com",
          "X-Title": "SF Health Dashboard",
          "Content-Length": Buffer.byteLength(body),
        },
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
    const text = result.body?.choices?.[0]?.message?.content || null;
    res.json({ ok: result.status === 200, status: result.status, text, error: result.body?.error?.message || null });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ─── Groq probe (debug only) ─────────────────────────────────────────────────

app.get("/api/groq-probe", async (req, res) => {
  const https  = require("https");
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.json({ ok: false, error: "GROQ_API_KEY not set in environment." });

  const body = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: "Say hello in one word." }],
    max_tokens: 10,
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname: "api.groq.com",
        path: "/openai/v1/chat/completions",
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`, "Content-Length": Buffer.byteLength(body) },
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
    const text = result.body?.choices?.[0]?.message?.content || null;
    res.json({ ok: result.status === 200, status: result.status, text, error: result.body?.error?.message || null });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
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

// ─── Orgs & history (session-scoped — only your own org) ─────────────────────

// Returns only the single org the current SF session belongs to
app.get("/api/orgs", readLimiter, requireSession, async (req, res) => {
  try {
    const orgId = req.sfSession.orgId;
    const db    = await require("./db/db").getDb();
    const { rows } = await db.query(
      `SELECT o.*,
              COUNT(a.id)          AS total_audits,
              MAX(a.created_at)    AS last_audit_at,
              (SELECT a2.overall_score FROM audits a2
               WHERE a2.org_id = o.id ORDER BY a2.created_at DESC LIMIT 1) AS latest_score
       FROM orgs o
       LEFT JOIN audits a ON a.org_id = o.id
       WHERE o.id = ?
       GROUP BY o.id`,
      [orgId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function guardOrgAccess(req, res, next) {
  if (req.sfSession.orgId !== req.params.orgId) {
    return res.status(403).json({ error: "Access denied — this org belongs to a different session." });
  }
  next();
}

app.get("/api/orgs/:orgId/audits", readLimiter, requireSession, guardOrgAccess, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    res.json(await repo.listAuditsForOrg(req.params.orgId, limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/orgs/:orgId/trend", readLimiter, requireSession, guardOrgAccess, async (req, res) => {
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

app.get("/api/orgs/:orgId/issues", readLimiter, requireSession, guardOrgAccess, async (req, res) => {
  try {
    const [latest, recurring] = await Promise.all([
      repo.getTopIssuesByPriority(req.params.orgId),
      repo.getRecurringIssues(req.params.orgId),
    ]);
    res.json({ latest, recurring });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/compare", readLimiter, requireSession, async (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.status(400).json({ error: "Provide ?a=auditId&b=auditId" });
  try { res.json(await repo.compareAudits(a, b)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Dismissed findings ───────────────────────────────────────────────────────

app.get("/api/orgs/:orgId/dismissed", readLimiter, requireSession, guardOrgAccess, async (req, res) => {
  try {
    const db = await require("./db/db").getDb();
    const { rows } = await db.query(
      "SELECT * FROM dismissed_findings WHERE org_id = ? ORDER BY dismissed_at DESC",
      [req.params.orgId]
    );
    res.json({ dismissed: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/orgs/:orgId/dismissed", readLimiter, requireSession, guardOrgAccess, async (req, res) => {
  const { finding_key, category, action_text, reason } = req.body || {};
  if (!finding_key || !category || !action_text)
    return res.status(400).json({ error: "finding_key, category, action_text required" });
  try {
    const db = await require("./db/db").getDb();
    await db.query(
      "INSERT INTO dismissed_findings (org_id, finding_key, category, action_text, reason) VALUES (?,?,?,?,?)",
      [req.params.orgId, finding_key, category, action_text, reason || null]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/orgs/:orgId/dismissed/:key", readLimiter, requireSession, guardOrgAccess, async (req, res) => {
  try {
    const db = await require("./db/db").getDb();
    await db.query(
      "DELETE FROM dismissed_findings WHERE org_id = ? AND finding_key = ?",
      [req.params.orgId, req.params.key]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Marketing Cloud routes ───────────────────────────────────────────────────

const mcJobs = new Map();

function requireMcSession(req, res, next) {
  const session = getMcSession(req.cookies?.mc_session);
  if (!session) return res.status(401).json({ error: "Not connected to Marketing Cloud." });
  req.mcSession = session;
  next();
}

// List saved MC orgs (no secrets) — scoped to logged-in user; guests see nothing
app.get("/api/mc/orgs", readLimiter, optionalAppAuth, async (req, res) => {
  try {
    const orgs = req.appUser ? await listMcOrgs(req.appUser.id) : [];
    res.json({ orgs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connect — two modes:
//   Full:  { subdomain, clientId, clientSecret, mid?, eid? }  — saves credentials, starts session
//   Quick: { mid } or { eid }                                 — looks up saved credentials, starts session
app.post("/api/mc/connect", auditLimiter, optionalAppAuth, async (req, res) => {
  const { subdomain, clientId, clientSecret, mid, eid } = req.body || {};
  const scopeId = req.appUser?.id || null;  // null for guests — credentials won't be persisted

  let resolvedSubdomain = subdomain;
  let resolvedClientId  = clientId;
  let resolvedSecret    = clientSecret;
  let resolvedMid       = mid || null;
  let resolvedEid       = eid || null;
  let savedOrgId        = null;

  // ── Quick reconnect: MID or EID only ─────────────────────────────────────
  if (!clientId && !clientSecret) {
    if (!mid && !eid) {
      return res.status(400).json({ error: "Provide clientId + clientSecret for a new org, or a saved MID / EID to reconnect." });
    }
    const saved = mid ? await getMcOrgByMid(mid, scopeId) : await getMcOrgByEid(eid, scopeId);
    if (!saved) {
      return res.status(404).json({ error: "No saved credentials found for that MID/EID. Connect with full credentials first." });
    }
    resolvedSubdomain = saved.subdomain;
    resolvedClientId  = saved.clientId;
    resolvedSecret    = saved.clientSecret;
    resolvedMid       = saved.mid;
    resolvedEid       = saved.eid;
    savedOrgId        = saved.id;
  }

  // ── Full connect: validate required fields ────────────────────────────────
  if (!resolvedSubdomain || !resolvedClientId || !resolvedSecret) {
    return res.status(400).json({ error: "subdomain, clientId, and clientSecret are required." });
  }

  try {
    const data = await fetchToken({
      subdomain: resolvedSubdomain,
      clientId:  resolvedClientId,
      clientSecret: resolvedSecret,
      mid: resolvedMid,
      eid: resolvedEid,
    });

    // Persist credentials for logged-in users only; guests connect ephemerally
    if (clientId && clientSecret && scopeId) {
      savedOrgId = await saveMcOrg({
        subdomain:    resolvedSubdomain,
        mid:          resolvedMid,
        eid:          resolvedEid,
        orgName:      resolvedSubdomain,
        clientId:     resolvedClientId,
        clientSecret: resolvedSecret,
        sfOrgId:      scopeId,
      });
    } else if (savedOrgId) {
      await touchMcOrg(savedOrgId);
    }

    const sessionId = createMcSession({
      subdomain:    resolvedSubdomain,
      clientId:     resolvedClientId,
      clientSecret: resolvedSecret,
      mid:          resolvedMid,
      eid:          resolvedEid,
      accessToken:  data.access_token,
      expiresIn:    data.expires_in,
      accountId:    data.rest_instance_url,
      orgName:      resolvedSubdomain,
    });

    res.cookie("mc_session", sessionId, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      // No maxAge — session cookie, cleared on browser close
    });
    res.json({ connected: true, subdomain: resolvedSubdomain, mid: resolvedMid, eid: resolvedEid });
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

// ─── Portfolio ────────────────────────────────────────────────────────────────

app.get("/api/portfolio", readLimiter, optionalAppAuth, async (_req, res) => {
  try {
    const data = await repo.getPortfolioData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Returns latest category scores + overall score for a list of org IDs
app.get("/api/portfolio/compare", readLimiter, optionalAppAuth, async (req, res) => {
  const ids = (req.query.orgs || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 10);
  if (ids.length < 2) return res.status(400).json({ error: "Provide at least 2 org IDs via ?orgs=id1,id2" });
  try {
    const db = await require("./db/db").getDb();
    const results = await Promise.all(ids.map(async orgId => {
      // Latest complete audit for this org
      const { rows: audits } = await db.query(
        `SELECT id, overall_score, grade, created_at FROM audits WHERE org_id = ? AND status = 'complete' ORDER BY created_at DESC LIMIT 1`,
        [orgId]
      );
      if (!audits[0]) return { orgId, auditId: null, overallScore: null, grade: null, categories: {} };
      const auditId = audits[0].id;
      const { rows: cats } = await db.query(
        `SELECT category, score, weight, issue_count FROM category_scores WHERE audit_id = ?`,
        [auditId]
      );
      const categories = {};
      for (const c of cats) categories[c.category] = { score: c.score, weight: c.weight, issueCount: c.issue_count };
      // Org name
      const { rows: orgRows } = await db.query(`SELECT name, is_sandbox FROM orgs WHERE id = ?`, [orgId]);
      return {
        orgId,
        orgName:      orgRows[0]?.name || orgId,
        isSandbox:    !!(orgRows[0]?.is_sandbox),
        auditId,
        auditDate:    audits[0].created_at,
        overallScore: audits[0].overall_score,
        grade:        audits[0].grade,
        categories,
      };
    }));
    res.json({ orgs: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Consulting PDF report ────────────────────────────────────────────────────

app.get("/api/audit/:jobId/report-pdf", readLimiter, async (req, res) => {
  const brandName = process.env.BRAND_NAME || "SF HEALTH";
  const job = runningJobs.get(req.params.jobId);
  if (job?.status === "complete" && job.report) {
    const html = generateConsultingHTML(job.report, job.report.metadata || {}, brandName);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  }
  const dbAudit = await repo.getAudit(req.params.jobId).catch(() => null);
  if (!dbAudit || !dbAudit.rawScore) return res.status(404).json({ error: "Report not found." });
  const html = generateConsultingHTML(dbAudit.rawScore, dbAudit.rawMetadata || {}, brandName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ─── Compliance reports ───────────────────────────────────────────────────────

app.get("/api/audit/:jobId/compliance/:type", readLimiter, async (req, res) => {
  const { jobId, type } = req.params;
  if (!["gdpr", "soc2", "isv"].includes(type)) {
    return res.status(400).json({ error: "Invalid type. Use gdpr, soc2, or isv." });
  }
  let metadata, healthScore;
  const job = runningJobs.get(jobId);
  if (job?.status === "complete" && job.report) {
    metadata    = job.report.metadata || {};
    healthScore = job.report;
  } else {
    const dbAudit = await repo.getAudit(jobId).catch(() => null);
    if (!dbAudit) return res.status(404).json({ error: "Audit not found." });
    metadata    = dbAudit.rawMetadata || {};
    healthScore = dbAudit.rawScore   || {};
  }
  try {
    const html = generateComplianceReport(type, metadata, healthScore);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Custom rules ─────────────────────────────────────────────────────────────

app.get("/api/custom-rules", readLimiter, requireAppAuth, async (req, res) => {
  try {
    const rules = await repo.listCustomRules(req.appUser.id);
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/custom-rules", readLimiter, requireAppAuth, async (req, res) => {
  const { name, ruleText } = req.body || {};
  if (!name || !ruleText) return res.status(400).json({ error: "name and ruleText are required." });
  try {
    const id = uuidv4();
    await repo.createCustomRule({ id, userId: req.appUser.id, name, ruleText });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/custom-rules/:id", readLimiter, requireAppAuth, async (req, res) => {
  const { name, ruleText, enabled } = req.body || {};
  if (!name || !ruleText) return res.status(400).json({ error: "name and ruleText are required." });
  try {
    await repo.updateCustomRule({
      id: req.params.id, userId: req.appUser.id,
      name, ruleText, enabled: enabled !== false,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/custom-rules/:id", readLimiter, requireAppAuth, async (req, res) => {
  try {
    await repo.deleteCustomRule(req.params.id, req.appUser.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin page ───────────────────────────────────────────────────────────────

app.get("/admin", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/admin.html"));
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  if (req.path.startsWith("/auth") || req.path.startsWith("/app")) {
    return res.sendFile(path.join(__dirname, "../public/index.html"));
  }
  if (req.path.startsWith("/share/")) {
    return res.sendFile(path.join(__dirname, "../public/share.html"));
  }
  if (req.path === "/login") return res.sendFile(path.join(__dirname, "../public/login.html"));
  if (req.path === "/signup") return res.sendFile(path.join(__dirname, "../public/signup.html"));
  if (req.path === "/mc-setup") return res.sendFile(path.join(__dirname, "../public/mc-setup.html"));
  res.sendFile(path.join(__dirname, "../public/landing.html"));
});

app.use((err, req, res, _next) => {
  const isProd = process.env.NODE_ENV === "production";
  console.error(`[${req.requestId}]`, err.stack || err.message);
  res.status(err.status || 500).json({
    error: isProd ? "An unexpected error occurred. Please try again." : err.message,
    code: "INTERNAL_ERROR",
    requestId: req.requestId,
    ...(isProd ? {} : { stack: err.stack }),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  SF Health Dashboard → http://localhost:${PORT}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || "development"}\n`);
  startScheduler();
});

module.exports = app;
