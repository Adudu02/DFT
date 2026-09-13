import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { getSummary } from "../src/lib/summary.js";
import { loadPricing, type Pricing } from "../src/lib/pricing.js";
import type { DB } from "../src/lib/db.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, "fixtures", name);

let tmp: string;
let pricing: Pricing;

/** Crea projects/<proj>/<file>.jsonl copiando un fixture. */
function seedProject(root: string, proj: string, file: string, fromFixture: string) {
  const dir = join(root, proj);
  mkdirSync(dir, { recursive: true });
  copyFileSync(fixture(fromFixture), join(dir, file));
}

function countEvents(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM usage_events").get() as { n: number }).n;
}

beforeAll(async () => {
  pricing = await loadPricing();
});
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "motor-test-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function freshDb(): DB {
  return openDb(join(tmp, "motor.db"));
}

describe("ingestAll", () => {
  it("inserta solo eventos unicos del transcript (dedup por dedup_key)", async () => {
    seedProject(tmp, "proj-A", "s1.jsonl", "deterministic.jsonl");
    const db = freshDb();
    const summary = await ingestAll(db, { projectsRoot: join(tmp), pricing });
    // deterministic: opus d1 (triplicado->1), haiku d1, ghost d1, opus d2 = 4
    expect(summary.eventsInserted).toBe(4);
    expect(countEvents(db)).toBe(4);
    expect(summary.unknownModels).toEqual(["claude-ghost-9"]);
    db.close();
  });

  it("incremental: segunda pasada sin cambios no inserta nada", async () => {
    seedProject(tmp, "proj-A", "s1.jsonl", "deterministic.jsonl");
    const db = freshDb();
    await ingestAll(db, { projectsRoot: tmp, pricing });
    const second = await ingestAll(db, { projectsRoot: tmp, pricing });
    expect(second.eventsInserted).toBe(0);
    expect(second.filesChanged).toBe(0);
    expect(countEvents(db)).toBe(4);
    db.close();
  });

  it("incremental: lineas nuevas se agregan sin re-contar las viejas", async () => {
    const dir = join(tmp, "proj-A");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "s1.jsonl");
    const line = (id: string, model: string) =>
      JSON.stringify({
        type: "assistant", timestamp: "2026-07-01T09:00:00.000Z", sessionId: "s1", requestId: id,
        message: { id, model, usage: { input_tokens: 1000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
      });
    writeFileSync(path, `${line("r1", "claude-opus-4-8")}\n`);
    const db = freshDb();
    const a = await ingestAll(db, { projectsRoot: tmp, pricing });
    expect(a.eventsInserted).toBe(1);
    // append una linea nueva
    writeFileSync(path, `${line("r1", "claude-opus-4-8")}\n${line("r2", "claude-opus-4-8")}\n`);
    const b = await ingestAll(db, { projectsRoot: tmp, pricing });
    expect(b.eventsInserted).toBe(1); // solo la nueva
    expect(countEvents(db)).toBe(2);
    db.close();
  });

  it("dedup cross-archivo: mismo dedup_key en dos sesiones cuenta una vez", async () => {
    seedProject(tmp, "proj-A", "one.jsonl", "deterministic.jsonl");
    seedProject(tmp, "proj-B", "two.jsonl", "deterministic.jsonl");
    const db = freshDb();
    const summary = await ingestAll(db, { projectsRoot: tmp, pricing });
    expect(countEvents(db)).toBe(4); // no 8
    expect(summary.eventsInserted).toBe(4);
    db.close();
  });
});

describe("getSummary sobre DB ingerida", () => {
  it("agrega gasto/tokens/actividad/racha correctamente", async () => {
    seedProject(tmp, "proj-A", "s1.jsonl", "deterministic.jsonl");
    const db = freshDb();
    await ingestAll(db, { projectsRoot: tmp, pricing });
    const s = getSummary(db, pricing);

    expect(s.to).toBe("2026-07-02"); // ultimo dia con datos
    expect(s.totalCostUsd).toBeCloseTo(62.75, 6); // 36.75 + 1 + 0 + 25
    expect(s.activity.turns).toBe(4);
    expect(s.activity.projects).toBe(1);
    expect(s.streakDays).toBe(2); // 07-01 y 07-02 consecutivos
    expect(s.unknownModels).toEqual(["claude-ghost-9"]);

    const opus = s.perModel.find((m) => m.model === "claude-opus-4-8")!;
    expect(opus.costUsd).toBeCloseTo(61.75, 6); // 36.75 + 25
    const ghost = s.perModel.find((m) => m.model === "claude-ghost-9")!;
    expect(ghost.costUsd).toBe(0);
    expect(ghost.known).toBe(false);

    // criterio §7: suma por modelo == total (±0.01)
    const sumModels = s.perModel.reduce((n, m) => n + m.costUsd, 0);
    expect(Math.abs(sumModels - s.totalCostUsd)).toBeLessThanOrEqual(0.01);
    db.close();
  });

  it("DB vacia => summary con ceros y sin lanzar", async () => {
    const db = freshDb();
    const s = getSummary(db, pricing);
    expect(s.totalCostUsd).toBe(0);
    expect(s.daily).toEqual([]);
    expect(s.streakDays).toBe(0);
    db.close();
  });
});
