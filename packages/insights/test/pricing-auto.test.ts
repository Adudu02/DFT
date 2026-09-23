/**
 * Config + auto-chequeo de pricing en insights (add-pricing-auto-updater §3).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, validateConfig } from "../src/config.js";
import { __resetAutoPricingCheckForTests, autoPricingCheck } from "../src/pricing-auto.js";
import type { PricingUpdateReport } from "how-much-did-u-waste-core";

describe("config — bloque pricing", () => {
  it("defaults: maxAgeDays 7, autoUpdate true", () => {
    expect(DEFAULT_CONFIG.pricing).toEqual({ maxAgeDays: 7, autoUpdate: true, source: "litellm" });
  });
  it("acepta litellm y modelsdev y rechaza una fuente inválida", () => {
    expect(() => validateConfig({ pricing: { source: "litellm" } })).not.toThrow();
    expect(() => validateConfig({ pricing: { source: "modelsdev" } })).not.toThrow();
    expect(() => validateConfig({ pricing: { source: "invalid" as never } })).toThrowError(/pricing.source/);
  });
  it("valida tipos (edad entera no negativa, autoUpdate booleano)", () => {
    expect(() => validateConfig({ pricing: { maxAgeDays: 3, autoUpdate: false } })).not.toThrow();
    expect(() => validateConfig({ pricing: { maxAgeDays: -1 } })).toThrowError(/pricing.maxAgeDays/);
    expect(() => validateConfig({ pricing: { maxAgeDays: 1.5 } })).toThrowError(/pricing.maxAgeDays/);
    expect(() => validateConfig({ pricing: { autoUpdate: "yes" as never } })).toThrowError(/pricing.autoUpdate/);
    expect(() => validateConfig({ pricing: { sorpresa: 1 } })).toThrowError(/pricing.sorpresa/);
  });
});

describe("config quota — proveedores Fase 2", () => {
  it("defaults: gemini/copilot/openrouter habilitados; geminiProjectId opcional", () => {
    expect(DEFAULT_CONFIG.quota.providers).toEqual({ claude: true, codex: true, zai: true, gemini: true, copilot: true, openrouter: true });
    expect(DEFAULT_CONFIG.quota.geminiProjectId).toBeUndefined();
  });
  it("valida los tres proveedores nuevos y rechaza desconocidos", () => {
    expect(() => validateConfig({ quota: { providers: { gemini: false, copilot: false, openrouter: false } } })).not.toThrow();
    expect(() => validateConfig({ quota: { providers: {Cursor: true} as never } })).toThrowError(/quota.providers/);
    expect(() => validateConfig({ quota: { geminiProjectId: "mi-proyecto" } })).not.toThrow();
    expect(() => validateConfig({ quota: { geminiProjectId: 42 } })).toThrowError(/geminiProjectId/);
  });
});

describe("autoPricingCheck — best-effort, una vez por sesión", () => {
  let tmp: string;
  let pricingPath: string;
  let runs: number;
  let selectedSources: string[] = [];

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const fakeRun = async (): Promise<PricingUpdateReport> => {
    runs++;
    return { updated: [], added: [], unchanged: [], missingRate: [] };
  };

  beforeEach(() => {
    __resetAutoPricingCheckForTests();
    tmp = mkdtempSync(join(tmpdir(), "motor-pauto-"));
    pricingPath = join(tmp, "pricing.json");
    runs = 0;
    selectedSources = [];
  });
  it("sin verified_at (unknown) => dispara el run exactamente una vez", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: { m: { input: 1, output: 1 } } }));
    const config = { ...DEFAULT_CONFIG };
    expect(await autoPricingCheck(config, { pricingPath, run: fakeRun })).toBe(true);
    expect(await autoPricingCheck(config, { pricingPath, run: fakeRun })).toBe(false); // una vez por sesión
    expect(runs).toBe(1);
  });
  it("verified_at inválido también dispara", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {}, verified_at: "no-es-una-fecha" }));
    expect(await autoPricingCheck({ ...DEFAULT_CONFIG }, { pricingPath, run: fakeRun })).toBe(true);
    expect(runs).toBe(1);
  });
  it("el mismo día local no dispara", async () => {
    const now = new Date();
    writeFileSync(pricingPath, JSON.stringify({ models: {}, verified_at: now.toISOString() }));
    expect(await autoPricingCheck({ ...DEFAULT_CONFIG }, { pricingPath, now: () => now, run: fakeRun })).toBe(false);
    expect(runs).toBe(0);
  });
  it("autoUpdate deshabilitado => nunca dispara", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {} }));
    const config = { ...DEFAULT_CONFIG, pricing: { ...DEFAULT_CONFIG.pricing, maxAgeDays: 7, autoUpdate: false } };
    expect(await autoPricingCheck(config, { pricingPath, run: fakeRun })).toBe(false);
    expect(runs).toBe(0);
  });
  it("stale => dispara", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {}, verified_at: "2026-08-01T00:00:00Z" }));
    expect(await autoPricingCheck({ ...DEFAULT_CONFIG }, { pricingPath, run: fakeRun })).toBe(true);
    expect(runs).toBe(1);
  });
  it("verified_at de otro día local dispara aunque siga fresh", async () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    writeFileSync(pricingPath, JSON.stringify({ models: {}, verified_at: yesterday.toISOString() }));
    const config = { ...DEFAULT_CONFIG, timeZone: "UTC" };
    expect(await autoPricingCheck(config, { pricingPath, now: () => now, run: fakeRun })).toBe(true);
    expect(runs).toBe(1);
  });
  it("pasa la fuente configurada a runPricingUpdate", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {} }));
    const run = async (opts: { source?: "litellm" | "modelsdev" }): Promise<PricingUpdateReport> => {
      selectedSources.push(opts.source ?? "");
      return { updated: [], added: [], unchanged: [], missingRate: [] };
    };
    const config = { ...DEFAULT_CONFIG, pricing: { ...DEFAULT_CONFIG.pricing, source: "modelsdev" as const } };
    await autoPricingCheck(config, { pricingPath, run });
    expect(selectedSources).toEqual(["modelsdev"]);
  });
  it("run que lanza => degrada en silencio (no propaga)", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {} }));
    const boom = async (): Promise<PricingUpdateReport> => {
      throw new Error("red caída");
    };
    await expect(autoPricingCheck({ ...DEFAULT_CONFIG }, { pricingPath, run: boom })).resolves.toBe(true);
  });
  it("llama onDone solo si el reporte no contiene error", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {} }));
    let done = 0;
    await autoPricingCheck({ ...DEFAULT_CONFIG }, {
      pricingPath,
      run: async () => ({ updated: [], added: [], unchanged: [], missingRate: [] }),
      onDone: () => { done++; },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(1);

    __resetAutoPricingCheckForTests();
    await autoPricingCheck({ ...DEFAULT_CONFIG }, {
      pricingPath,
      run: async () => ({ updated: [], added: [], unchanged: [], missingRate: [], error: "offline" }),
      onDone: () => { done++; },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(1);
  });
});
