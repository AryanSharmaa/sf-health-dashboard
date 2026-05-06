/**
 * Salesforce OAuth 2.0 Web Server Flow with PKCE
 */

const crypto = require("crypto");
const https  = require("https");
const http   = require("http");

const sessions    = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

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

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier() {
  return crypto.randomBytes(64).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ─── State + verifier store (CSRF + PKCE) ────────────────────────────────────

const pendingAuth = new Map();

function generateState(codeVerifier) {
  const state = crypto.randomBytes(16).toString("hex");
  pendingAuth.set(state, { codeVerifier, createdAt: Date.now() });
  // Clean up old entries
  for (const [k, v] of pendingAuth) {
    if (Date.now() - v.createdAt > 10 * 60 * 1000) pendingAuth.delete(k);
  }
  return state;
}

function validateState(state) {
  const entry = pendingAuth.get(state);
  if (!entry) return null;
  pendingAuth.delete(state);
  return entry.codeVerifier;
}

// ─── OAuth URL builder (with PKCE) ───────────────────────────────────────────

function getAuthorizationUrl({ loginUrl, clientId, redirectUri, state, codeChallenge }) {
  const base   = loginUrl || "https://login.salesforce.com";
  const params = new URLSearchParams({
    response_type:          "code",
    client_id:              clientId,
    redirect_uri:           redirectUri,
    state:                  state || "",
    scope:                  "full",
    code_challenge:         codeChallenge,
    code_challenge_method:  "S256",
    prompt:                 "login",
    display:                "page",
  });
  return `${base}/services/oauth2/authorize?${params.toString()}`;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function postForm(url, body) {
  return new Promise((resolve, reject) => {
    const data    = new URLSearchParams(body).toString();
    const parsed  = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib     = isHttps ? https : http;
    const options = {
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
      res.on("data", (c) => (raw += c));
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

// ─── Token exchange (with PKCE code_verifier) ────────────────────────────────

async function exchangeCodeForToken({ loginUrl, clientId, clientSecret, redirectUri, code, codeVerifier }) {
  const base = loginUrl || "https://login.salesforce.com";
  const { status, body } = await postForm(`${base}/services/oauth2/token`, {
    grant_type:    "authorization_code",
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  redirectUri,
    code,
    code_verifier: codeVerifier,
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

async function revokeToken(instanceUrl, token) {
  try {
    await postForm(`${instanceUrl}/services/oauth2/revoke`, { token });
  } catch (_) {}
}

module.exports = {
  createSession, getSession, deleteSession,
  generateCodeVerifier, generateCodeChallenge,
  generateState, validateState,
  getAuthorizationUrl, exchangeCodeForToken, getUserInfo, revokeToken,
};
