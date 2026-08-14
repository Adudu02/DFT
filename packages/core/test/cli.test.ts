import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { extractUsageEvents } from "../src/adapters/claude-code.js";
import { CodexAdapter } from "../src/adapters/codex.js";
import { aggregate } from "../src/lib/aggregate.js";
import { loadPricing, type Pricing } from "../src/lib/pricing.js";
import type { NormalizedSession } from "../src/adapters/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");

function sessionFrom(name: string, jsonl: string): NormalizedSession {
  return { id: name, agent: "claude-code", project: "fixtures", events: extractUsageEvents(jsonl) };
}

describe("aggregate — tabla gasto/modelo/dia", () => {
  let pricing: Pricing;
  beforeAll(async () => {
    pricing = await loadPricing(); // usa data/pricing.json real
  });

  it("agrega por (dia, modelo) con costos correctos y ordena por dia/modelo", () => {
    const sessions = [sessionFrom("deterministic", read("deterministic.jsonl"))];
    const { rows, total, unknownModels } = aggregate(sessions, pricing);

    expect(rows.map((r) => `${r.day} ${r.model}`)).toEqual([
      "2026-07-01 claude-ghost-9",
      "2026-07-01 claude-haiku-4-5",
      "2026-07-01 claude-opus-4-8",
      "2026-07-02 claude-opus-4-8",
    ]);

    const byKey = Object.fromEntries(rows.map((r) => [`${r.day} ${r.model}`, r]));
    expect(byKey["2026-07-01 claude-opus-4-8"].costUsd).toBeCloseTo(36.75, 6);
    expect(byKey["2026-07-01 claude-haiku-4-5"].costUsd).toBeCloseTo(1.0, 6);
    expect(byKey["2026-07-01 claude-ghost-9"].costUsd).toBe(0); // sin tarifa
    expect(byKey["2026-07-02 claude-opus-4-8"].costUsd).toBeCloseTo(25.0, 6);

    // total = 36.75 + 1.00 + 0 + 25.00 = 62.75
    expect(total.costUsd).toBeCloseTo(62.75, 6);
    expect(unknownModels).toEqual(["claude-ghost-9"]);
  });

  it("criterio §7: suma por fila == total (±$0.01)", () => {
    const sessions = [sessionFrom("deterministic", read("deterministic.jsonl"))];
    const { rows, total } = aggregate(sessions, pricing);
    const sumRows = rows.reduce((n, r) => n + r.costUsd, 0);
    expect(Math.abs(sumRows - total.costUsd)).toBeLessThanOrEqual(0.01);
  });

  it("archivo sin usage no aporta filas", () => {
    const sessions = [sessionFrom("zero", read("zero-usage.jsonl"))];
    const { rows, total } = aggregate(sessions, pricing);
    expect(rows).toHaveLength(0);
    expect(total.costUsd).toBe(0);
  });

  it("fixtures reales anonimizados: costo total >= 0 y sin modelos desconocidos (todos en pricing)", () => {
    const sessions = [
      sessionFrom("printer", read("real-printer-android.jsonl")),
      sessionFrom("kitchen", read("real-kitchen-ai.jsonl")),
    ];
    const { total, unknownModels } = aggregate(sessions, pricing);
    expect(total.costUsd).toBeGreaterThan(0);
    expect(unknownModels).toEqual([]);
  });

  // Regresión QA: la tabla del CLI debe incluir TODOS los agentes, no solo Claude.
  it("agrega Claude + Codex juntos (modelos de ambos aparecen en la tabla)", async () => {
    const codex = await new CodexAdapter().parseSession(join(here, "fixtures", "codex-rollout.jsonl"));
    const sessions = [sessionFrom("deterministic", read("deterministic.jsonl")), codex];
    const { rows } = aggregate(sessions, pricing);
    const models = new Set(rows.map((r) => r.model));
    expect(models.has("claude-opus-4-8")).toBe(true); // Claude
    expect(models.has("gpt-5.5")).toBe(true); // Codex
  });
});
