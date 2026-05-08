/**
 * App-level user auth — signup, login, session, logout.
 */

const express = require("express");
const router  = express.Router();
const { createUser, verifyUser, createAppSession, getAppSession, deleteAppSession } = require("./db/userRepository");

const SESSION_COOKIE = "app_session";
const COOKIE_OPTS = (prod) => ({
  httpOnly: true,
  secure:   prod,
  sameSite: "lax",
  // No maxAge/expires — session cookie, cleared when the browser is closed
});

const isProd = () => process.env.NODE_ENV === "production";

// POST /user/signup
router.post("/signup", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (!email.includes("@")) return res.status(400).json({ error: "Invalid email address." });

  try {
    const user      = await createUser({ email, password, name });
    const sessionId = await createAppSession(user.id);
    res.cookie(SESSION_COOKIE, sessionId, COOKIE_OPTS(isProd()));
    res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    const status = err.code === "EMAIL_TAKEN" ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /user/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });

  try {
    const user      = await verifyUser({ email, password });
    const sessionId = await createAppSession(user.id);
    res.cookie(SESSION_COOKIE, sessionId, COOKIE_OPTS(isProd()));
    res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// GET /user/me
router.get("/me", async (req, res) => {
  const session = await getAppSession(req.cookies?.[SESSION_COOKIE]);
  if (!session) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: { id: session.user_id, email: session.email, name: session.name, created_at: session.user_created_at } });
});

// POST /user/logout
router.post("/logout", async (req, res) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (sessionId) await deleteAppSession(sessionId);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProd(), sameSite: "lax" });
  res.json({ ok: true });
});

module.exports = router;
module.exports.SESSION_COOKIE = SESSION_COOKIE;
