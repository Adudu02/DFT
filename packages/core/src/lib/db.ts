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
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  // Migración para DBs creadas antes de source_path (CREATE TABLE IF NOT EXISTS
  // no agrega columnas). La DB es caché reconstruible, pero esto evita exigir
  // un rebuild manual.
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN source_path TEXT");
  } catch {
    // ya existe
  }
  return db;
}

/** Ruta por defecto de la DB: `<cwd>/data/motor.db`. */
export function defaultDbPath(): string {
  return join(dataDir(), "motor.db");
}
