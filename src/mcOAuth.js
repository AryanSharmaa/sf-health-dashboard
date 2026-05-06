/**
 * Marketing Cloud OAuth — client_credentials flow + session management
 */

const https  = require("https");
const crypto = require("crypto");

const mcSessions = new Map();
const MC_SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours — we auto-refresh the token

// ─── Subdomain helpers ────────────────────────────────────────────────────────

function extractSubdomain(input) {
  if (!input) return "";
  const match = (input + "").match(/https?:\/\/([^.]+)\.(auth|rest|soap)\.marketingcloudapis\.com/i);
  if (match) return match[1];
  return input.trim().replace(/\/$/, "");
}

// ─── Token exchange ───────────────────────────────────────────────────────────

async function fetchToken({ subdomain, clientId, clientSecret, mid, eid }) {
  const sub     = extractSubdomain(subdomain);
  const payload = { grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret };
  // MID scopes token to a specific Business Unit; EID scopes to the Enterprise (parent) account
  if (mid) payload.account_id = parseInt(mid, 10);
  else if (eid) payload.account_id = parseInt(eid, 10);
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${sub}.auth.marketingcloudapis.com`,
      path:     "/v2/token",
      method:   "POST",
      headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode !== 200 || !data.access_token) {
            reject(new Error(data.error_description || data.message || `MC auth failed (HTTP ${res.statusCode})`));
          } else {
            resolve(data);
          }
        } catch { reject(new Error("Invalid response from MC authentication server")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Session management ───────────────────────────────────────────────────────

function createMcSession({ subdomain, clientId, clientSecret, mid, eid, accessToken, expiresIn, accountId, orgName }) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  mcSessions.set(sessionId, {
    subdomain:    extractSubdomain(subdomain),
    clientId,
    clientSecret,
    mid:  mid  || null,
    eid:  eid  || null,
    accessToken,
    tokenExpiresAt: Date.now() + (expiresIn || 1200) * 1000 - 60000,
    accountId,
    orgName:   orgName || extractSubdomain(subdomain),
    createdAt: Date.now(),
  });
  return sessionId;
}

function getMcSession(sessionId) {
  if (!sessionId) return null;
  const s = mcSessions.get(sessionId);
  if (!s) return null;
  if (Date.now() - s.createdAt > MC_SESSION_TTL) { mcSessions.delete(sessionId); return null; }
  return s;
}

function deleteMcSession(sessionId) { mcSessions.delete(sessionId); }

// ─── Auto-refresh token if expired ───────────────────────────────────────────

async function getValidToken(session) {
  if (session.accessToken && Date.now() < session.tokenExpiresAt) return session.accessToken;
  const data = await fetchToken({ subdomain: session.subdomain, clientId: session.clientId, clientSecret: session.clientSecret, mid: session.mid, eid: session.eid });
  session.accessToken    = data.access_token;
  session.tokenExpiresAt = Date.now() + (data.expires_in || 1200) * 1000 - 60000;
  return session.accessToken;
}

module.exports = { extractSubdomain, fetchToken, createMcSession, getMcSession, deleteMcSession, getValidToken };
