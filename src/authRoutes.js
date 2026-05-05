/**
 * Auth routes — mounted on the Express app in server.js
 *
 * GET  /auth/salesforce             → start OAuth flow
 * GET  /auth/salesforce/callback    → handle Salesforce redirect
 * GET  /auth/session                → return current session info (for frontend)
 * POST /auth/logout                 → clear session
 */

const express = require("express");
const router  = express.Router();
const {
  createSession, getSession, deleteSession,
  getAuthorizationUrl, exchangeCodeForToken,
  getUserInfo, generateState, validateState,
} = require("./oauth");

function getRedirectUri(req) {
  // Use APP_URL env var in production, otherwise derive from request
  if (process.env.APP_URL) return `${process.env.APP_URL}/auth/salesforce/callback`;
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}/auth/salesforce/callback`;
}

function getLoginUrl(req) {
  // Allow user to choose sandbox vs production
  const env = req.query.env || req.cookies?.sf_env || "production";
  return env === "sandbox"
    ? "https://test.salesforce.com"
    : "https://login.salesforce.com";
}

// ─── Start OAuth ──────────────────────────────────────────────────────────────

router.get("/salesforce", (req, res) => {
  const clientId = process.env.SF_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send("SF_CLIENT_ID is not configured on the server.");
  }

  const state       = generateState();
  const loginUrl    = getLoginUrl(req);
  const redirectUri = getRedirectUri(req);
  const authUrl     = getAuthorizationUrl({ loginUrl, clientId, redirectUri, state });

  // Store env choice in a short-lived cookie so callback knows which login URL to use
  res.cookie("sf_env", req.query.env || "production", { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: "lax" });
  res.cookie("sf_state", state,                        { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: "lax" });

  res.redirect(authUrl);
});

// ─── OAuth Callback ───────────────────────────────────────────────────────────

router.get("/salesforce/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`);
  }

  // CSRF check
  const storedState = req.cookies?.sf_state;
  if (!validateState(state) || state !== storedState) {
    return res.redirect("/?error=Invalid+state+parameter.+Please+try+again.");
  }

  const clientId     = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  const loginUrl     = req.cookies?.sf_env === "sandbox"
    ? "https://test.salesforce.com"
    : "https://login.salesforce.com";
  const redirectUri  = getRedirectUri(req);

  try {
    const tokens   = await exchangeCodeForToken({ loginUrl, clientId, clientSecret, redirectUri, code });
    const userInfo = await getUserInfo(tokens.instanceUrl, tokens.accessToken);

    const sessionId = createSession({
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      instanceUrl:  tokens.instanceUrl,
      loginUrl,
      clientId,
      clientSecret,
      userId:       userInfo.user_id,
      username:     userInfo.preferred_username || userInfo.email,
      displayName:  userInfo.name,
      orgId:        userInfo.organization_id,
      orgName:      userInfo.organization_name || userInfo.organization_id,
    });

    // Secure session cookie — 1 hour
    res.cookie("sf_session", sessionId, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 1000,
    });

    // Clear temp cookies
    res.clearCookie("sf_state");
    res.clearCookie("sf_env");

    res.redirect("/");
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    res.redirect(`/?error=${encodeURIComponent(err.message)}`);
  }
});

// ─── Session info (called by frontend on load) ────────────────────────────────

router.get("/session", (req, res) => {
  const sessionId = req.cookies?.sf_session;
  const session   = getSession(sessionId);
  if (!session) return res.json({ connected: false });
  res.json({
    connected:   true,
    username:    session.username,
    displayName: session.displayName,
    orgId:       session.orgId,
    orgName:     session.orgName,
    instanceUrl: session.instanceUrl,
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

router.post("/logout", (req, res) => {
  const sessionId = req.cookies?.sf_session;
  if (sessionId) deleteSession(sessionId);
  res.clearCookie("sf_session");
  res.json({ ok: true });
});

module.exports = router;
