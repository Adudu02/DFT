/**
 * Updater de pricing (add-pricing-auto-updater §2): mapper de LiteLLM,
 * merge con precedencias y runPricingUpdate inyectable — todo sin red.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mapLiteLLM, mergePricing, runPricingUpdate } from "../src/lib/pricing-update.js";
import { loadPricing, type Pricing } from "../src/lib/pricing.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(here, "fixtures", "litellm-trimmed.json"), "utf8"));

const fakeFetch = (body: unknown, ok = true, status = 200): typeof fetch =>
  (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;

describe("mapLiteLLM", () => {
  it("convierte per-token a per-millón con 6 decimales", () => {
    const mapped = mapLiteLLM(FIXTURE);
    expect(mapped["gpt-6-astra"]).toEqual({ input: 10, output: 50 });
    expect(mapped["claude-haiku-4-5"]).toEqual({ input: 0.8, output: 4 });
  });
  it("filtra mode no-chat/responses (embeddings)", () => {
    expect(mapLiteLLM(FIXTURE)["text-embedding-3-small"]).toBeUndefined();
  });
  it("excluye variantes de tier", () => {
    expect(mapLiteLLM(FIXTURE)["gpt-6-astra_batches"]).toBeUndefined();
  });
  it("excluye entradas sin ambos costos", () => {
    expect(mapLiteLLM(FIXTURE)["no-cost-model"]).toBeUndefined();
  });
  it("quita prefijo de proveedor", () => {
    const mapped = mapLiteLLM(FIXTURE);
    expect(mapped["gpt-4o"]).toEqual({ input: 2.5, output: 10 });
    expect(Object.keys(mapped).some((k) => k.includes("/"))).toBe(false);
  });
  it("rechaza fuente que no es objeto plano", () => {
    expect(() => mapLiteLLM([1, 2])).toThrowError(/objeto plano/);
  });
});

describe("mergePricing — precedencia override > litellm > local", () => {
  const current: Pricing = {
    models: {
      "claude-haiku-4-5": { input: 1, output: 5 }, // cambia por LiteLLM
      "legacy-local": { input: 2, output: 2 }, // solo local: se preserva
    },
    verified_at: "2026-08-19T00:00:00Z",
  };
  const litellm = mapLiteLLM(FIXTURE);
  const overrides = { "claude-haiku-4-5": { input: 9, output: 9 } };

  it("override gana y queda registrado", () => {
    const { pricing } = mergePricing(current, litellm, overrides);
    expect(pricing.models["claude-haiku-4-5"]).toEqual({ input: 9, output: 9 });
    expect(pricing.sources?.["claude-haiku-4-5"]).toBe("override");
  });
  it("modelo solo-local se preserva con origen local y cae en missingRate", () => {
    const { pricing, missingRate } = mergePricing(current, litellm, overrides);
    expect(pricing.models["legacy-local"]).toEqual({ input: 2, output: 2 });
    expect(pricing.sources?.["legacy-local"]).toBe("local");
    expect(missingRate).toContain("legacy-local");
  });
  it("modelos nuevos de la fuente quedan added con origen litellm", () => {
    const { pricing, added } = mergePricing(current, litellm, overrides);
    expect(added).toContain("gpt-6-astra");
    expect(pricing.sources?.["gpt-6-astra"]).toBe("litellm");
  });
  it("updated/unchanged comparan la tarifa final contra la local", () => {
    const { updated, unchanged } = mergePricing(current, litellm, overrides);
    expect(updated).toContain("claude-haiku-4-5"); // 9/9 ≠ 1/5
    expect(unchanged).toEqual([]); // legacy-local no compara: se preserva
  });
});

describe("runPricingUpdate — inyectable, sin tocar el archivo ante fallo", () => {
  let tmp: string;
  let pricingPath: string;
  let overridesPath: string;
  const current: Pricing = { models: { "claude-haiku-4-5": { input: 1, output: 5 }, "legacy-local": { input: 2, output: 2 } } };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "motor-pupd-"));
    pricingPath = join(tmp, "pricing.json");
    overridesPath = join(tmp, "pricing-overrides.json");
    writeFileSync(pricingPath, JSON.stringify(current));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("éxito: escribe verified_at/source_url/sources y reporta", async () => {
    writeFileSync(overridesPath, JSON.stringify({ models: { "claude-haiku-4-5": { input: 9, output: 9 } } }));
    const report = await runPricingUpdate({
      fetchImpl: fakeFetch(FIXTURE),
      url: "https://example/litellm.json",
      now: () => new Date("2026-09-13T12:00:00Z"),
      pricingPath,
      overridesPath,
    });
    expect(report.error).toBeUndefined();
    expect(report.added).toContain("gpt-6-astra");
    expect(report.updated).toContain("claude-haiku-4-5"); // override 9/9 vs local 1/5
    expect(report.missingRate).toContain("legacy-local");
    const saved = await loadPricing(pricingPath);
    expect(saved.verified_at).toBe("2026-09-13T12:00:00.000Z");
    expect(saved.source_url).toBe("https://example/litellm.json");
    expect(saved.sources?.["gpt-6-astra"]).toBe("litellm");
    expect(saved.sources?.["claude-haiku-4-5"]).toBe("override");
  });
  it("sin overrides: LiteLLM manda directo", async () => {
    const report = await runPricingUpdate({ fetchImpl: fakeFetch(FIXTURE), pricingPath, overridesPath });
    expect(report.error).toBeUndefined();
    const saved = await loadPricing(pricingPath);
    expect(saved.models["claude-haiku-4-5"]).toEqual({ input: 0.8, output: 4 });
  });
  it("HTTP 404: error y archivo intacto", async () => {
    const before = readFileSync(pricingPath, "utf8");
    const report = await runPricingUpdate({ fetchImpl: fakeFetch({}, false, 404), pricingPath, overridesPath });
    expect(report.error).toMatch(/HTTP 404/);
    expect(readFileSync(pricingPath, "utf8")).toBe(before);
  });
  it("JSON corrupto: error y archivo intacto", async () => {
    const before = readFileSync(pricingPath, "utf8");
    const report = await runPricingUpdate({
      fetchImpl: (async () => ({ ok: true, status: 200, json: async () => JSON.parse("{{{") })) as unknown as typeof fetch,
      pricingPath,
      overridesPath,
    });
    expect(report.error).toBeTruthy();
    expect(readFileSync(pricingPath, "utf8")).toBe(before);
  });
  it("fetch que lanza (red caída): error y archivo intacto", async () => {
    const before = readFileSync(pricingPath, "utf8");
    const report = await runPricingUpdate({
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
      pricingPath,
      overridesPath,
    });
    expect(report.error).toMatch(/ECONNREFUSED/);
    expect(readFileSync(pricingPath, "utf8")).toBe(before);
  });
});
