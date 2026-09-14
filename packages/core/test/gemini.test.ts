/**
 * Adapter Gemini CLI (workstream A1). Fixture-driven: formato según el
 * research del plan — sin datos locales en la máquina de desarrollo.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveGeminiIds, discoverGeminiChats, parseGeminiLines } from "../src/adapters/gemini.js";

const LINES = [
  JSON.stringify({ type: "user", timestamp: "2026-09-13T10:00:00Z", text: "hola" }), // no gemini => skipped
  JSON.stringify({ type: "gemini", timestamp: "2026-09-13T10:00:05Z", model: "gemini-3-pro", tokens: { input: 1000, output: 200, cached: 600, thoughts: 50, total: 650 } }),
  JSON.stringify({ type: "gemini", timestamp: "2026-09-13T10:01:00Z", model: "gemini-3-pro", tokens: { input: 800, output: 100, total: 900 } }), // sin cached/thoughts
  "{corrupta",
  JSON.stringify({ type: "gemini", model: "gemini-3-pro", tokens: { input: 10, output: 1 } }), // sin timestamp => skipped
].join("\n");

describe("parseGeminiLines", () => {
  it("cached se resta del input y thoughts se pliega a output", () => {
    const { events, lineCount, skipped } = parseGeminiLines(LINES, 0, "session-abc");
    expect(events).toHaveLength(2);
    expect(lineCount).toBe(5);
    expect(skipped).toBe(3); // user + corrupta + sin timestamp
    const e1 = events[0];
    expect(e1.dedupKey).toBe("gemini::session-abc::1");
    expect(e1.event).toMatchObject({
      sessionId: "session-abc",
      ts: "2026-09-13T10:00:05Z",
      day: "2026-09-13",
      model: "gemini-3-pro",
      input: 400, // 1000 - 600
      output: 250, // 200 + 50
      cacheRead: 600,
      cacheWrite: 0,
    });
  });
  it("cached/thoughts ausentes => input y output directos", () => {
    const { events } = parseGeminiLines(LINES, 0, "session-abc");
    expect(events[1].event).toMatchObject({ input: 800, output: 100, cacheRead: 0 });
  });
  it("fromLine respeta el offset incremental", () => {
    // 0-based: [0]=user [1]=gemini [2]=gemini [3]=corrupta [4]=sin timestamp
    const full = parseGeminiLines(LINES, 0, "session-abc");
    expect(full.events).toHaveLength(2);
    const tail = parseGeminiLines(LINES, 3, "session-abc");
    expect(tail.events).toHaveLength(0); // solo corrupta + sin timestamp
  });
});

describe("deriveGeminiIds", () => {
  it("sessionId del filename; project fijo gemini", () => {
    expect(deriveGeminiIds("/x/tmp/abc123/chats/session-def.jsonl")).toEqual({
      sessionId: "session-def",
      project: "gemini",
    });
  });
});

describe("discoverGeminiChats — lista blanca <hash>/chats/session-*.jsonl", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "motor-gem-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("descubre session-*.jsonl bajo chats/ y excluye lo demás", async () => {
    mkdirSync(join(tmp, "hash1", "chats"), { recursive: true });
    writeFileSync(join(tmp, "hash1", "chats", "session-a.jsonl"), LINES);
    writeFileSync(join(tmp, "hash1", "chats", "otro.jsonl"), "{}");
    writeFileSync(join(tmp, "hash1", "session-b.jsonl"), "{}"); // fuera de chats/
    mkdirSync(join(tmp, "vacio", "chats"), { recursive: true });
    const found = await discoverGeminiChats(tmp);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(join("hash1", "chats", "session-a.jsonl"));
  });
  it("sin directorio => lista vacía sin fallar", async () => {
    expect(await discoverGeminiChats(join(tmp, "no-existe"))).toEqual([]);
  });
});
