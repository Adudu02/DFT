import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../src/lib/db.js";
import { ingestAll } from "../src/ingest.js";
import { loadPricing } from "../src/lib/pricing.js";
import { getWaste, DEFAULT_WASTE } from "../src/lib/waste.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

let tmp: string;
let db: DB;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "motor-waste-"));
  mkdirSync(join(tmp, "projX"), { recursive: true });
  copyFileSync(fx("deterministic.jsonl"), join(tmp, "projX", "sesion1.jsonl"));
  db = openDb(join(tmp, "motor.db"));
  await ingestAll(db, { projectsRoot: tmp, pricing: await loadPricing() });
});
afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe("getWaste — cache-miss (UC1)", () => {
  it("marca la sesión con bajo acierto de caché y estima el ahorro por tarifa", async () => {
    const pricing = await loadPricing();
    const { findings, totalEstUsd } = getWaste(db, pricing, DEFAULT_WASTE);

    const cache = findings.find((f) => f.kind === "cache-miss");
    expect(cache).toBeDefined();
    // input=3M (opus 1M + haiku 1M + ghost 1M), cacheRead=1M => ratio 0.25 < 0.7
    expect(cache?.metrics.cacheHitRatio).toBeCloseTo(0.25, 6);
    // ahorro = 0.9 * (opus 1M*5 + haiku 1M*1 + ghost sin tarifa 0)/1e6 = 0.9*6 = 5.4
    expect(cache?.estUsd).toBeCloseTo(5.4, 6);
    expect(totalEstUsd).toBeCloseTo(5.4, 6);
  });

  it("no marca cache-miss si el input no alcanza el piso", async () => {
    const pricing = await loadPricing();
    const { findings } = getWaste(db, pricing, { ...DEFAULT_WASTE, minInputTokens: 10_000_000 });
    expect(findings.some((f) => f.kind === "cache-miss")).toBe(false);
  });
});

describe("getWaste — tendencia (UC5)", () => {
  it("atribuye el ahorro al día de la sesión, sin snapshots", async () => {
    const pricing = await loadPricing();
    const { trend, totalEstUsd } = getWaste(db, pricing, DEFAULT_WASTE);
    // la sesión deterministic termina el 2026-07-02 (día del opus2)
    const day = trend.find((p) => p.day === "2026-07-02");
    expect(day).toBeDefined();
    expect(day?.estUsd).toBeCloseTo(5.4, 6);
    // el total de la tendencia coincide con el total del reporte
    expect(trend.reduce((n, p) => n + p.estUsd, 0)).toBeCloseTo(totalEstUsd, 6);
  });
});

describe("getWaste — model-mismatch (UC2)", () => {
  beforeEach(async () => {
    mkdirSync(join(tmp, "projMM"), { recursive: true });
    copyFileSync(fx("model-mismatch.jsonl"), join(tmp, "projMM", "mm.jsonl"));
    await ingestAll(db, { projectsRoot: tmp, pricing: await loadPricing() });
  });

  it("señala turnos triviales en opus y estima el ahorro vs el modelo destino", async () => {
    const pricing = await loadPricing();
    const { findings } = getWaste(db, pricing, DEFAULT_WASTE);
    const mm = findings.find((f) => f.kind === "model-mismatch" && f.sessionId === "mm");
    expect(mm).toBeDefined();
    expect(mm?.metrics.turns).toBe(3);
    // opus 3×(1000*5+500*25)/1e6 = 0.0525 ; sonnet-5 3×(1000*2+500*10)/1e6 = 0.021
    expect(mm?.estUsd).toBeCloseTo(0.0315, 6);
  });

  it("no señala si el modelo no es caro (sube el umbral de tarifa)", async () => {
    const pricing = await loadPricing();
    const { findings } = getWaste(db, pricing, { ...DEFAULT_WASTE, expensiveInputRate: 99 });
    expect(findings.some((f) => f.kind === "model-mismatch")).toBe(false);
  });
});

describe("getWaste — session-bloat (UC3)", () => {
  it("marca la sesión inflada al bajar el umbral, sin inventar $", async () => {
    const pricing = await loadPricing();
    const { findings } = getWaste(db, pricing, { ...DEFAULT_WASTE, bloatTurns: 3 });
    const bloat = findings.find((f) => f.kind === "session-bloat");
    expect(bloat).toBeDefined();
    expect(bloat?.estUsd).toBeUndefined(); // informativo
    expect(bloat?.estTokens).toBeGreaterThan(0);
  });

  it("con umbrales altos por defecto no hay bloat", async () => {
    const pricing = await loadPricing();
    const { findings } = getWaste(db, pricing, DEFAULT_WASTE);
    expect(findings.some((f) => f.kind === "session-bloat")).toBe(false);
  });
});
