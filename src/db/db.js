/**
 * Database adapter — sql.js (pure JS SQLite) locally, PostgreSQL in production.
 * Set DATABASE_URL to a postgres:// connection string for Postgres.
 * Omit it for sql.js SQLite (zero native compilation needed).
 */

const path = require("path");
const fs   = require("fs");

let _db = null;

function isPostgres() {
  return !!process.env.DATABASE_URL;
}

// ─── sql.js SQLite (pure JS, no native build needed) ──────────────────────────

async function initSQLite() {
  const initSqlJs = require("sql.js");
  const dbPath = process.env.DB_PATH || path.resolve(__dirname, "../../data/sfhealth.db");
  const dir    = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();

  // Load existing db file if it exists, otherwise start fresh
  let db;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Persist to disk after every write
  function persist() {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }

  const schemaSQL = fs.readFileSync(path.resolve(__dirname, "schema.sql"), "utf8");
  db.run(schemaSQL);

  // Migrations — safe to run repeatedly
  try { db.run("ALTER TABLE mc_orgs ADD COLUMN sf_org_id TEXT"); } catch {}

  persist();

  return {
    query: async (sql, params = []) => {
      const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(sql);
      if (isWrite) {
        db.run(sql, params);
        persist();
        return { rows: [], rowCount: 1 };
      }
      const stmt    = db.prepare(sql);
      const rows    = [];
      stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return { rows, rowCount: rows.length };
    },
    close: () => db.close(),
    type: "sqlite",
  };
}

// ─── PostgreSQL ───────────────────────────────────────────────────────────────

async function initPostgres() {
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
    max: 10,
  });

  const sql = fs.readFileSync(path.resolve(__dirname, "schema.pg.sql"), "utf8");
  await pool.query(sql);

  // Migrations — safe to run repeatedly
  await pool.query(`ALTER TABLE mc_orgs ADD COLUMN IF NOT EXISTS sf_org_id TEXT`).catch(() => {});

  return {
    query: async (sql, params = []) => {
      let i = 0;
      const pgSQL  = sql.replace(/\?/g, () => `$${++i}`);
      const result = await pool.query(pgSQL, params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
    close: () => pool.end(),
    type: "postgres",
  };
}

// ─── Init / getter ────────────────────────────────────────────────────────────

async function getDb() {
  if (_db) return _db;
  _db = isPostgres() ? await initPostgres() : await initSQLite();
  const loc = isPostgres()
    ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@")
    : (process.env.DB_PATH || "data/sfhealth.db");
  console.log(`  DB [${_db.type}]: ${loc}`);
  return _db;
}

module.exports = { getDb };
