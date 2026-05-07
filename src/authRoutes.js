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
  const forceLogin    = req.query.force === "1";
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
    const isSandbox = (req.cookies?.sf_env || "").includes("test.salesforce.com");
    res.clearCookie("sf_state");
    res.clearCookie("sf_env");
    res.clearCookie("sf_pkce");
    const isCrossOrg = error.includes("cross") ||
      (error === "access_denied" && (error_description || "").toLowerCase().includes("cross"));
    if (isCrossOrg) {
      const envParam = isSandbox ? "&env=sandbox" : "";
      return res.redirect(`/app?error=cross-org-conflict${envParam}`);
    }
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
    const userInfo = await getUserInfo(tokens.instanceUrl, tokens.accessToken);

    const sessionId = createSession({
      accessToken:  tokens.accessToken,
      refreshToken: tokens.refreshToken,
      instanceUrl:  tokens.instanceUrl,
      loginUrl,
      clientId,
      clientSecret,
      userId:      userInfo.user_id,
      username:    userInfo.preferred_username || userInfo.email,
      displayName: userInfo.name,
      orgId:       userInfo.organization_id,
      orgName:     userInfo.organization_name || userInfo.organization_id,
    });

    res.cookie("sf_session", sessionId, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   8 * 60 * 60 * 1000, // 8 hours
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

// ─── Clear session + re-auth (cross-org recovery) ────────────────────────────
// The user has an active SF session from a different org in their browser.
// We clear our app session and send them to SF logout first, then back to /auth/salesforce.
// SF's own logout clears the browser session on login.salesforce.com so the next
// authorize call gets a fresh login screen instead of inheriting the wrong org.

router.get("/salesforce/clear-session", (req, res) => {
  const isSandbox = req.query.env === "sandbox";
  const loginUrl  = isSandbox ? "https://test.salesforce.com" : "https://login.salesforce.com";

  res.clearCookie("sf_session", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
  res.clearCookie("sf_state");
  res.clearCookie("sf_env");
  res.clearCookie("sf_pkce");

  const appUrl      = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const authRestart = `${appUrl}/auth/salesforce?force=1${isSandbox ? "&env=sandbox" : ""}`;

  // logout.jsp does NOT redirect to external retUrl domains — it ignores it and
  // dumps the user on the SF homepage. Instead: serve a page that fires a hidden
  // iframe to logout.jsp (clears the SF browser session), then immediately
  // redirects the top-level window to our fresh OAuth start.
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signing out…</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
    .msg { text-align: center; color: #4a5568; font-size: 15px; }
    .spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0;
               border-top-color: #0070d2; border-radius: 50%;
               animation: spin 0.7s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="msg">
    <div class="spinner"></div>
    Signing out of Salesforce…
  </div>
  <img src="${loginUrl}/secur/logout.jsp" style="display:none" onerror="void(0)" onload="void(0)">
  <script>
    // Give the img tag ~1.5s to fire the SF logout request, then redirect to fresh OAuth.
    // img bypasses X-Frame-Options so it works even on orgs that block iframes.
    setTimeout(function() {
      window.location.href = ${JSON.stringify(authRestart)};
    }, 1500);
  </script>
</body>
</html>`);
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
