import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { evenSplit, getActivity, getActivityPage, getSessionDetail, getSessionTurns, opencodePrompts, searchPrompts } from "../src/lib/activity.js";
import { loadPricing } from "../src/lib/pricing.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

function addOpenCodeMessage(
  source: import("better-sqlite3").Database,
  id: string,
  sessionId: string,
  time: string,
  role: "user" | "assistant",
  parts: { id: string; data: unknown | string; time?: string }[],
): void {
  const created = Date.parse(time);
  source.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(id, sessionId, created, created, JSON.stringify({ role }));
  const insertPart = source.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)");
  for (const part of parts) {
    const partTime = Date.parse(part.time ?? time);
    insertPart.run(part.id, id, sessionId, partTime, partTime, typeof part.data === "string" ? part.data : JSON.stringify(part.data));
  }
}

function hashSqliteFiles(path: string): [string, string][] {
  return [path, `${path}-wal`, `${path}-shm`]
    .filter(existsSync)
    .map((file) => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]);
}

let tmp: string;
let db: DB;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "motor-act-"));
  const dir = join(tmp, "projX", "memory"); // sin memoria, pero crea proj dir
  mkdirSync(join(tmp, "projX"), { recursive: true });
  void dir;
  copyFileSync(fx("deterministic.jsonl"), join(tmp, "projX", "sesion1.jsonl"));
  db = openDb(join(tmp, "motor.db"));
  await ingestAll(db, { projectsRoot: tmp, pricing: await loadPricing() });
});
afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe("getActivity", () => {
  it("agrupa sesiones por día (ended_at), más reciente primero", () => {
    const days = getActivity(db);
    // la sesión terminó el 2026-07-02 (max ts de deterministic)
    expect(days[0].day).toBe("2026-07-02");
    expect(days[0].sessions).toHaveLength(1);
    const s = days[0].sessions[0];
    expect(s.id).toBe("sesion1");
    expect(s.project).toBe("projX");
    expect(s.turns).toBe(4);
    expect(s.models).toContain("claude-opus-4-8");
  });

  it("pagina por cursor estable y filtra por proyecto/agente/modelo", () => {
    db.prepare("INSERT INTO sessions (id, agent, project, started_at, ended_at, turns) VALUES (?, ?, ?, ?, ?, ?)").run("older", "codex", "otro", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z", 1);
    db.prepare("INSERT INTO usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("older-event", "older", "2026-07-01T00:00:00Z", "2026-07-01", "gpt-test", 1, 1, 0, 0, 0);
    const first = getActivityPage(db, { limit: 1 });
    expect(first.days[0].sessions[0].id).toBe("sesion1");
    expect(first.nextCursor).toBeTruthy();
    const second = getActivityPage(db, { limit: 1, cursor: first.nextCursor! });
    expect(second.days[0].sessions[0].id).toBe("older");
    expect(getActivityPage(db, { project: "otro" }).days[0].sessions[0].id).toBe("older");
    expect(getActivityPage(db, { agent: "codex", model: "gpt-test" }).days[0].sessions[0].id).toBe("older");
  });
});

describe("getSessionDetail", () => {
  it("desglosa tokens/costo por modelo", () => {
    const d = getSessionDetail(db, "sesion1")!;
    expect(d).not.toBeNull();
    const models = d.models.map((m) => m.model).sort();
    expect(models).toEqual(["claude-ghost-9", "claude-haiku-4-5", "claude-opus-4-8"]);
    // total = 36.75 + 1 + 0 + 25 = 62.75
    expect(d.totalCostUsd).toBeCloseTo(62.75, 6);
    const ghost = d.models.find((m) => m.model === "claude-ghost-9")!;
    expect(ghost.costUsd).toBe(0);
  });

  it("sesión inexistente => null", () => {
    expect(getSessionDetail(db, "no-existe")).toBeNull();
  });
});

describe("getSessionTurns — prompts bajo demanda (no se guardan en la DB)", () => {
  it("devuelve prompt + hora HH:MM y atribuye el costo hasta el prompt siguiente", async () => {
    const turns = (await getSessionTurns(db, "sesion1"))!;
    expect(turns).not.toBeNull();
    // deterministic.jsonl no tiene mensajes user => lista vacía, sin lanzar
    expect(Array.isArray(turns)).toBe(true);
  });

  it("sesión inexistente => null", async () => {
    expect(await getSessionTurns(db, "no-existe")).toBeNull();
  });

  it("la DB nunca almacena el texto del prompt", () => {
    const cols = (db.prepare("PRAGMA table_info(usage_events)").all() as { name: string }[]).map((c) => c.name);
    expect(cols.some((c) => /prompt|text|content/i.test(c))).toBe(false);
  });
});

describe("getSessionTurns — parsing real de prompts", () => {
  let tmp2: string;
  let db2: DB;
  beforeEach(async () => {
    tmp2 = mkdtempSync(join(tmpdir(), "motor-turns-"));
    mkdirSync(join(tmp2, "projP"), { recursive: true });
    copyFileSync(fx("prompts.jsonl"), join(tmp2, "projP", "prompts.jsonl"));
    db2 = openDb(join(tmp2, "motor.db"));
    await ingestAll(db2, { projectsRoot: tmp2, pricing: await loadPricing() });
  });
  afterEach(() => {
    db2.close();
    rmSync(tmp2, { recursive: true, force: true });
  });

  it("extrae prompts (string y bloques), salta tool_result y limpia system-reminder", async () => {
    const turns = (await getSessionTurns(db2, "prompts", "UTC"))!; // UTC explícito: no depender de la máquina
    expect(turns).toHaveLength(2); // el tool_result no cuenta como prompt
    expect(turns[0].prompt).toBe("arregla el parser de costos");
    expect(turns[0].time).toBe("09:15");
    expect(turns[1].prompt).toBe("ahora corre los tests");
    expect(turns[1].time).toBe("11:07");
  });

  it("atribuye el costo de cada respuesta a su prompt", async () => {
    const turns = (await getSessionTurns(db2, "prompts", "UTC"))!; // UTC explícito: no depender de la máquina
    expect(turns[0].costUsd).toBeCloseTo(5.0, 6); // 1M input opus @ $5/M = $5
    expect(turns[1].costUsd).toBeCloseTo(2.0, 6); // 2M input haiku @ $1/M = $2
  });

  it("busca prompts sin persistirlos", async () => {
    const tables = (db2.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    expect(tables.some((t) => /prompt/i.test(t))).toBe(false);
    const results = await searchPrompts(db2, "parser");
    expect(results[0]?.id).toBe("prompts");
    expect(results[0]?.prompt).toContain("parser");
    // sigue sin haber tabla de prompts tras la búsqueda
    const tablesAfter = (db2.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    expect(tablesAfter).toEqual(tables);
  });

  it("múltiples coincidencias en una sesión aportan múltiples resultados", async () => {
    // "os" está en "costos" (prompt 1) y en "los tests" (prompt 2)
    const results = await searchPrompts(db2, "os");
    expect(results.filter((r) => r.id === "prompts")).toHaveLength(2);
  });
});

describe("getSessionTurns — Codex formato actual (response_item)", () => {
  let tmpC: string;
  let dbC: DB;
  beforeEach(() => {
    tmpC = mkdtempSync(join(tmpdir(), "motor-codex-"));
    copyFileSync(fx("codex-prompts.jsonl"), join(tmpC, "rollout.jsonl"));
    dbC = openDb(join(tmpC, "motor.db"));
    dbC
      .prepare(
        "INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path) VALUES (?, 'codex', 'cx', ?, ?, 2, ?)",
      )
      .run("cx", "2026-09-20T10:00:00.000Z", "2026-09-20T10:05:00.000Z", join(tmpC, "rollout.jsonl"));
  });
  afterEach(() => {
    dbC.close();
    rmSync(tmpC, { recursive: true, force: true });
  });

  it("extrae prompts input_text y el legado user_message; descarta AGENTS.md y assistant", async () => {
    const turns = (await getSessionTurns(dbC, "cx", "UTC"))!;
    expect(turns.map((t) => t.prompt)).toEqual([
      "por qué falla el deploy en staging",
      "formato legado: revisa los logs",
    ]);
  });

  it("searchPrompts encuentra texto del formato actual", async () => {
    const results = await searchPrompts(dbC, "staging");
    expect(results).toHaveLength(1);
    expect(results[0].prompt).toContain("staging");
  });

  it("fuente binaria no SQLite (.db) devuelve vacío sin lanzar", async () => {
    const binPath = join(tmpC, "opencode.db");
    writeFileSync(binPath, "not a SQLite database; needle text");
    dbC
      .prepare(
        "INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path) VALUES (?, 'opencode', 'oc', ?, ?, 0, ?)",
      )
      .run("oc", "2026-09-20T11:00:00.000Z", "2026-09-20T11:00:00.000Z", binPath);
    await expect(getSessionTurns(dbC, "oc", "UTC")).resolves.toEqual([]);
    await expect(searchPrompts(dbC, "needle")).resolves.toHaveLength(0);
  });
});

describe("OpenCode prompts desde snapshot SQLite", () => {
  let sourcePath: string;
  let source: import("better-sqlite3").Database;

  beforeEach(() => {
    sourcePath = join(tmp, "opencode.db");
    source = new Database(sourcePath);
    source.pragma("journal_mode = WAL");
    source.pragma("wal_autocheckpoint = 0");
    source.exec(`
      CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INT, time_updated INT, data TEXT);
      CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INT, time_updated INT, data TEXT);
    `);
    addOpenCodeMessage(source, "a1", "ses_a", "2026-09-21T10:00:00.000Z", "user", [
      { id: "a1-text", data: { type: "text", text: "needle first OpenCode prompt" } },
      { id: "a1-bad", data: "{malformed-json" },
    ]);
    addOpenCodeMessage(source, "a2", "ses_a", "2026-09-21T10:05:00.000Z", "user", [
      { id: "a2-one", data: { type: "text", text: "two part" } },
      { id: "a2-two", data: { type: "text", text: "prompt with needle" }, time: "2026-09-21T10:05:01.000Z" },
    ]);
    addOpenCodeMessage(source, "a3", "ses_a", "2026-09-21T10:10:00.000Z", "user", [
      { id: "a3-text", data: { type: "text", text: "third prompt" } },
      { id: "a3-synthetic", data: { type: "text", text: "<system-reminder>private injected text</system-reminder>", synthetic: true } },
      { id: "a3-ignored", data: { type: "text", text: "ignored injected text", ignored: true } },
    ]);
    addOpenCodeMessage(source, "a-assistant", "ses_a", "2026-09-21T10:11:00.000Z", "assistant", [
      { id: "assistant-text", data: { type: "text", text: "assistant response" } },
    ]);
    addOpenCodeMessage(source, "a-file", "ses_a", "2026-09-21T10:12:00.000Z", "user", [
      { id: "file-part", data: { type: "file", text: "file part text" } },
    ]);
    addOpenCodeMessage(source, "b1", "ses_b", "2026-09-22T12:00:00.000Z", "user", [
      { id: "b1-text", data: { type: "text", text: "needle from session b" } },
    ]);
    addOpenCodeMessage(source, "empty-assistant", "ses_empty", "2026-09-22T12:10:00.000Z", "assistant", [
      { id: "empty-text", data: { type: "text", text: "no user prompt here" } },
    ]);

    const insertSession = db.prepare(
      "INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path) VALUES (?, 'opencode', 'oc-project', ?, ?, 1, ?)",
    );
    for (const [id, startedAt, endedAt] of [
      ["ses_a", "2026-09-21T10:00:00.000Z", "2026-09-21T10:12:00.000Z"],
      ["ses_b", "2026-09-22T12:00:00.000Z", "2026-09-22T12:00:00.000Z"],
      ["ses_empty", "2026-09-22T12:10:00.000Z", "2026-09-22T12:10:00.000Z"],
      ["ses_missing", "2026-09-22T12:20:00.000Z", "2026-09-22T12:20:00.000Z"],
    ]) insertSession.run(id, startedAt, endedAt, sourcePath);
    db.prepare(
      "INSERT INTO usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("oc-a", "ses_a", "2026-09-21T10:12:00.000Z", "2026-09-21", "opencode-model", 333, 333, 167, 167, 0.1);
    db.prepare("INSERT INTO usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("oc-b", "ses_b", "2026-09-22T12:00:00.000Z", "2026-09-22", "opencode-model", 10, 10, 5, 5, 0.03);
    db.prepare("INSERT INTO usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("oc-empty", "ses_empty", "2026-09-22T12:10:00.000Z", "2026-09-22", "opencode-model", 10, 10, 0, 0, 0.02);
    db.prepare("INSERT INTO usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("oc-missing", "ses_missing", "2026-09-22T12:20:00.000Z", "2026-09-22", "opencode-model", 10, 10, 0, 0, 0.04);
  });

  afterEach(() => {
    if (source.open) source.close();
  });

  it("extrae solo mensajes user/texto, une partes y omite synthetic, file y JSON malformado", async () => {
    const prompts = await opencodePrompts(sourcePath, ["ses_a"]);
    expect(prompts.get("ses_a")).toEqual([
      { ts: "2026-09-21T10:00:00.000Z", prompt: "needle first OpenCode prompt" },
      { ts: "2026-09-21T10:05:00.000Z", prompt: "two part prompt with needle" },
      { ts: "2026-09-21T10:10:00.000Z", prompt: "third prompt" },
    ]);
    const text = prompts.get("ses_a")?.map((item) => item.prompt).join(" ") ?? "";
    expect(text).not.toMatch(/assistant response|file part text|private injected text|ignored injected text|system-reminder/);
    expect(await opencodePrompts(sourcePath, [])).toEqual(new Map());
  });

  it("reparte costo y tokens por turno con residuo en el último", async () => {
    const turns = await getSessionTurns(db, "ses_a", "UTC");
    expect(turns).toHaveLength(3);
    expect(turns?.[0]).toMatchObject({ ts: "2026-09-21T10:00:00.000Z", time: "10:00" });
    expect(turns?.reduce((sum, turn) => sum + turn.tokens, 0)).toBe(1000);
    expect(turns?.reduce((sum, turn) => sum + turn.costUsd, 0)).toBeCloseTo(0.1, 12);
    expect(await getSessionTurns(db, "ses_empty", "UTC")).toEqual([]);
    expect(await getSessionTurns(db, "ses_missing", "UTC")).toEqual([]);
  });

  it("evenSplit conserva exactamente el total en n=1 y con residuo", () => {
    expect(evenSplit(0.1, 1, 1e6)).toEqual([0.1]);
    expect(evenSplit(1000, 1, 1)).toEqual([1000]);
    expect(evenSplit(0.1, 3, 1e6).reduce((sum, n) => sum + n, 0)).toBe(0.1);
    expect(evenSplit(1000, 3, 1).reduce((sum, n) => sum + n, 0)).toBe(1000);
  });

  it("busca en SQLite y conserva el orden de recencia y el límite junto a JSONL", async () => {
    const jsonlPath = join(tmp, "recent.jsonl");
    writeFileSync(jsonlPath, `${JSON.stringify({ type: "user", timestamp: "2026-09-23T12:00:00.000Z", message: { content: "needle from newer JSONL" } })}\n`);
    db.prepare(
      "INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path) VALUES ('json_recent', 'codex', 'json-project', ?, ?, 1, ?)",
    ).run("2026-09-23T11:59:00.000Z", "2026-09-23T12:00:00.000Z", jsonlPath);
    const dbResults = await searchPrompts(db, "OpenCode prompt");
    expect(dbResults.map((result) => result.id)).toEqual(["ses_a"]);
    const mixed = await searchPrompts(db, "needle", 3);
    expect(mixed.map((result) => result.id)).toEqual(["json_recent", "ses_b", "ses_a"]);
    expect(await searchPrompts(db, "needle", 1)).toHaveLength(1);
  });

  it("no modifica la DB OpenCode ni sus sidecars WAL/SHM", async () => {
    source.close();
    await opencodePrompts(sourcePath, ["ses_a"]); // estabiliza sidecars WAL/SHM creados por SQLite en solo-lectura
    const before = hashSqliteFiles(sourcePath);
    await getSessionTurns(db, "ses_a", "UTC");
    await searchPrompts(db, "needle");
    expect(hashSqliteFiles(sourcePath)).toEqual(before);
  });
});

describe("getSessionTurns — zona horaria configurable", () => {
  it("formatea HH:MM en la zona pedida (America/Merida = UTC-6)", async () => {
    // el fixture tiene un prompt a las 09:15Z => 03:15 en Mérida
    const tmp3 = mkdtempSync(join(tmpdir(), "motor-tz-"));
    mkdirSync(join(tmp3, "projT"), { recursive: true });
    copyFileSync(fx("prompts.jsonl"), join(tmp3, "projT", "prompts.jsonl"));
    const db3 = openDb(join(tmp3, "motor.db"));
    await ingestAll(db3, { projectsRoot: tmp3, pricing: await loadPricing() });

    const merida = (await getSessionTurns(db3, "prompts", "America/Merida"))!;
    expect(merida[0].time).toBe("03:15");
    const utc = (await getSessionTurns(db3, "prompts", "UTC"))!;
    expect(utc[0].time).toBe("09:15");
    // zona inválida no rompe: cae al slice UTC
    const bad = (await getSessionTurns(db3, "prompts", "Nope/Nope"))!;
    expect(bad[0].time).toBe("09:15");

    db3.close();
    rmSync(tmp3, { recursive: true, force: true });
  });
});

describe("día calendario en la zona del usuario (no UTC)", () => {
  it("un evento nocturno cae en el día LOCAL, no en el día UTC siguiente", async () => {
    const { dayInTz } = await import("../src/lib/time.js");
    // 2026-08-01T03:58Z = 2026-07-31 21:58 en Mérida (UTC-6)
    expect(dayInTz("2026-08-01T03:58:00.000Z", "America/Merida")).toBe("2026-07-31");
    expect(dayInTz("2026-08-01T03:58:00.000Z", "UTC")).toBe("2026-08-01");
    expect(dayInTz("2026-08-01T03:58:00.000Z", "Nope/Nope")).toBe("2026-08-01"); // zona inválida => UTC
  });

  it("la ingesta guarda el día ya convertido a la zona configurada", async () => {
    const tmp4 = mkdtempSync(join(tmpdir(), "motor-day-"));
    mkdirSync(join(tmp4, "projD"), { recursive: true });
    copyFileSync(fx("prompts.jsonl"), join(tmp4, "projD", "prompts.jsonl"));
    const db4 = openDb(join(tmp4, "motor.db"));
    // el fixture tiene un evento 2026-07-05T09:15:30Z => 03:15 del 07-05 en Mérida
    await ingestAll(db4, { projectsRoot: tmp4, pricing: await loadPricing(), timeZone: "America/Merida" });
    const days = (db4.prepare("SELECT DISTINCT day FROM usage_events ORDER BY day").all() as { day: string }[]).map((r) => r.day);
    expect(days).toEqual(["2026-07-05"]);
    db4.close();
    rmSync(tmp4, { recursive: true, force: true });
  });
});
