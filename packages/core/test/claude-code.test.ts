import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { extractUsageEvents, ClaudeCodeAdapter } from "../src/adapters/claude-code.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);
const read = (name: string) => readFileSync(fx(name), "utf8");

describe("extractUsageEvents", () => {
  const events = extractUsageEvents(read("deterministic.jsonl"));

  it("dedup: un mismo (message.id + requestId) triplicado cuenta una vez", () => {
    const msgA = events.filter((e) => e.model === "claude-opus-4-8" && e.day === "2026-07-01");
    expect(msgA).toHaveLength(1);
  });

  it("excluye eventos con model <synthetic>", () => {
    expect(events.some((e) => e.model === "<synthetic>")).toBe(false);
  });

  it("salta lineas corruptas sin lanzar y conserva modelos desconocidos", () => {
    // ghost sigue siendo un evento (el precio se decide despues, no aqui)
    expect(events.some((e) => e.model === "claude-ghost-9")).toBe(true);
  });

  it("total de eventos unicos esperado = 4 (opus d1, haiku d1, ghost d1, opus d2)", () => {
    expect(events).toHaveLength(4);
  });

  it("deriva day = YYYY-MM-DD del timestamp", () => {
    expect(new Set(events.map((e) => e.day))).toEqual(new Set(["2026-07-01", "2026-07-02"]));
  });
});

describe("archivo sin usage", () => {
  it("devuelve [] sin lanzar (assistant sin usage + user + queue-operation)", () => {
    expect(extractUsageEvents(read("zero-usage.jsonl"))).toEqual([]);
  });
});

describe("fixtures reales anonimizados", () => {
  for (const name of ["real-printer-android.jsonl", "real-kitchen-ai.jsonl"]) {
    it(`${name}: parsea, produce eventos y ningun modelo vacio/synthetic`, () => {
      const events = extractUsageEvents(read(name));
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.model && e.model !== "<synthetic>")).toBe(true);
      expect(events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.day))).toBe(true);
    });
  }
});

describe("ClaudeCodeAdapter.parseSession", () => {
  it("normaliza una sesion con id, agent y project derivados de la ruta", async () => {
    const adapter = new ClaudeCodeAdapter();
    const session = await adapter.parseSession(fx("deterministic.jsonl"));
    expect(session.id).toBe("deterministic");
    expect(session.agent).toBe("claude-code");
    expect(session.project).toBe("fixtures");
    expect(session.events).toHaveLength(4);
  });
});
