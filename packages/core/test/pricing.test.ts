/**
 * Fundaciones del pricing updater (add-pricing-auto-updater §1):
 * validación con sources, escritura atómica, resolución normalizada y frescura.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRate, loadPricing, pricingAgeStatus, savePricing, UnknownModels, validatePricing } from "../src/lib/pricing.js";

const base = { models: { "claude-haiku-4-5": { input: 0.8, output: 4 } } };

describe("validatePricing — sources opcional", () => {
  it("acepta pricing sin sources (compat hacia atrás)", () => {
    expect(() => validatePricing(base)).not.toThrow();
  });
  it("acepta sources con valores litellm|override|local", () => {
    expect(() => validatePricing({ ...base, sources: { "claude-haiku-4-5": "litellm", x: "override", y: "local" } })).not.toThrow();
  });
  it("rechaza sources con valor desconocido", () => {
    expect(() => validatePricing({ ...base, sources: { m: "internet" } })).toThrowError(/sources/);
  });
});

describe("savePricing — escritura atómica", () => {
  const dirs: string[] = [];
  const path = () => {
    const d = mkdtempSync(join(tmpdir(), "motor-pricing-"));
    dirs.push(d);
    return join(d, "pricing.json");
  };
  it("escribe y relee el pricing completo", async () => {
    const p = path();
    await savePricing({ ...base, verified_at: "2026-09-13T00:00:00Z" } as never, p);
    const loaded = await loadPricing(p);
    expect(loaded.models["claude-haiku-4-5"]).toEqual({ input: 0.8, output: 4 });
    expect(existsSync(`${p}.tmp`)).toBe(false);
  });
  it("un fallo de validación deja el archivo previo intacto y sin .tmp", async () => {
    const p = path();
    await savePricing(base as never, p);
    const before = readFileSync(p, "utf8");
    await expect(savePricing({ models: { m: { input: -1, output: 0 } } } as never, p)).rejects.toThrowError(/inválid/);
    expect(readFileSync(p, "utf8")).toBe(before);
    expect(existsSync(`${p}.tmp`)).toBe(false);
  });
});

describe("getRate — resolución normalizada", () => {
  const pricing = {
    models: {
      "claude-haiku-4-5": { input: 0.8, output: 4 },
      "foo-2-20260101": { input: 1, output: 2 },
      "gpt-6-astra": { input: 10, output: 50 },
    },
  };
  it("match exacto", () => {
    expect(getRate(pricing as never, "claude-haiku-4-5")).toEqual({ input: 0.8, output: 4 });
  });
  it("sufijo de fecha resuelve al prefijo y no registra unknown", () => {
    const unknown = new UnknownModels();
    expect(getRate(pricing as never, "claude-haiku-4-5-20251001", unknown)).toEqual({ input: 0.8, output: 4 });
    expect(unknown.size).toBe(0);
  });
  it("match exacto prevalece sobre normalizado", () => {
    expect(getRate(pricing as never, "foo-2-20260101")).toEqual({ input: 1, output: 2 });
  });
  it("prefijo de proveedor se quita", () => {
    expect(getRate(pricing as never, "openai/gpt-6-astra")).toEqual({ input: 10, output: 50 });
  });
  it("sin candidato => null + unknown", () => {
    const unknown = new UnknownModels();
    expect(getRate(pricing as never, "misterio-9", unknown)).toBeNull();
    expect(unknown.list()).toEqual(["misterio-9"]);
  });
});

describe("pricingAgeStatus — frescura local", () => {
  const now = Date.parse("2026-09-13T12:00:00Z");
  it("sin verified_at => unknown", () => {
    expect(pricingAgeStatus(base as never, 7, now)).toEqual({ status: "unknown", ageDays: null });
  });
  it("dentro del TTL => fresh", () => {
    const p = { ...base, verified_at: "2026-09-10T12:00:00Z" };
    expect(pricingAgeStatus(p as never, 7, now).status).toBe("fresh");
  });
  it("más allá del TTL => stale con edad", () => {
    const p = { ...base, verified_at: "2026-09-01T12:00:00Z" };
    expect(pricingAgeStatus(p as never, 7, now)).toEqual({ status: "stale", ageDays: 12 });
  });
  it("fecha inválida => unknown", () => {
    const p = { ...base, verified_at: "no-una-fecha" };
    expect(pricingAgeStatus(p as never, 7, now).status).toBe("unknown");
  });
});
