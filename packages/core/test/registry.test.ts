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
    const qwen = adapters.find((a) => a.id === "qwen");
    expect(qwen).toBeDefined();

    const raw =
      '{"type":"user","timestamp":"2026-08-05T19:00:00Z","message":{"parts":[{"text":"/review este código"}]}}\n';
    const skills = qwen?.parseSkills(raw, 0);
    expect(skills).toHaveLength(1);
    expect(skills[0].skill).toBe("review");
  });
});
