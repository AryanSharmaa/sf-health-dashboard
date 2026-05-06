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

// ─── Clear SF session conflict via hidden img, then auto-restart auth ─────────

router.get("/salesforce/clear-session", (req, res) => {
  const env      = req.query.env || "production";
  const loginUrl = env === "sandbox" ? "https://test.salesforce.com" : "https://login.salesforce.com";
  const retryUrl = `/auth/salesforce${env === "sandbox" ? "?env=sandbox" : ""}`;

  res.setHeader("Cache-Control", "no-store");
  // Relax CSP just for this page so the hidden img can reach SF logout
  res.setHeader("Content-Security-Policy",
    `default-src 'none'; script-src 'unsafe-inline'; img-src ${loginUrl}; style-src 'unsafe-inline'`);

  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Reconnecting...</title>
<style>
  body{font-family:-apple-system,sans-serif;display:flex;flex-direction:column;
    align-items:center;justify-content:center;height:100vh;margin:0;background:#f3f4f6;color:#374151}
  .spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#2563eb;
    border-radius:50%;animation:spin .8s linear infinite;margin-bottom:16px}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head>
<body>
  <div class="spinner"></div>
  <p>Clearing session, reconnecting&hellip;</p>
  <img src="${loginUrl}/secur/logout.jsp" style="display:none"
       onload="window.location.href='${retryUrl}'"
       onerror="window.location.href='${retryUrl}'">
</body></html>`);
});

// ─── Start OAuth ──────────────────────────────────────────────────────────────

router.get("/salesforce", (req, res) => {
  const clientId = process.env.SF_CLIENT_ID;
  if (!clientId) return res.status(500).send("SF_CLIENT_ID is not configured.");

  // Never cache the auth initiation — a stale redirect causes cross-org errors
  res.setHeader("Cache-Control", "no-store");

  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state         = generateState(codeVerifier);
  const loginUrl      = req.query.env === "sandbox"
    ? "https://test.salesforce.com"
    : "https://login.salesforce.com";
  const redirectUri   = getRedirectUri(req);
  const authUrl       = getAuthorizationUrl({ loginUrl, clientId, redirectUri, state, codeChallenge });

  res.cookie("sf_env",   loginUrl, { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: "lax" });
  res.cookie("sf_state", state,    { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: "lax" });

  res.redirect(authUrl);
});

// ─── OAuth Callback ───────────────────────────────────────────────────────────

router.get("/salesforce/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const isCrossOrg = (error_description || error || "").toLowerCase().includes("cross");
    const alreadyRetried = req.cookies?.sf_cross_org_retry === "1";
    if (isCrossOrg && !alreadyRetried) {
      const isSandbox = (req.cookies?.sf_env || "").includes("test.salesforce.com");
      res.cookie("sf_cross_org_retry", "1", { httpOnly: true, maxAge: 2 * 60 * 1000, sameSite: "lax" });
      return res.redirect(`/auth/salesforce/clear-session${isSandbox ? "?env=sandbox" : ""}`);
    }
    // Clear retry flag and show error if auto-retry also failed
    res.clearCookie("sf_cross_org_retry");
    const isSandbox = (req.cookies?.sf_env || "").includes("test.salesforce.com");
    const envParam  = isSandbox ? "&env=sandbox" : "";
    return res.redirect(`/app?error=${encodeURIComponent(error_description || error)}${envParam}`);
  }

  // Validate state + retrieve PKCE verifier
  const storedState   = req.cookies?.sf_state;
  if (!state || state !== storedState) {
    return res.redirect("/app?error=Invalid+state.+Please+try+again.");
  }

  const codeVerifier = validateState(state);
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
    res.clearCookie("sf_cross_org_retry");
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
