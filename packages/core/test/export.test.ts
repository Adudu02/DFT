import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type DB } from "../src/lib/db.js";
import { exportCsv, getExportData } from "../src/lib/export.js";

const HEADERS =
  "recordType,id,agent,project,startedAt,endedAt,turns,dedupKey,sessionId,ts,day,model,inputTokens,outputTokens,cacheWriteTokens,cacheReadTokens,costUsd";

let tmp: string;
let db: DB;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "motor-export-"));
  db = openDb(join(tmp, "motor.db"));
});

afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe("exportCsv", () => {
  it("DB vacía = solo cabecera + salto final", () => {
    const csv = exportCsv({ sessions: [], usageEvents: [] });
    expect(csv).toBe(`${HEADERS}\n`);
  });

  it("escapa comas, comillas y saltos de línea; nulls quedan vacíos", () => {
    db.prepare("INSERT INTO sessions (id, agent, project, started_at, ended_at, turns) VALUES (?, ?, ?, ?, ?, ?)").run(
      "s1",
      "codex",
      'proy, "grande"',
      "2026-01-01T00:00:00Z",
      null,
      2,
    );
    db.prepare("INSERT INTO usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "e1",
      "s1",
      "2026-01-01T01:00:00Z",
      "2026-01-01",
      "mo\ndel",
      1,
      2,
      0,
      0,
      0.5,
    );

    const csv = exportCsv(getExportData(db));

    // El proyecto sale citado con la comilla interna doblada; ended_at null → vacío.
    expect(csv).toContain('"proy, ""grande"""');
    // El \n del model vive DENTRO de la celda citada (la fila ocupa 2 líneas físicas
    // al hacer split ingenuo): eso es CSV correcto, no un salto de registro.
    expect(csv).toContain('"mo\ndel",1,2,0,0,0.5');
    expect(csv.trimEnd().split("\n")).toHaveLength(4); // cabecera + session + event(2 líneas físicas)
  });

  it("ordena sesiones y eventos por recencia DESC", () => {
    db.prepare("INSERT INTO sessions (id, agent, project, started_at, ended_at, turns) VALUES (?, ?, ?, ?, ?, ?)").run(
      "vieja",
      "codex",
      "p",
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      1,
    );
    db.prepare("INSERT INTO sessions (id, agent, project, started_at, ended_at, turns) VALUES (?, ?, ?, ?, ?, ?)").run(
      "nueva",
      "codex",
      "p",
      "2026-02-01T00:00:00Z",
      "2026-02-01T00:00:00Z",
      1,
    );
    db.prepare("INSERT INTO usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "e-viejo",
      "vieja",
      "2026-01-01T00:00:00Z",
      "2026-01-01",
      "m",
      1,
      1,
      0,
      0,
      0,
    );
    db.prepare("INSERT INTO usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "e-nuevo",
      "nueva",
      "2026-02-01T00:00:00Z",
      "2026-02-01",
      "m",
      1,
      1,
      0,
      0,
      0,
    );

    const data = getExportData(db);
    expect(data.sessions.map((s) => s.id)).toEqual(["nueva", "vieja"]);
    expect(data.usageEvents.map((e) => e.dedupKey)).toEqual(["e-nuevo", "e-viejo"]);

    const lines = exportCsv(data).trimEnd().split("\n");
    expect(lines[1]).toContain(",nueva,");
    expect(lines[3]).toContain(",e-nuevo,");
  });

  it("contrato de privacidad: solo métricas, nunca prompts", () => {
    db.prepare("INSERT INTO sessions (id, agent, project, started_at, ended_at, turns) VALUES (?, ?, ?, ?, ?, ?)").run(
      "s1",
      "codex",
      "p",
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      1,
    );
    const csv = exportCsv(getExportData(db));
    expect(csv).not.toContain("prompt");
  });
});
