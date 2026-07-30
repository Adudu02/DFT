/**
 * SQLite vía node:sqlite (sin deps nativas, PLAN §3). La DB es un caché
 * reconstruible en ./data/motor.db — el schema se crea si no existe.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// node:sqlite es experimental: se carga con require en runtime para que el
// bundler (Vite/Vitest) no intente transformarlo estáticamente.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export type DB = import("node:sqlite").DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  agent       TEXT NOT NULL,
  project     TEXT NOT NULL,
  started_at  TEXT,
  ended_at    TEXT,
  turns       INTEGER NOT NULL DEFAULT 0
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
CREATE TABLE IF NOT EXISTS skills_usage (
  skill                   TEXT NOT NULL,
  session_id              TEXT NOT NULL,
  ts                      TEXT NOT NULL,
  kind                    TEXT NOT NULL DEFAULT 'command',
  minutes_saved_estimated REAL,
  UNIQUE(skill, session_id, ts, kind)
);
CREATE INDEX IF NOT EXISTS idx_skills_skill ON skills_usage(skill);
CREATE TABLE IF NOT EXISTS memory_nodes (
  path           TEXT PRIMARY KEY,
  name           TEXT,
  project        TEXT,
  type           TEXT,
  size           INTEGER,
  last_touched   TEXT,
  origin_session TEXT,
  stale_bool     INTEGER
);
CREATE TABLE IF NOT EXISTS ingest_offsets (
  path        TEXT PRIMARY KEY,
  size        INTEGER NOT NULL,
  mtime_ms    INTEGER NOT NULL,
  line_count  INTEGER NOT NULL,
  updated_at  TEXT NOT NULL
);
`;

/** Abre (o crea) la DB en `path` y asegura el schema. */
export function openDb(path: string): DB {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

/** Ruta por defecto de la DB: ./data/motor.db en la raíz del repo. */
export function defaultDbPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "data", "motor.db");
}
