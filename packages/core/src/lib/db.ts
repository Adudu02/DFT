/**
 * SQLite vía better-sqlite3. La DB es un caché
 * reconstruible en ./data/motor.db — el schema se crea si no existe.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDir } from "./paths.js";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  agent       TEXT NOT NULL,
  project     TEXT NOT NULL,
  started_at  TEXT,
  ended_at    TEXT,
  turns       INTEGER NOT NULL DEFAULT 0,
  source_path TEXT
);
CREATE TABLE IF NOT EXISTS usage_events (
  dedup_key           TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL,
  ts                  TEXT NOT NULL,
  day                 TEXT NOT NULL,
  model               TEXT NOT NULL,
  input_tokens        INTEGER NOT NULL,
  output_tokens       INTEGER NOT NULL,
  cache_write_tokens  INTEGER NOT NULL,
  cache_read_tokens   INTEGER NOT NULL,
  cost_usd            REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_day   ON usage_events(day);
CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_events(model);
CREATE INDEX IF NOT EXISTS idx_sessions_ended ON sessions(ended_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_filter ON sessions(project, agent);
CREATE TABLE IF NOT EXISTS skills_usage (
  skill                   TEXT NOT NULL,
  session_id              TEXT NOT NULL,
  ts                      TEXT NOT NULL,
  kind                    TEXT NOT NULL DEFAULT 'command',
  minutes_saved_estimated REAL,
  UNIQUE(skill, session_id, ts, kind)
);
CREATE INDEX IF NOT EXISTS idx_skills_skill ON skills_usage(skill);
CREATE TABLE IF NOT EXISTS ingest_offsets (
  path        TEXT PRIMARY KEY,
  size        INTEGER NOT NULL,
  mtime_ms    INTEGER NOT NULL,
  line_count  INTEGER NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_info (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);
`;

/**
 * Versión del schema que produce este código. Al cambiar el schema:
 * incrementar esta constante y añadir la migración en MIGRATIONS (la entrada
 * `v` lleva una DB de versión v a v+1).
 */
export const SCHEMA_VERSION = 2;

const MIGRATIONS: Record<number, string[]> = {
  // v1 → v2: columna source_path en sessions (DBs anteriores a su introducción).
  1: ["ALTER TABLE sessions ADD COLUMN source_path TEXT"],
};

function storedVersion(db: DB): number {
  const row = db.prepare("SELECT version FROM schema_info WHERE id = 1").get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0; // 0 = DB pre-versioning (sin fila)
}

/** Abre (o crea) la DB en `path` y asegura el schema + versión. */
export function openDb(path: string): DB {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  let current = storedVersion(db);
  if (current === 0) {
    // DB pre-versioning: deducir por la forma del schema (source_path = v2).
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    current = cols.some((c) => c.name === "source_path") ? SCHEMA_VERSION : 1;
  }
  if (current > SCHEMA_VERSION) {
    db.close();
    throw new Error(
      "La DB (" + path + ") fue creada por una versión más nueva del programa (schema v" + current + " > v" + SCHEMA_VERSION + "). " +
      "Regenerá el caché: `pnpm cli -- --rebuild`, o borrá el archivo y volvé a abrir.",
    );
  }
  for (let v = current; v < SCHEMA_VERSION; v++) {
    for (const stmt of MIGRATIONS[v] ?? []) {
      try {
        db.exec(stmt);
      } catch {
        // estado intermedio (columna ya presente): tolerado, igual que antes
      }
    }
  }
  db.prepare(
    "INSERT INTO schema_info (id, version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version",
  ).run(SCHEMA_VERSION);
  return db;
}

/** Ruta por defecto de la DB: `<cwd>/data/motor.db`. */
export function defaultDbPath(): string {
  return join(dataDir(), "motor.db");
}
