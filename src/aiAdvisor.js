/**
 * AI-Powered Remediation Advisor
 *
 * Strategy (in order):
 * 1. Salesforce Einstein AI  — uses the customer's own org token, no extra cost
 * 2. Anthropic Claude API    — uses ANTHROPIC_API_KEY set on the server (operator pays)
 * 3. Throws a clean "not configured" error that the UI handles gracefully
 */

const https = require("https");
const http  = require("http");

const SF_API_VERSION = "v62.0";
const CLAUDE_MODEL   = "claude-opus-4-7";

const SYSTEM_PROMPT = `You are a senior Salesforce architect and certified consultant with 15+ years of experience.
Generate a concise, actionable, step-by-step remediation guide for the Salesforce issue described.

Always respond in this exact format:

**Why this matters:** (1–2 sentences on business/technical risk)

**Steps to fix:**
1. First step — include exact Salesforce menu path (e.g. Setup > Process Automation > Flows)
2. Second step
3. Continue until complete (max 8 steps)

**Estimated effort:** X hours / X days / 1 sprint

**Salesforce docs:** (one relevant Help or Trailhead URL as plain text — no markdown link syntax)

Rules: be specific to Salesforce UI, mention retirement deadlines for deprecated features, never say "contact support".`;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function post(urlOrHostname, pathOrOptions, headersOrBody, bodyOrNull) {
  // Overload: post(fullUrl, path, headers, body)  OR  post(options, body)
  return new Promise((resolve, reject) => {
    let options, data;

    if (typeof urlOrHostname === "string" && typeof pathOrOptions === "string") {
      const parsed  = new URL(urlOrHostname);
      const isHttps = parsed.protocol === "https:";
      data    = JSON.stringify(bodyOrNull);
      options = {
        hostname: parsed.hostname,
        port:     parsed.port || (isHttps ? 443 : 80),
        path:     pathOrOptions,
        method:   "POST",
        headers:  { ...headersOrBody, "Content-Length": Buffer.byteLength(data) },
        _isHttps: isHttps,
      };
    } else {
      options = urlOrHostname;
      data    = JSON.stringify(pathOrOptions);
      options.headers["Content-Length"] = Buffer.byteLength(data);
      options._isHttps = true;
    }

    const lib = options._isHttps === false ? http : https;
    const req = lib.request(options, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ─── Strategy 1: Salesforce Einstein AI ──────────────────────────────────────

async function tryEinstein(instanceUrl, accessToken, prompt) {
  const parsed  = new URL(instanceUrl);
  const isHttps = parsed.protocol === "https:";
  const baseHeaders = {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${accessToken}`,
  };

  // Try the two most common Einstein LLM endpoints
  const endpoints = [
    {
      path: `/services/data/${SF_API_VERSION}/einstein/llm/prompt`,
      body: { prompt, model: "sfdc_ai__DefaultGPT4Omni", parameters: { maxTokens: 1024, temperature: 0.3 } },
      extract: b => b.generations?.[0]?.text || b.text || b.generation,
    },
    {
      path: `/services/data/${SF_API_VERSION}/connect/llm/generations`,
      body: { input: prompt, parameters: { maxTokens: 1024, temperature: 0.3 } },
      extract: b => b.generations?.[0]?.text,
    },
  ];

  for (const ep of endpoints) {
    try {
      const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (isHttps ? 443 : 80),
        path:     ep.path,
        method:   "POST",
        headers:  baseHeaders,
        _isHttps: isHttps,
      };
      const { status, body } = await post(options, ep.body);
      if (status === 200) {
        const text = ep.extract(body);
        if (text && text.trim().length > 30) return text;
      }
    } catch { /* try next */ }
  }

  throw new Error("Einstein AI not available on this org.");
}

// ─── Strategy 2: Anthropic Claude API ────────────────────────────────────────

async function tryAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured.");

  const body = JSON.stringify({
    model:      CLAUDE_MODEL,
    max_tokens: 1024,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: "user", content: prompt }],
  });

  const options = {
    hostname: "api.anthropic.com",
    path:     "/v1/messages",
    method:   "POST",
    headers:  {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Length":    Buffer.byteLength(body),
    },
  };

  const { status, body: parsed } = await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  if (status !== 200 || !parsed.content?.[0]?.text) {
    throw new Error(parsed.error?.message || `Anthropic API status ${status}`);
  }
  return parsed.content[0].text;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

async function generateRemediationGuide({ action, category, priority, orgProfile, orgName, instanceUrl, accessToken }) {
  const profile = orgProfile?.label || "Standard";
  const prompt  =
    `Org: "${orgName || "Unknown"}" (${profile})\n` +
    `Issue priority: ${priority}\n` +
    `Category: ${category}\n` +
    `Finding: ${action}\n\n` +
    `Generate the remediation guide now.`;

  // 1 — Try Einstein with the org's own token
  if (instanceUrl && accessToken) {
    try {
      return await tryEinstein(instanceUrl, accessToken, SYSTEM_PROMPT + "\n\n" + prompt);
    } catch { /* fall through to Anthropic */ }
  }

  // 2 — Fall back to Anthropic API (operator's key)
  try {
    return await tryAnthropic(prompt);
  } catch (err) {
    if (!err.message.includes("not configured")) throw err;
  }

  // 3 — Neither available
  throw Object.assign(
    new Error("AI_UNAVAILABLE"),
    { isUnavailable: true }
  );
}

module.exports = { generateRemediationGuide };
