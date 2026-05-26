import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createSeedState, normalizePersistedState, type PersistedAppState } from "@/lib/storage";
import type { AuthUser } from "@/lib/types";

const databasePath = resolve(process.cwd(), process.env.DATABASE_PATH ?? "data/hanzi-flow.db");
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_KEY_LENGTH = 64;

let database: DatabaseSync | null = null;

function getDatabase() {
  if (database) {
    return database;
  }

  mkdirSync(dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_state (
      user_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  return database;
}

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
};

function toAuthUser(row: Pick<UserRow, "id" | "email" | "name" | "created_at">): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("hex");
  return { hash, salt };
}

function verifyPassword(password: string, expectedHash: string, salt: string) {
  const actualHash = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  return expectedBuffer.length === actualHash.length && timingSafeEqual(expectedBuffer, actualHash);
}

export function getUserCount() {
  const countStatement = getDatabase().prepare("SELECT COUNT(*) as count FROM users");
  const row = countStatement.get() as { count: number };
  return row.count;
}

export function findUserByEmail(email: string) {
  const findStatement = getDatabase().prepare("SELECT * FROM users WHERE email = ?");
  return findStatement.get(normalizeEmail(email)) as UserRow | undefined;
}

export function createUser(input: { email: string; name: string; password: string }) {
  const existing = findUserByEmail(input.email);

  if (existing) {
    return null;
  }

  const now = new Date().toISOString();
  const { hash, salt } = hashPassword(input.password);
  const user = {
    id: randomUUID(),
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    password_hash: hash,
    password_salt: salt,
    created_at: now,
    updated_at: now,
  };
  const insertStatement = getDatabase().prepare(`
    INSERT INTO users (id, email, name, password_hash, password_salt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertStatement.run(
    user.id,
    user.email,
    user.name,
    user.password_hash,
    user.password_salt,
    user.created_at,
    user.updated_at,
  );

  return toAuthUser(user);
}

export function verifyUserCredentials(email: string, password: string) {
  const user = findUserByEmail(email);

  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    return null;
  }

  return toAuthUser(user);
}

export function createSession(userId: string) {
  const now = new Date();
  const session = {
    id: randomBytes(32).toString("hex"),
    userId,
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS).toISOString(),
    createdAt: now.toISOString(),
  };
  const insertStatement = getDatabase().prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `);

  insertStatement.run(session.id, session.userId, session.expiresAt, session.createdAt);
  return session;
}

export function deleteSession(sessionId: string) {
  getDatabase().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function getUserBySession(sessionId: string | undefined) {
  if (!sessionId) {
    return null;
  }

  const findStatement = getDatabase().prepare(`
    SELECT
      sessions.id,
      sessions.user_id,
      sessions.expires_at,
      users.email,
      users.name,
      users.created_at
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ?
  `);
  const row = findStatement.get(sessionId) as
    | (SessionRow & Pick<UserRow, "email" | "name" | "created_at">)
    | undefined;

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession(sessionId);
    return null;
  }

  return toAuthUser({
    id: row.user_id,
    email: row.email,
    name: row.name,
    created_at: row.created_at,
  });
}

export function loadDatabaseState() {
  const getStateStatement = getDatabase().prepare("SELECT payload FROM app_state WHERE id = 1");
  const row = getStateStatement.get() as { payload: string } | undefined;

  if (!row) {
    const seed = createSeedState();
    saveDatabaseState(seed);
    return seed;
  }

  try {
    return normalizePersistedState(JSON.parse(row.payload) as Partial<PersistedAppState>);
  } catch {
    const seed = createSeedState();
    saveDatabaseState(seed);
    return seed;
  }
}

export function saveDatabaseState(state: PersistedAppState) {
  const normalized = normalizePersistedState(state);
  const saveStateStatement = getDatabase().prepare(`
    INSERT INTO app_state (id, payload, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);
  saveStateStatement.run(JSON.stringify(normalized), new Date().toISOString());
  return normalized;
}

export function loadUserDatabaseState(userId: string) {
  const getStateStatement = getDatabase().prepare("SELECT payload FROM user_state WHERE user_id = ?");
  const row = getStateStatement.get(userId) as { payload: string } | undefined;

  if (!row) {
    const seed = createSeedState();
    saveUserDatabaseState(userId, seed);
    return seed;
  }

  try {
    return normalizePersistedState(JSON.parse(row.payload) as Partial<PersistedAppState>);
  } catch {
    const seed = createSeedState();
    saveUserDatabaseState(userId, seed);
    return seed;
  }
}

export function saveUserDatabaseState(userId: string, state: PersistedAppState) {
  const normalized = normalizePersistedState(state);
  const saveStateStatement = getDatabase().prepare(`
    INSERT INTO user_state (user_id, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);

  saveStateStatement.run(userId, JSON.stringify(normalized), new Date().toISOString());
  return normalized;
}

export function copyLegacyStateToUser(userId: string) {
  const row = getDatabase().prepare("SELECT user_id FROM user_state WHERE user_id = ?").get(userId);

  if (row) {
    return;
  }

  saveUserDatabaseState(userId, loadDatabaseState());
}
