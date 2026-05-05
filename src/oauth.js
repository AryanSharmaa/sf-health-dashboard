/**
 * Salesforce OAuth 2.0 Web Server Flow
 *
 * Flow:
 *   1. GET /auth/salesforce         → redirect user to Salesforce login
 *   2. GET /auth/salesforce/callback → exchange code for access token
 *   3. Store token in server-side session, return session cookie to browser
 *   4. All audit requests use the session token — password never touches server
 */

const crypto  = require("crypto");
const https   = require("https");
const http    = require("http");

// In-memory session store (fine for free tier — swap for Redis in scale-up)
const sessions = new Map();

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Session helpers ──────────────────────────────────────────────────────────

function createSession(data) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  sessions.set(sessionId, { ...data, createdAt: Date.now() });
  return sessionId;
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

// ─── OAuth URL builder ────────────────────────────────────────────────────────

function getAuthorizationUrl({ loginUrl, clientId, redirectUri, state }) {
  const base = loginUrl || "https://login.salesforce.com";
  const params = new URLSearchParams({
    response_type: "code",
    client_id:     clientId,
    redirect_uri:  redirectUri,
    state:         state || "",
    scope:         "full refresh_token",
    prompt:        "consent",
  });
  return `${base}/services/oauth2/authorize?${params.toString()}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

function postForm(url, body) {
  return new Promise((resolve, reject) => {
    const data     = new URLSearchParams(body).toString();
    const parsed   = new URL(url);
    const isHttps  = parsed.protocol === "https:";
    const lib      = isHttps ? https : http;
    const options  = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = lib.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
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

async function exchangeCodeForToken({ loginUrl, clientId, clientSecret, redirectUri, code }) {
  const base = loginUrl || "https://login.salesforce.com";
  const { status, body } = await postForm(`${base}/services/oauth2/token`, {
    grant_type:    "authorization_code",
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  redirectUri,
    code,
  });

  if (status !== 200 || !body.access_token) {
    throw new Error(body.error_description || body.error || `Token exchange failed (${status})`);
  }

  return {
    accessToken:  body.access_token,
    refreshToken: body.refresh_token,
    instanceUrl:  body.instance_url,
    tokenType:    body.token_type,
    issuedAt:     body.issued_at,
    idUrl:        body.id,
  };
}

async function refreshAccessToken({ loginUrl, clientId, clientSecret, refreshToken }) {
  const base = loginUrl || "https://login.salesforce.com";
  const { status, body } = await postForm(`${base}/services/oauth2/token`, {
    grant_type:    "refresh_token",
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  if (status !== 200 || !body.access_token) {
    throw new Error("Token refresh failed — please reconnect your org.");
  }
  return body.access_token;
}

async function getUserInfo(instanceUrl, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(`${instanceUrl}/services/oauth2/userinfo`);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname,
      method:   "GET",
      headers:  { Authorization: `Bearer ${accessToken}` },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve({}); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ─── PKCE state helpers (CSRF protection) ────────────────────────────────────

const pendingStates = new Map();

function generateState() {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now());
  // Clean up states older than 10 minutes
  for (const [k, v] of pendingStates) {
    if (Date.now() - v > 10 * 60 * 1000) pendingStates.delete(k);
  }
  return state;
}

function validateState(state) {
  if (!state || !pendingStates.has(state)) return false;
  pendingStates.delete(state);
  return true;
}

module.exports = {
  createSession, getSession, deleteSession,
  getAuthorizationUrl, exchangeCodeForToken, refreshAccessToken,
  getUserInfo, generateState, validateState,
};
