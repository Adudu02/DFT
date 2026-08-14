import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { rootsFromConfig } from "../src/adapters/registry.js";

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
