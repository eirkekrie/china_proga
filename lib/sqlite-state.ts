import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSeedState, normalizePersistedState, type PersistedAppState } from "@/lib/storage";

const databasePath = resolve(process.cwd(), process.env.DATABASE_PATH ?? "data/hanzi-flow.db");

mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);

database.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const getStateStatement = database.prepare("SELECT payload FROM app_state WHERE id = 1");
const saveStateStatement = database.prepare(`
  INSERT INTO app_state (id, payload, updated_at)
  VALUES (1, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    payload = excluded.payload,
    updated_at = excluded.updated_at
`);

export function loadDatabaseState() {
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
  saveStateStatement.run(JSON.stringify(normalized), new Date().toISOString());
  return normalized;
}
