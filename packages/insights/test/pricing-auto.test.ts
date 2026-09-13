/**
 * Config + auto-chequeo de pricing en insights (add-pricing-auto-updater §3).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, validateConfig } from "../src/config.js";
import { __resetAutoPricingCheckForTests, autoPricingCheck } from "../src/pricing-auto.js";
import type { PricingUpdateReport } from "motor-agentico-core";

describe("config — bloque pricing", () => {
  it("defaults: maxAgeDays 7, autoUpdate true", () => {
    expect(DEFAULT_CONFIG.pricing).toEqual({ maxAgeDays: 7, autoUpdate: true });
  });
  it("valida tipos (edad entera no negativa, autoUpdate booleano)", () => {
    expect(() => validateConfig({ pricing: { maxAgeDays: 3, autoUpdate: false } })).not.toThrow();
    expect(() => validateConfig({ pricing: { maxAgeDays: -1 } })).toThrowError(/pricing.maxAgeDays/);
    expect(() => validateConfig({ pricing: { maxAgeDays: 1.5 } })).toThrowError(/pricing.maxAgeDays/);
    expect(() => validateConfig({ pricing: { autoUpdate: "yes" as never } })).toThrowError(/pricing.autoUpdate/);
    expect(() => validateConfig({ pricing: { sorpresa: 1 } })).toThrowError(/pricing.sorpresa/);
  });
});

describe("autoPricingCheck — best-effort, una vez por sesión", () => {
  let tmp: string;
  let pricingPath: string;
  let runs: number;

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
  });
  it("sin verified_at (unknown) => dispara el run exactamente una vez", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: { m: { input: 1, output: 1 } } }));
    const config = { ...DEFAULT_CONFIG };
    expect(await autoPricingCheck(config, { pricingPath, run: fakeRun })).toBe(true);
    expect(await autoPricingCheck(config, { pricingPath, run: fakeRun })).toBe(false); // una vez por sesión
    expect(runs).toBe(1);
  });
  it("fresh => no dispara", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {}, verified_at: new Date().toISOString() }));
    expect(await autoPricingCheck({ ...DEFAULT_CONFIG }, { pricingPath, run: fakeRun })).toBe(false);
    expect(runs).toBe(0);
  });
  it("autoUpdate deshabilitado => nunca dispara", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {} }));
    const config = { ...DEFAULT_CONFIG, pricing: { maxAgeDays: 7, autoUpdate: false } };
    expect(await autoPricingCheck(config, { pricingPath, run: fakeRun })).toBe(false);
    expect(runs).toBe(0);
  });
  it("stale => dispara", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {}, verified_at: "2026-08-01T00:00:00Z" }));
    expect(await autoPricingCheck({ ...DEFAULT_CONFIG }, { pricingPath, run: fakeRun })).toBe(true);
    expect(runs).toBe(1);
  });
  it("run que lanza => degrada en silencio (no propaga)", async () => {
    writeFileSync(pricingPath, JSON.stringify({ models: {} }));
    const boom = async (): Promise<PricingUpdateReport> => {
      throw new Error("red caída");
    };
    await expect(autoPricingCheck({ ...DEFAULT_CONFIG }, { pricingPath, run: boom })).resolves.toBe(true);
  });
});
