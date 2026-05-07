/**
 * MC Org credential store — AES-256-GCM encryption at rest.
 * Set MC_CRED_SECRET (32+ char random string) in env. If absent, a
 * deterministic fallback is used (fine for dev; not for production).
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("./db");

// ─── Encryption helpers ───────────────────────────────────────────────────────

function getKey() {
  const secret = process.env.MC_CRED_SECRET || "dev-mc-cred-secret-change-in-prod!!";
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

function encrypt(plaintext) {
  const iv         = crypto.randomBytes(12);
  const cipher     = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag        = cipher.getAuthTag();
  // Store as iv:tag:ciphertext all base64
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

function decrypt(stored) {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return decipher.update(Buffer.from(dataB64, "base64")) + decipher.final("utf8");
}

// ─── Save or update MC org credentials ───────────────────────────────────────

async function saveMcOrg({ subdomain, mid, eid, orgName, clientId, clientSecret, sfOrgId }) {
  const db   = await getDb();
  const now  = new Date().toISOString();

  // Upsert keyed on sf_org_id + subdomain + mid so each SF org has its own set
  const { rows: existing } = await db.query(
    `SELECT id FROM mc_orgs WHERE sf_org_id = ? AND subdomain = ? AND (mid = ? OR (mid IS NULL AND ? IS NULL))`,
    [sfOrgId || null, subdomain, mid || null, mid || null]
  );

  const clientIdEnc     = encrypt(clientId);
  const clientSecretEnc = encrypt(clientSecret);

  if (existing.length > 0) {
    await db.query(
      `UPDATE mc_orgs SET client_id_enc = ?, client_secret_enc = ?, eid = ?,
         org_name = ?, updated_at = ? WHERE id = ?`,
      [clientIdEnc, clientSecretEnc, eid || null, orgName || subdomain, now, existing[0].id]
    );
    return existing[0].id;
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO mc_orgs (id, sf_org_id, subdomain, mid, eid, org_name, client_id_enc, client_secret_enc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, sfOrgId || null, subdomain, mid || null, eid || null, orgName || subdomain,
     clientIdEnc, clientSecretEnc, now, now]
  );
  return id;
}

// ─── Look up credentials by MID or EID ───────────────────────────────────────

async function getMcOrgByMid(mid, sfOrgId) {
  if (!mid) return null;
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT * FROM mc_orgs WHERE mid = ? AND sf_org_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [mid, sfOrgId || null]
  );
  return rows[0] ? decryptRow(rows[0]) : null;
}

async function getMcOrgByEid(eid, sfOrgId) {
  if (!eid) return null;
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT * FROM mc_orgs WHERE eid = ? AND sf_org_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [eid, sfOrgId || null]
  );
  return rows[0] ? decryptRow(rows[0]) : null;
}

// ─── List saved orgs (no secrets returned) ───────────────────────────────────

async function listMcOrgs(sfOrgId) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT id, subdomain, mid, eid, org_name, last_used_at, created_at
     FROM mc_orgs WHERE sf_org_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC`,
    [sfOrgId || null]
  );
  return rows;
}

// ─── Touch last_used_at ───────────────────────────────────────────────────────

async function touchMcOrg(id) {
  const db = await getDb();
  await db.query(
    `UPDATE mc_orgs SET last_used_at = ?, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), new Date().toISOString(), id]
  );
}

// ─── Internal: decrypt a row from DB ─────────────────────────────────────────

function decryptRow(row) {
  try {
    return {
      id:           row.id,
      subdomain:    row.subdomain,
      mid:          row.mid,
      eid:          row.eid,
      orgName:      row.org_name,
      clientId:     decrypt(row.client_id_enc),
      clientSecret: decrypt(row.client_secret_enc),
    };
  } catch {
    return null; // decryption failed (wrong key / corrupted row)
  }
}

module.exports = { saveMcOrg, getMcOrgByMid, getMcOrgByEid, listMcOrgs, touchMcOrg };
