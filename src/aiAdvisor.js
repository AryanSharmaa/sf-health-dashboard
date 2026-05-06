/**
 * AI-Powered Remediation Advisor
 * Calls Salesforce Einstein AI (ConnectApi / einstein/llm) using the user's
 * existing OAuth access token — no separate API key needed.
 *
 * Endpoint: POST {instanceUrl}/services/data/vXX.0/einstein/prompt-templates/generation
 * Fallback:  POST {instanceUrl}/services/apexrest/EinsteinAI/generate  (if prompt-templates not available)
 * Final fallback: prompt via /services/data/vXX.0/connect/llm/generations
 */

const https = require("https");
const http  = require("http");

const API_VERSION = "v62.0";

const SYSTEM_PROMPT = `You are a senior Salesforce architect and certified consultant with 15+ years of experience.
Generate a concise, actionable, step-by-step remediation guide for the Salesforce issue described.

Always respond in this exact format:
**Why this matters:** (1–2 sentences on business/technical risk)

**Steps to fix:**
1. Step with exact Salesforce menu path (e.g. Setup > Process Automation > Flows)
2. Next step
3. Continue until complete (max 8 steps)

**Estimated effort:** X hours / X days / 1 sprint

**Salesforce docs:** (one relevant Help or Trailhead URL as plain text)

Rules: be specific to Salesforce UI, mention retirement deadlines for deprecated features, never say "contact support".`;

function httpsPost(instanceUrl, path, accessToken, body) {
  return new Promise((resolve, reject) => {
    const data    = JSON.stringify(body);
    const parsed  = new URL(instanceUrl);
    const isHttps = parsed.protocol === "https:";
    const lib     = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${accessToken}`,
        "Content-Length": Buffer.byteLength(data),
      },
    };

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

// Strategy 1: Einstein /connect/llm/generations (available in orgs with Einstein generative AI)
async function tryConnectLlm(instanceUrl, accessToken, prompt) {
  const { status, body } = await httpsPost(
    instanceUrl,
    `/services/data/${API_VERSION}/connect/llm/generations`,
    accessToken,
    {
      input: prompt,
      parameters: { maxTokens: 1024, temperature: 0.3 },
    }
  );
  if (status === 200 && body.generations?.[0]?.text) return body.generations[0].text;
  throw new Error(body.message || body.error || `Einstein /connect/llm status ${status}`);
}

// Strategy 2: Einstein Platform prompt API
async function tryEinsteinPlatform(instanceUrl, accessToken, prompt) {
  const { status, body } = await httpsPost(
    instanceUrl,
    `/services/data/${API_VERSION}/einstein/prompt-templates/generation`,
    accessToken,
    {
      inputParams: { valueMap: { Input: { value: prompt } } },
      additionalConfig: { applicationName: "SFHealthAdvisor", maxTokens: 1024 },
    }
  );
  if (status === 200 && body.generations?.[0]?.text) return body.generations[0].text;
  throw new Error(body.message || body.error || `Einstein platform status ${status}`);
}

// Strategy 3: Agentforce Actions API (Agentforce-enabled orgs)
async function tryAgentforce(instanceUrl, accessToken, prompt) {
  const { status, body } = await httpsPost(
    instanceUrl,
    `/services/data/${API_VERSION}/einstein/llm/generate`,
    accessToken,
    {
      prompt,
      model: "sfdc_ai__DefaultGPT4Omni",
      maxTokens: 1024,
      temperature: 0.3,
    }
  );
  if (status === 200 && (body.text || body.generation || body.generations?.[0]?.text)) {
    return body.text || body.generation || body.generations[0].text;
  }
  throw new Error(body.message || body.error || `Agentforce status ${status}`);
}

async function generateRemediationGuide({ action, category, priority, orgProfile, orgName, instanceUrl, accessToken }) {
  if (!instanceUrl || !accessToken) {
    throw new Error("No active Salesforce session. Please reconnect your org.");
  }

  const profile = orgProfile?.label || "Standard";
  const prompt  = `${SYSTEM_PROMPT}

Org: "${orgName || "Unknown"}" (${profile})
Issue priority: ${priority}
Category: ${category}
Finding: ${action}

Generate the remediation guide now.`;

  // Try each Einstein endpoint in order, fall through on failure
  const strategies = [tryConnectLlm, tryEinsteinPlatform, tryAgentforce];
  const errors = [];

  for (const strategy of strategies) {
    try {
      const text = await strategy(instanceUrl, accessToken, prompt);
      if (text && text.trim().length > 50) return text;
    } catch (err) {
      errors.push(err.message);
    }
  }

  throw new Error(
    "Einstein AI is not enabled on this org. Enable Einstein Generative AI in Setup > Einstein Setup, or ask your Salesforce admin to activate it. " +
    `(Details: ${errors.join(" | ")})`
  );
}

module.exports = { generateRemediationGuide };
