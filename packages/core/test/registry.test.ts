import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { getIngestAdapters, rootsFromConfig } from "../src/adapters/registry.js";

describe("rootsFromConfig — conectar agentes vía config.agentPaths", () => {
  it("sin config: projectsRoot indefinido (default interno) y Codex en ~/.codex", () => {
    const r = rootsFromConfig();
    expect(r.projectsRoot).toBeUndefined();
    expect(r.codexRoot).toBe(join(homedir(), ".codex"));
  });

  it("expande ~/ en las rutas configuradas", () => {
    const r = rootsFromConfig({ "claude-code": "~/otro/claude", codex: "~/otro/codex" });
    expect(r.projectsRoot).toBe(join(homedir(), "otro/claude"));
    expect(r.codexRoot).toBe(join(homedir(), "otro/codex"));
  });

  it("ruta vacía => cae al default (no rompe la ingesta)", () => {
    const r = rootsFromConfig({ "claude-code": "", codex: "" });
    expect(r.projectsRoot).toBeUndefined();
    expect(r.codexRoot).toBe(join(homedir(), ".codex"));
  });

  it("ruta absoluta se respeta tal cual", () => {
    const r = rootsFromConfig({ codex: "/data/codex" });
    expect(r.codexRoot).toBe("/data/codex");
  });
});

describe("getIngestAdapters — parseSkills por adapter", () => {
  it("el adapter Qwen expone el parser real de skills (no el stub vacío)", () => {
    // Regla de aislamiento: override de claudeRoot + qwenRoot explícito => incluye Qwen
    const adapters = getIngestAdapters({ claudeRoot: "/fixtures", qwenRoot: "/qwen" });
    const qwenChats = adapters.find((a) => a.id === "qwen" && a.skillsOnly);
    const qwenUsage = adapters.find((a) => a.id === "qwen" && !a.skillsOnly);
    expect(qwenChats).toBeDefined();

    const raw =
      '{"type":"user","timestamp":"2026-08-05T19:00:00Z","message":{"parts":[{"text":"/review este código"}]}}\n';
    const skills = qwenChats?.parseSkills(raw, 0);
    expect(skills).toHaveLength(1);
    expect(skills[0].skill).toBe("review");
    expect(qwenUsage?.parseSkills(raw, 0)).toEqual([]);
    const withMetadata = '{"sessionId":"session-aaa-111","cwd":"/work/demo"}\n' + raw;
    expect(qwenChats?.deriveIds("/qwen/chats/file-id.jsonl", withMetadata)).toEqual({ sessionId: "session-aaa-111", project: "demo" });
    expect(qwenChats?.deriveIds("/qwen/chats/file-id.jsonl", "{}\n")).toEqual({ sessionId: "file-id", project: "qwen" });
    expect(qwenChats?.parseLines(`${raw}\n`, 0, "ignored").lineCount).toBe(2);
  });
});
