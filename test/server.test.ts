import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { DEFAULT_CONFIG } from "motor-agentico-core";

describe("HTTP contracts", () => {
  let tmp: string;
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "motor-http-"));
    writeFileSync(join(tmp, "config.json"), JSON.stringify(DEFAULT_CONFIG));
    writeFileSync(join(tmp, "pricing.json"), JSON.stringify({ models: { test: { input: 1, output: 2 } } }));
    server = await buildServer({
      dbPath: join(tmp, "motor.db"),
      configPath: join(tmp, "config.json"),
      pricingPath: join(tmp, "pricing.json"),
      catalogRoots: { claudeRoot: join(tmp, "claude"), codexRoot: join(tmp, "codex") },
    });
    server.db.prepare("INSERT INTO sessions (id, agent, project, started_at, ended_at, turns) VALUES (?, ?, ?, ?, ?, ?)").run("s1", "codex", "demo", "2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z", 1);
    server.db.prepare("INSERT INTO usage_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("e1", "s1", "2026-01-01T01:00:00Z", "2026-01-01", "test", 3, 4, 0, 0, 0.1);
  });

  afterEach(async () => {
    await server.app.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("rechaza config y pricing inválidos con 400", async () => {
    const config = await server.app.inject({ method: "PUT", url: "/api/config", payload: { hourlyRate: -1 } });
    expect(config.statusCode).toBe(400);
    expect(config.json().error).toContain("hourlyRate");
    const unknownWaste = await server.app.inject({ method: "PUT", url: "/api/config", payload: { waste: { surprise: 1 } } });
    expect(unknownWaste.statusCode).toBe(400);
    const pricing = await server.app.inject({ method: "PUT", url: "/api/pricing", payload: { models: { test: { input: -1, output: 2 } } } });
    expect(pricing.statusCode).toBe(400);
    expect(pricing.json().error).toContain("tarifa");
  });

  it("pagina actividad, limita búsqueda y exporta métricas sin prompts", async () => {
    const activity = await server.app.inject({ method: "GET", url: "/api/activity?limit=1&agent=codex&model=test" });
    expect(activity.statusCode).toBe(200);
    expect(activity.json().days[0].sessions[0].id).toBe("s1");
    expect(await server.app.inject({ method: "GET", url: "/api/activity/search?q=x" })).toMatchObject({ statusCode: 400 });

    const json = await server.app.inject({ method: "GET", url: "/api/export?format=json" });
    expect(json.headers["content-disposition"]).toContain("motor-agentico-");
    expect(json.json().sessions[0].id).toBe("s1");
    expect(json.body).not.toContain("prompt");
    const csv = await server.app.inject({ method: "GET", url: "/api/export?format=csv" });
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("usage_event");
  });
});
