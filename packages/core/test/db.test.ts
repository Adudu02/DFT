import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/lib/db.js";

describe("openDb", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

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
});
