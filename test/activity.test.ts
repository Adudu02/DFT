import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { getActivity, getSessionDetail } from "../src/lib/activity.js";
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
