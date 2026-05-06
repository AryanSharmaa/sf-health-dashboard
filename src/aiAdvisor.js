/**
 * AI-Powered Remediation Advisor
 * Uses Claude to generate step-by-step Salesforce fix guides for audit findings.
 */

const https = require("https");

const MODEL   = "claude-opus-4-7";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are a senior Salesforce architect and certified consultant with 15+ years of experience.
Your job is to give concise, actionable, step-by-step remediation guides for Salesforce org health issues.

Rules:
- Always respond in this exact format:
  **Why this matters:** (1–2 sentences on the business/technical risk)
  **Steps to fix:**
  1. Step one (be specific — include menu paths like Setup > ... > ...)
  2. Step two
  3. ...
  **Estimated effort:** X hours / X days / X sprint
  **Salesforce docs:** (one relevant doc or Trailhead link as plain text, no markdown links)
- Be specific to Salesforce UI. Use exact menu paths.
- Keep steps under 8. Be concise — no padding.
- If the issue involves deprecated features (Workflow Rules, Process Builder), always mention the migration deadline.
- Never say "contact Salesforce support" as the fix.`;

function callClaude(apiKey, userMessage) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userMessage }],
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

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) return reject(new Error(parsed.error.message || "Claude API error"));
          const text = parsed.content?.[0]?.text || "";
          resolve(text);
        } catch {
          reject(new Error("Failed to parse Claude response"));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function generateRemediationGuide({ action, category, priority, orgProfile, orgName }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const profile = orgProfile?.label || "Standard";
  const userMessage =
    `Org: "${orgName || "Unknown"}" (${profile} profile)
Issue priority: ${priority}
Category: ${category}
Finding: ${action}

Generate a step-by-step remediation guide for this specific Salesforce issue.`;

  return callClaude(apiKey, userMessage);
}

module.exports = { generateRemediationGuide };
