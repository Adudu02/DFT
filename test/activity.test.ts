import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { getActivity, getActivityPage, getSessionDetail, getSessionTurns, searchPrompts } from "../src/lib/activity.js";
import { loadPricing } from "../src/lib/pricing.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

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
    const before = (db2.prepare("SELECT COUNT(*) AS n FROM memory_nodes").get() as { n: number }).n;
    const results = await searchPrompts(db2, "parser");
    expect(results[0]?.id).toBe("prompts");
    expect(results[0]?.prompt).toContain("parser");
    expect((db2.prepare("SELECT COUNT(*) AS n FROM memory_nodes").get() as { n: number }).n).toBe(before);
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
