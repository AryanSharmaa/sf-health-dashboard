/**
 * Auth routes — OAuth 2.0 with PKCE
 */

const express = require("express");
const router  = express.Router();
const {
  createSession, getSession, deleteSession,
  generateCodeVerifier, generateCodeChallenge,
  generateState, validateState,
  getAuthorizationUrl, exchangeCodeForToken, getUserInfo, revokeToken,
} = require("./oauth");

function getRedirectUri(req) {
  if (process.env.APP_URL) return `${process.env.APP_URL}/auth/salesforce/callback`;
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}/auth/salesforce/callback`;
}


// ─── Start OAuth ──────────────────────────────────────────────────────────────

router.get("/salesforce", (req, res) => {
  const clientId = process.env.SF_CLIENT_ID;
  if (!clientId) return res.status(500).send("SF_CLIENT_ID is not configured.");

  // Never cache the auth initiation — a stale redirect causes cross-org errors
  res.setHeader("Cache-Control", "no-store");

  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state         = generateState();
  const loginUrl      = req.query.env === "sandbox"
    ? "https://test.salesforce.com"
    : "https://login.salesforce.com";
  const redirectUri   = getRedirectUri(req);
  const forceLogin    = req.query.switch === "1";
  const authUrl       = getAuthorizationUrl({ loginUrl, clientId, redirectUri, state, codeChallenge, forceLogin });

  const cookieOpts = { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: "lax", secure: process.env.NODE_ENV === "production" };
  res.cookie("sf_env",   loginUrl,     cookieOpts);
  res.cookie("sf_state", state,        cookieOpts);
  res.cookie("sf_pkce",  codeVerifier, cookieOpts);

  res.redirect(authUrl);
});

// ─── OAuth Callback ───────────────────────────────────────────────────────────

router.get("/salesforce/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    res.clearCookie("sf_state");
    res.clearCookie("sf_env");
    res.clearCookie("sf_pkce");
    return res.redirect(`/app?error=${encodeURIComponent(error_description || error)}`);
  }

  // Validate state (CSRF) and retrieve PKCE verifier — both live in cookies,
  // so a server restart between authorize and callback doesn't break the flow.
  const storedState  = req.cookies?.sf_state;
  const codeVerifier = req.cookies?.sf_pkce;

  if (!validateState(state, storedState)) {
    return res.redirect("/app?error=Invalid+state.+Please+try+again.");
  }
  if (!codeVerifier) {
    return res.redirect("/app?error=Session+expired.+Please+try+again.");
  }

  const clientId     = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  const loginUrl     = req.cookies?.sf_env || "https://login.salesforce.com";
  const redirectUri  = getRedirectUri(req);

  try {
    const tokens   = await exchangeCodeForToken({
      loginUrl, clientId, clientSecret, redirectUri, code, codeVerifier,
    });
    const userInfo = await getUserInfo(tokens.instanceUrl, tokens.accessToken, tokens.idUrl);

    const sessionId = createSession({
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      instanceUrl:  tokens.instanceUrl,
      loginUrl,
      clientId,
      clientSecret,
      userId:      userInfo.user_id,
      username:    userInfo.username || userInfo.preferred_username || userInfo.email || "unknown",
      displayName: userInfo.display_name || userInfo.name || userInfo.username || "User",
      orgId:       userInfo.organization_id || tokens.idUrl?.split("/")[4] || "unknown",
      orgName:     userInfo.organization_name || userInfo.organization_id || "Salesforce Org",
    });

    res.cookie("sf_session", sessionId, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      // No maxAge — session cookie, cleared on browser close
    });

    res.clearCookie("sf_state");
    res.clearCookie("sf_env");
    res.clearCookie("sf_pkce");
    res.redirect("/app");
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    res.redirect(`/app?error=${encodeURIComponent(err.message)}`);
  }
});

// ─── Session info ─────────────────────────────────────────────────────────────

router.get("/session", (req, res) => {
  const session = getSession(req.cookies?.sf_session);
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

router.post("/logout", async (req, res) => {
  const sessionId = req.cookies?.sf_session;
  if (sessionId) {
    const session = getSession(sessionId);
    if (session?.accessToken && session?.instanceUrl) {
      await revokeToken(session.instanceUrl, session.accessToken);
    }
    deleteSession(sessionId);
  }
  res.clearCookie("sf_session", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.json({ ok: true });
});

module.exports = router;
