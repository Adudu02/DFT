/**
 * Adapter ZCode (workstream A1). Fixture sanitizado del formato real
 * (2026-09-13): raíz mínima por línea, sin request.body (contexto del usuario).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveZcodeIds, discoverZcodeRollouts, parseZcodeLines } from "../src/adapters/zcode.js";

const LINES = [
  JSON.stringify({
    completedAt: "2026-09-13T04:31:33.309Z",
    requestId: "req-1",
    sessionId: "sess_aaa",
    type: "model_io",
    model: { modelId: "GLM-5.3-Flash" },
    response: { usage: { inputTokens: 87905, outputTokens: 1286, totalTokens: 89191, cacheReadTokens: 75776, cacheWriteTokens: 0 } },
  }),
  JSON.stringify({
    completedAt: "2026-09-13T04:32:10.000Z",
    requestId: "req-2",
    sessionId: "sess_aaa",
    type: "model_io",
    model: { modelId: "GLM-5.3-Flash" },
    response: { usage: { inputTokens: 89264, outputTokens: 875, totalTokens: 90139, cacheReadTokens: 87872, cacheWriteTokens: 120 } },
  }),
  "{corrupta",
  JSON.stringify({ completedAt: "2026-09-13T04:33:00.000Z", type: "model_io", response: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 } } }), // sin sessionId
  JSON.stringify({ completedAt: "2026-09-13T04:34:00.000Z", requestId: "req-4", sessionId: "sess_bbb", type: "model_io" }), // sin usage
].join("\n");

describe("parseZcodeLines", () => {
  it("2 eventos válidos con convención Anthropic; 3 skips (corrupta + sin sessionId + sin usage)", () => {
    const { events, lineCount, skipped } = parseZcodeLines(LINES);
    expect(events).toHaveLength(2);
    expect(lineCount).toBe(5);
    expect(skipped).toBe(3);
    const e1 = events[0];
    expect(e1.dedupKey).toBe("zcode::req-1");
    expect(e1.event).toMatchObject({
      sessionId: "sess_aaa",
      ts: "2026-09-13T04:31:33.309Z",
      day: "2026-09-13",
      model: "GLM-5.3-Flash",
      input: 87905, // sin cache read incluido (convención Anthropic)
      output: 1286,
      cacheRead: 75776,
      cacheWrite: 0,
    });
  });
  it("fallback de sesión desde el filename cuando la línea no la trae", () => {
    const withFallback = LINES.split("\n")
      .map((l, i) => (i === 3 ? JSON.stringify({ completedAt: "2026-09-13T04:33:00.000Z", type: "model_io", requestId: "req-3", response: { usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 } } }) : l))
      .join("\n");
    const { events, skipped } = parseZcodeLines(withFallback, 0, "sess_aaa");
    expect(events.some((e) => e.dedupKey === "zcode::req-3")).toBe(true);
    expect(skipped).toBe(2); // corrupta + sin usage
  });
  it("fromLine respeta el offset incremental", () => {
    const { events } = parseZcodeLines(LINES, 2);
    expect(events).toHaveLength(0); // solo corrupta/sin-sesión/sin-usage después de la línea 2
  });
});

describe("deriveZcodeIds", () => {
  it("sessionId de la primera línea; project fijo zcode", () => {
    expect(deriveZcodeIds("/x/model-io-sess_u.jsonl", LINES)).toEqual({ sessionId: "sess_aaa", project: "zcode" });
  });
  it("sin líneas parseables => fallback al filename", () => {
    expect(deriveZcodeIds("/x/model-io-sess_uuu.jsonl", "")).toEqual({ sessionId: "sess_uuu", project: "zcode" });
  });
});

describe("discoverZcodeRollouts — lista blanca", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "motor-zcode-"));
    mkdirSync(tmp, { recursive: true });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("solo model-io-sess_*.jsonl; no-session y otros nombres fuera", async () => {
    writeFileSync(join(tmp, "model-io-sess_a.jsonl"), LINES);
    writeFileSync(join(tmp, "model-io-no-session.jsonl"), "{}");
    writeFileSync(join(tmp, "otro.jsonl"), "{}");
    writeFileSync(join(tmp, "model-io-sess_b.txt"), "{}");
    const found = await discoverZcodeRollouts(tmp);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("model-io-sess_a.jsonl");
  });
  it("sin directorio => lista vacía sin fallar", async () => {
    expect(await discoverZcodeRollouts(join(tmp, "no-existe"))).toEqual([]);
  });
});
