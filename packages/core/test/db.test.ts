import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, SCHEMA_VERSION } from "../src/lib/db.js";

describe("openDb", () => {
  const dirs: string[] = [];
  afterEach(() =>
  dirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  }),
);

  it("abre una DB anterior, migra source_path y conserva transacciones", () => {
    const dir = mkdtempSync(join(tmpdir(), "motor-db-"));
    dirs.push(dir);
    const path = join(dir, "motor.db");
    const old = new Database(path);
    old.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, agent TEXT NOT NULL, project TEXT NOT NULL, started_at TEXT, ended_at TEXT, turns INTEGER NOT NULL DEFAULT 0)");
    old.close();

    const db = openDb(path);
    expect((db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map((column) => column.name)).toContain("source_path");
    const insert = db.transaction(() => db.prepare("INSERT INTO sessions (id, agent, project) VALUES (?, ?, ?)").run("s1", "codex", "demo"));
    insert();
    expect((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n).toBe(1);
    db.close();
  });

  it("DB nueva queda sellada a SCHEMA_VERSION", () => {
    const dir = mkdtempSync(join(tmpdir(), "motor-db-"));
    dirs.push(dir);
    const db = openDb(join(dir, "motor.db"));
    const row = db.prepare("SELECT version FROM schema_info WHERE id = 1").get() as { version: number };
    expect(row.version).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("DB legacy v1 (sin source_path) migra, sella y conserva datos", () => {
    const dir = mkdtempSync(join(tmpdir(), "motor-db-"));
    dirs.push(dir);
    const path = join(dir, "motor.db");
    const legacy = new Database(path);
    legacy.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, agent TEXT NOT NULL, project TEXT NOT NULL, started_at TEXT, ended_at TEXT, turns INTEGER NOT NULL DEFAULT 0)");
    legacy.prepare("INSERT INTO sessions (id, agent, project) VALUES ('s-legacy', 'codex', 'demo')").run();
    legacy.close();

    const db = openDb(path);
    const cols = (db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("source_path");
    expect((db.prepare("SELECT version FROM schema_info WHERE id = 1").get() as { version: number }).version).toBe(SCHEMA_VERSION);
    expect((db.prepare("SELECT project FROM sessions WHERE id = 's-legacy'").get() as { project: string }).project).toBe("demo");
    db.close();

    // Reabrir: la versión sellada evita re-migrar (idempotente).
    const db2 = openDb(path);
    expect((db2.prepare("SELECT version FROM schema_info WHERE id = 1").get() as { version: number }).version).toBe(SCHEMA_VERSION);
    db2.close();
  });

  it("DB de una versión futura se rechaza con error accionable", () => {
    const dir = mkdtempSync(join(tmpdir(), "motor-db-"));
    dirs.push(dir);
    const path = join(dir, "motor.db");
    const db = openDb(path);
    db.prepare("UPDATE schema_info SET version = ? WHERE id = 1").run(SCHEMA_VERSION + 1);
    db.close();

    expect(() => openDb(path)).toThrowError(/schema v/);
    expect(() => openDb(path)).toThrowError(/rebuild/);
  });
});
