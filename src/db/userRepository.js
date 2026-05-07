/**
 * User accounts and app sessions — bcrypt passwords, DB-backed sessions.
 */

const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("./db");

const SALT_ROUNDS = 12;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// ─── Users ────────────────────────────────────────────────────────────────────

async function createUser({ email, password, name }) {
  const db   = await getDb();
  const now  = new Date().toISOString();
  const norm = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const id   = uuidv4();

  const { rows: existing } = await db.query(
    `SELECT id FROM users WHERE email = ?`, [norm]
  );
  if (existing.length > 0) throw Object.assign(new Error("An account with that email already exists."), { code: "EMAIL_TAKEN" });

  await db.query(
    `INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, norm, hash, (name || "").trim(), now, now]
  );
  return { id, email: norm, name: (name || "").trim() };
}

async function verifyUser({ email, password }) {
  const db   = await getDb();
  const norm = email.trim().toLowerCase();
  const { rows } = await db.query(`SELECT * FROM users WHERE email = ?`, [norm]);
  if (!rows[0]) throw new Error("Invalid email or password.");
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) throw new Error("Invalid email or password.");
  return { id: rows[0].id, email: rows[0].email, name: rows[0].name };
}

// ─── App sessions ─────────────────────────────────────────────────────────────

async function createAppSession(userId) {
  const db        = await getDb();
  const sessionId = uuidv4();
  const now       = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.query(
    `INSERT INTO app_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    [sessionId, userId, now, expiresAt]
  );
  return sessionId;
}

async function getAppSession(sessionId) {
  if (!sessionId) return null;
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT s.*, u.email, u.name, u.created_at AS user_created_at FROM app_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
    [sessionId, new Date().toISOString()]
  );
  return rows[0] || null;
}

async function deleteAppSession(sessionId) {
  if (!sessionId) return;
  const db = await getDb();
  await db.query(`DELETE FROM app_sessions WHERE id = ?`, [sessionId]);
}

async function deleteExpiredSessions() {
  const db = await getDb();
  await db.query(`DELETE FROM app_sessions WHERE expires_at < ?`, [new Date().toISOString()]);
}

module.exports = { createUser, verifyUser, createAppSession, getAppSession, deleteAppSession, deleteExpiredSessions };
