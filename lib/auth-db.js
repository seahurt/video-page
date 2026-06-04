import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const SESSION_COOKIE = "nas_video_session";

const defaultDbPath = path.join(process.cwd(), ".data", "app.sqlite");
const DB_PATH = process.env.SQLITE_PATH
  ? path.resolve(/* turbopackIgnore: true */ process.env.SQLITE_PATH)
  : defaultDbPath;
const SESSION_DAYS = 30;
const TEMPORARY_SESSION_HOURS = 12;

let db;

export function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS temporary_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_temporary_tokens_token_hash ON temporary_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_temporary_tokens_expires_at ON temporary_tokens(expires_at);
  `);
  resetSessionsTableIfLegacy();
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      temporary_token_id INTEGER,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (
        (user_id IS NOT NULL AND temporary_token_id IS NULL)
        OR (user_id IS NULL AND temporary_token_id IS NOT NULL)
      ),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (temporary_token_id) REFERENCES temporary_tokens(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_temporary_token_id ON sessions(temporary_token_id);
  `);

  return db;
}

export function createUser(username, password) {
  const normalized = normalizeUsername(username);
  validatePassword(password);

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);

  getDb().prepare(`
    INSERT INTO users (username, password_hash, salt)
    VALUES (?, ?, ?)
  `).run(normalized, passwordHash, salt);

  return findUserByUsername(normalized);
}

export function findUserByUsername(username) {
  return getDb().prepare(`
    SELECT id, username, password_hash, salt, created_at
    FROM users
    WHERE username = ?
  `).get(normalizeUsername(username));
}

export function verifyPassword(username, password) {
  const user = findUserByUsername(username);
  if (!user) return null;

  const candidate = hashPassword(password, user.salt);
  const expected = Buffer.from(user.password_hash, "hex");
  const actual = Buffer.from(candidate, "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  return publicUser(user);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;

  getDb().prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, tokenHash, expiresAt);

  return { token, expiresAt };
}

export function createTemporarySession(temporaryToken) {
  const row = temporaryTokenRowByToken(temporaryToken);
  if (!row) return null;

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const shortExpiresAt = Date.now() + TEMPORARY_SESSION_HOURS * 60 * 60 * 1000;
  const expiresAt = row.expires_at ? Math.min(row.expires_at, shortExpiresAt) : shortExpiresAt;

  getDb().prepare(`
    INSERT INTO sessions (temporary_token_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(row.id, tokenHash, expiresAt);

  return { token, expiresAt, user: temporaryUser(row) };
}

export function getUserBySessionToken(token) {
  if (!token) return null;
  deleteExpiredTemporaryTokens();
  deleteExpiredSessions();

  const row = getDb().prepare(`
    SELECT
      users.id AS user_id,
      users.username AS username,
      users.created_at AS user_created_at,
      temporary_tokens.id AS temporary_token_id,
      temporary_tokens.name AS temporary_token_name,
      temporary_tokens.created_at AS temporary_token_created_at
    FROM sessions
    LEFT JOIN users ON users.id = sessions.user_id
    LEFT JOIN temporary_tokens ON temporary_tokens.id = sessions.temporary_token_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
      AND (
        (sessions.user_id IS NOT NULL AND users.id IS NOT NULL)
        OR (
          sessions.temporary_token_id IS NOT NULL
          AND temporary_tokens.id IS NOT NULL
          AND (temporary_tokens.expires_at IS NULL OR temporary_tokens.expires_at > ?)
        )
      )
  `).get(hashToken(token), Date.now(), Date.now());

  if (!row) return null;
  if (row.temporary_token_id) {
    return temporaryUser({
      id: row.temporary_token_id,
      name: row.temporary_token_name,
      created_at: row.temporary_token_created_at
    });
  }

  return publicUser({
    id: row.user_id,
    username: row.username,
    created_at: row.user_created_at
  });
}

export function deleteSession(token) {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function createTemporaryToken(name, { days = 7 } = {}) {
  const normalized = normalizeTokenName(name);
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const numericDays = Number(days);
  const expiresAt = Number.isFinite(numericDays) && numericDays > 0
    ? Date.now() + numericDays * 24 * 60 * 60 * 1000
    : null;

  getDb().prepare(`
    INSERT INTO temporary_tokens (name, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(normalized, tokenHash, expiresAt);

  return { name: normalized, token, expiresAt };
}

export function getUserByTemporaryToken(token) {
  const row = temporaryTokenRowByToken(token);
  return row ? temporaryUser(row) : null;
}

export function deleteTemporaryToken(identifier) {
  const value = String(identifier || "").trim();
  if (!value) return 0;

  const result = getDb().prepare(`
    DELETE FROM temporary_tokens
    WHERE name = ? OR token_hash = ?
  `).run(value, hashToken(value));

  return result.changes;
}

export function listTemporaryTokens() {
  deleteExpiredTemporaryTokens();

  return getDb().prepare(`
    SELECT name, expires_at, created_at
    FROM temporary_tokens
    ORDER BY created_at DESC
  `).all().map((row) => ({
    name: row.name,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  }));
}

export function userCount() {
  return getDb().prepare("SELECT COUNT(*) AS count FROM users").get().count;
}

export function databasePath() {
  return DB_PATH;
}

function deleteExpiredSessions() {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}

function deleteExpiredTemporaryTokens() {
  getDb().prepare("DELETE FROM temporary_tokens WHERE expires_at IS NOT NULL AND expires_at <= ?").run(Date.now());
}

function temporaryTokenRowByToken(token) {
  if (!token) return null;
  deleteExpiredTemporaryTokens();

  return getDb().prepare(`
    SELECT id, name, expires_at, created_at
    FROM temporary_tokens
    WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > ?)
  `).get(hashToken(token), Date.now());
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizeTokenName(name) {
  const normalized = String(name || "").trim();
  if (!normalized) throw new Error("Token 名称不能为空");
  if (normalized.length > 80) throw new Error("Token 名称不能超过 80 个字符");
  return normalized;
}

function validatePassword(password) {
  if (String(password || "").length < 8) {
    throw new Error("密码至少需要 8 位");
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.created_at
  };
}

function temporaryUser(row) {
  return {
    id: `temporary-token:${row.id}`,
    username: row.name,
    createdAt: row.created_at,
    temporary: true
  };
}

function resetSessionsTableIfLegacy() {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get();
  if (!table) return;

  const columns = db.prepare("PRAGMA table_info(sessions)").all();
  const hasTemporaryTokenId = columns.some((row) => row.name === "temporary_token_id");
  const userId = columns.find((row) => row.name === "user_id");
  if (!hasTemporaryTokenId || userId?.notnull) {
    db.exec("DROP TABLE sessions");
  }
}
