/**
 * Motor de snapshot SQLite (workstream A2) + adapters OpenCode (acumulativo,
 * schema real verificado) y grok-cli (append-only, fixture-driven).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withSqliteSnapshot } from "../src/lib/sqlite-snapshot.js";
import { opencodeDbSyncAdapter } from "../src/adapters/opencode.js";
import { grokDbSyncAdapter } from "../src/adapters/grok.js";
import { openDb, type DB } from "../src/lib/db.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "motor-sql-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("withSqliteSnapshot", () => {
  it("copia datos vivos en WAL y lee sobre la copia", async () => {
    const src = join(tmp, "live.db");
    const live = new Database(src);
    live.exec("CREATE TABLE t (v TEXT)");
    live.prepare("INSERT INTO t VALUES ('hola')").run(); // puede quedar en WAL
    const opened = await withSqliteSnapshot(src, (snap) => snap.prepare("SELECT v FROM t").all());
    expect(opened).toEqual([{ v: "hola" }]);
    live.close();
  });
  it("la copia es readonly y la fuente queda intacta", async () => {
    const src = join(tmp, "live2.db");
    const live = new Database(src);
    live.exec("CREATE TABLE t (v TEXT)");
    live.close();
    await withSqliteSnapshot(src, (snap) => {
      // defensa en profundidad: la copia también se abre readonly
      expect(() => snap.exec("CREATE TABLE baseline (x)")).toThrowError(/readonly/);
    });
    const check = new Database(src, { readonly: true });
    const tables = (check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    check.close();
    expect(tables).toEqual(["t"]); // la fuente no fue modificada
  });
  it("fuente inexistente rechaza", async () => {
    await expect(withSqliteSnapshot(join(tmp, "no-existe.db"), () => 1)).rejects.toThrow();
  });
});

describe("opencode — sync acumulativa (schema real verificado)", () => {
  let db: DB;
  let srcDbPath: string;
  let srcDb: Database.Database;
  let adapter: ReturnType<typeof opencodeDbSyncAdapter>;

  beforeEach(() => {
    db = openDb(join(tmp, "motor.db"));
    srcDbPath = join(tmp, "opencode.db");
    srcDb = new Database(srcDbPath);
    srcDb.exec(`CREATE TABLE session (
      id TEXT PRIMARY KEY, directory TEXT, tokens_input INT, tokens_output INT,
      tokens_reasoning INT, tokens_cache_read INT, tokens_cache_write INT,
      agent TEXT, model TEXT, time_created INT, time_updated INT)`);
    adapter = opencodeDbSyncAdapter(srcDbPath);
  });
  afterEach(() => {
    srcDb.close();
    db.close();
  });

  const seed = (tokens: [number, number, number], updated: number) => {
    srcDb.prepare("DELETE FROM session").run();
    srcDb
      .prepare("INSERT INTO session (id, directory, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, agent, model, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, 'build', ?, 1000, ?)")
      .run("ses_1", "/home/u/Projects/SSAI", tokens[0], tokens[1], tokens[2], 600, 50, '{"id":"glm-5.3","providerID":"zai"}', updated);
  };

  it("primera sync: proyecto real del directory, modelo JSON, reasoning plegado", async () => {
    seed([1000, 200, 50], 5000);
    const res = await adapter.sync(db, srcDb);
    expect(res.eventsInserted).toBe(1);
    const row = db.prepare("SELECT project, agent FROM sessions WHERE id = 'ses_1'").get() as { project: string; agent: string };
    expect(row).toMatchObject({ project: "SSAI", agent: "opencode" });
    const ev = db.prepare("SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, model FROM usage_events WHERE dedup_key = 'opencode::ses_1'").get() as Record<string, number | string>;
    expect(ev).toMatchObject({ input_tokens: 1000, output_tokens: 250, cache_read_tokens: 600, cache_write_tokens: 50, model: "glm-5.3" });
  });
  it("re-sync sin cambios => 0 escrituras (idempotente)", async () => {
    seed([1000, 200, 50], 5000);
    await adapter.sync(db, srcDb);
    const second = await adapter.sync(db, srcDb);
    expect(second.eventsInserted).toBe(0);
    expect(second.skipped).toBe(1);
  });
  it("sesión que crece => reemplaza sin duplicar", async () => {
    seed([1000, 200, 50], 5000);
    await adapter.sync(db, srcDb);
    seed([2000, 400, 80], 9000); // creció
    const res = await adapter.sync(db, srcDb);
    expect(res.eventsInserted).toBe(1);
    const n = (db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE dedup_key LIKE 'opencode::ses_1%'").get() as { n: number }).n;
    expect(n).toBe(1); // una sola fila: reemplazada, no acumulada
    const ev = db.prepare("SELECT input_tokens FROM usage_events WHERE dedup_key = 'opencode::ses_1'").get() as { input_tokens: number };
    expect(ev.input_tokens).toBe(2000);
  });
});

describe("grok — sync append-only (schema del plan, fixture-driven)", () => {
  let db: DB;
  let srcDbPath: string;
  let srcDb: Database.Database;
  let adapter: ReturnType<typeof grokDbSyncAdapter>;

  beforeEach(() => {
    db = openDb(join(tmp, "motor.db"));
    srcDbPath = join(tmp, "grok.db");
    srcDb = new Database(srcDbPath);
    // Schema según docs/implementation-plan.md + created_at (supuesto documentado)
    srcDb.exec(`CREATE TABLE usage_events (
      session_id TEXT, model TEXT, input_tokens INT, output_tokens INT,
      total_tokens INT, cost_micros INT, created_at INT)`);
    adapter = grokDbSyncAdapter(srcDbPath);
  });
  afterEach(() => {
    srcDb.close();
    db.close();
  });

  const seed = () => {
    srcDb.exec("DELETE FROM usage_events");
    const ins = srcDb.prepare("INSERT INTO usage_events (session_id, model, input_tokens, output_tokens, total_tokens, cost_micros, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    ins.run("g-1", "grok-5", 100, 20, 120, 1500, 1789000000); // epoch-s
    ins.run("g-1", "grok-5", 200, 30, 230, 2500, Date.now() - 60_000); // epoch-ms
  };

  it("append-only incremental: inserta solo las nuevas", async () => {
    seed();
    const first = await adapter.sync(db, srcDb);
    expect(first.eventsInserted).toBe(2);
    const second = await adapter.sync(db, srcDb);
    expect(second.eventsInserted).toBe(0); // reingesta incremental
    const rows = db.prepare("SELECT id, agent FROM sessions WHERE agent = 'grok'").all();
    expect(rows).toHaveLength(1);
  });
  it("fila sin timestamp => skipped", async () => {
    seed();
    srcDb.exec("INSERT INTO usage_events (session_id, model, input_tokens, output_tokens, total_tokens) VALUES ('g-1', 'grok-5', 1, 1, 2)");
    const res = await adapter.sync(db, srcDb);
    expect(res.skipped).toBe(1);
    expect(res.eventsInserted).toBe(2);
  });
  it("los micros del proveedor no se usan: costo por pricing (0 con modelo desconocido)", () => {
    seed();
    void adapter.sync(db, srcDb);
    const ev = db.prepare("SELECT cost_usd FROM usage_events WHERE dedup_key LIKE 'grok::g-1::%' LIMIT 1").get() as { cost_usd: number };
    expect(ev.cost_usd).toBe(0); // grok-5 no está en pricing => 0 + unknown (equiv-API, nunca micros)
  });
});
