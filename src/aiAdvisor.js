/**
 * AI-Powered Remediation Advisor
 *
 * Strategy (in order):
 * 1. Salesforce Einstein AI  — uses the customer's own org token, no extra cost
 * 2. Groq (Llama 3)          — free tier, GROQ_API_KEY env var (get free at console.groq.com)
 * 3. Google Gemini Flash      — free tier fallback, GEMINI_API_KEY env var
 * 4. Anthropic Claude API    — paid fallback, ANTHROPIC_API_KEY env var
 * 5. Throws a clean "not configured" error that the UI handles gracefully
 */

const https = require("https");
const http  = require("http");

const SF_API_VERSION  = "v62.0";
const CLAUDE_MODEL    = "claude-opus-4-7";
const GEMINI_MODEL    = "gemini-2.0-flash";
const GROQ_MODEL      = "llama-3.3-70b-versatile";
const OPENROUTER_MODEL = "openrouter/free";

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

// ─── Strategy 2: Groq (free tier, Llama 3) ───────────────────────────────────

async function tryGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not configured.");

  const body = JSON.stringify({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: prompt },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const options = {
    hostname: "api.groq.com",
    path:     "/openai/v1/chat/completions",
    method:   "POST",
    headers:  {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Content-Length": Buffer.byteLength(body),
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

  if (status !== 200) {
    const msg = parsed?.error?.message || `Groq API status ${status}`;
    throw new Error(msg);
  }

  const text = parsed?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from Groq.");
  return text;
}

// ─── Strategy 3: OpenRouter free tier ────────────────────────────────────────

async function tryOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured.");

  const body = JSON.stringify({
    model: OPENROUTER_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: prompt },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const options = {
    hostname: "openrouter.ai",
    path:     "/api/v1/chat/completions",
    method:   "POST",
    headers:  {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer":  process.env.APP_URL || "https://sf-health-dashboard.onrender.com",
      "X-Title":       "SF Health Dashboard",
      "Content-Length": Buffer.byteLength(body),
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

  if (status !== 200) {
    const msg = parsed?.error?.message || `OpenRouter API status ${status}`;
    throw new Error(msg);
  }

  const text = parsed?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from OpenRouter.");
  return text;
}

// ─── Streaming: OpenRouter SSE → pipes chunks to Express response ────────────

function streamOpenRouter(prompt, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return false;

  const body = JSON.stringify({
    model: OPENROUTER_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: prompt },
    ],
    max_tokens: 1024,
    temperature: 0.3,
    stream: true,
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "openrouter.ai",
      path:     "/api/v1/chat/completions",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${apiKey}`,
        "HTTP-Referer":   process.env.APP_URL || "https://sf-health-dashboard.onrender.com",
        "X-Title":        "SF Health Dashboard",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (upstream) => {
      if (upstream.statusCode !== 200) {
        // Non-200 — fall back to non-streaming path
        upstream.resume();
        return resolve(false);
      }

      // Start SSE response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      let buf = "";
      upstream.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop(); // keep incomplete line
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { res.write("data: [DONE]\n\n"); continue; }
          try {
            const parsed = JSON.parse(payload);
            const token  = parsed.choices?.[0]?.delta?.content;
            if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
          } catch { /* skip malformed */ }
        }
      });

      upstream.on("end", () => {
        res.write("data: [DONE]\n\n");
        res.end();
        resolve(true);
      });

      upstream.on("error", () => resolve(false));
    });

    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

module.exports.streamOpenRouter = streamOpenRouter;

// ─── Strategy 4: Google Gemini Flash (free tier fallback) ────────────────────

async function tryGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured.");

  const body = JSON.stringify({
    contents: [{
      parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }]
    }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
  });

  const path = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const { status, body: parsed } = await new Promise((resolve, reject) => {
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path,
      method:  "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
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

  if (status !== 200) {
    const msg = parsed?.error?.message || `Gemini API status ${status}`;
    throw new Error(msg);
  }

  const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini.");
  return text;
}

// ─── Strategy 3: Anthropic Claude API (paid fallback) ────────────────────────

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
    } catch { /* fall through */ }
  }

  // 2 — Try Groq (free tier, Llama 3)
  try {
    return await tryGroq(prompt);
  } catch (err) {
    console.warn("[aiAdvisor] Groq failed:", err.message);
  }

  // 3 — Try OpenRouter (free tier)
  try {
    return await tryOpenRouter(prompt);
  } catch (err) {
    console.warn("[aiAdvisor] OpenRouter failed:", err.message);
  }

  // 4 — Try Gemini Flash
  try {
    return await tryGemini(prompt);
  } catch (err) {
    console.warn("[aiAdvisor] Gemini failed:", err.message);
  }

  // 5 — Fall back to Anthropic API (paid)
  try {
    return await tryAnthropic(prompt);
  } catch (err) {
    // Fall through on any Anthropic failure (no key, no credits, rate limit, etc.)
    if (process.env.ANTHROPIC_API_KEY) {
      console.warn("[aiAdvisor] Anthropic failed:", err.message);
    }
  }

  // 3 — Neither available
  throw Object.assign(
    new Error("AI_UNAVAILABLE"),
    { isUnavailable: true }
  );
}

module.exports = { generateRemediationGuide, streamOpenRouter };
