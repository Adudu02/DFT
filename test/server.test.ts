import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildServer } from "../src/server.js";
import { DEFAULT_CONFIG } from "motor-agentico-insights";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "..", "packages", "core", "test", "fixtures", name);

describe("HTTP contracts", () => {
  let tmp: string;
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "motor-http-"));
    // Raíces herméticas: refresh/rebuild resuelven vía config.agentPaths y NUNCA
    // deben tocar los transcripts reales de la máquina.
    mkdirSync(join(tmp, "claude", "projects", "projX"), { recursive: true });
    copyFileSync(fx("deterministic.jsonl"), join(tmp, "claude", "projects", "projX", "sesion1.jsonl"));
    // projP/prompts.jsonl: transcript con mensajes user reales para el test de turns.
    mkdirSync(join(tmp, "claude", "projects", "projP"), { recursive: true });
    copyFileSync(fx("prompts.jsonl"), join(tmp, "claude", "projects", "projP", "prompts.jsonl"));
    mkdirSync(join(tmp, "codex"), { recursive: true });
    mkdirSync(join(tmp, "qwen"), { recursive: true });
    writeFileSync(
      join(tmp, "config.json"),
      JSON.stringify({
        ...DEFAULT_CONFIG,
        timeZone: "UTC", // determinismo: no depender de la zona de la máquina
        agentPaths: {
          "claude-code": join(tmp, "claude", "projects"),
          codex: join(tmp, "codex"),
          qwen: join(tmp, "qwen"),
        },
      }),
    );
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

  it("health responde ok", async () => {
    const health = await server.app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });
  });

  it("refresh ingesta hermética y devuelve contadores", async () => {
    const refresh = await server.app.inject({ method: "POST", url: "/api/refresh" });
    expect(refresh.statusCode).toBe(200);
    const body = refresh.json();
    expect(body.eventsInserted).toBeGreaterThanOrEqual(1);
    expect(typeof body.durationMs).toBe("number");
    expect(typeof body.at).toBe("string");
    // La sesión del fixture claude entró (no las reales de la máquina).
    const row = server.db.prepare("SELECT project FROM sessions WHERE id = 'sesion1'").get() as { project: string };
    expect(row.project).toBe("projX");
  });

  it("session detail: 200 con datos y 404 para missing", async () => {
    const found = await server.app.inject({ method: "GET", url: "/api/session/s1" });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({ id: "s1", project: "demo" });

    const missing = await server.app.inject({ method: "GET", url: "/api/session/missing" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toContain("no encontrada");
  });

  it("turns: prompts reales, transcript sin user messages, sin source_path y 404", async () => {
    await server.app.inject({ method: "POST", url: "/api/refresh" });

    // La sesión "prompts" proviene de un transcript con mensajes user: 2 turnos
    // (el tool_result no cuenta), con prompt y hora normalizada.
    const turns = await server.app.inject({ method: "GET", url: "/api/session/prompts/turns" });
    expect(turns.statusCode).toBe(200);
    expect(turns.json()).toHaveLength(2);
    expect(turns.json()[0]).toMatchObject({ prompt: "arregla el parser de costos", time: "09:15" });

    // sesion1 tiene transcript pero sin mensajes user => [].
    const noPrompts = await server.app.inject({ method: "GET", url: "/api/session/sesion1/turns" });
    expect(noPrompts.statusCode).toBe(200);
    expect(noPrompts.json()).toEqual([]);

    // s1 fue sembrada a mano sin source_path => [].
    const empty = await server.app.inject({ method: "GET", url: "/api/session/s1/turns" });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);

    const missing = await server.app.inject({ method: "GET", url: "/api/session/missing/turns" });
    expect(missing.statusCode).toBe(404);
  });

  it("memory devuelve el grafo con nodes, links y counts", async () => {
    const memory = await server.app.inject({ method: "GET", url: "/api/memory" });
    expect(memory.statusCode).toBe(200);
    const body = memory.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.links)).toBe(true);
    expect(body.counts).toHaveProperty("memories");
    expect(body.counts).toHaveProperty("stale");
  });

  it("skills devuelve skills y categorías (vacías sin usos)", async () => {
    const skills = await server.app.inject({ method: "GET", url: "/api/skills" });
    expect(skills.statusCode).toBe(200);
    expect(skills.json()).toEqual({ skills: [], categories: {} });
  });

  it("pricing-status expone frestura local sin red", async () => {
    // El pricing de test no tiene verified_at => unknown.
    const st = await server.app.inject({ method: "GET", url: "/api/pricing-status" });
    expect(st.statusCode).toBe(200);
    const body = st.json();
    expect(body.status).toBe("unknown");
    expect(body.maxAgeDays).toBe(7); // DEFAULT_CONFIG.pricing
    expect(body.verifiedAt).toBeNull();
  });

  it("rebuild reingesta y devuelve contadores", async () => {
    const rebuild = await server.app.inject({ method: "POST", url: "/api/rebuild" });
    expect(rebuild.statusCode).toBe(200);
    const body = rebuild.json();
    expect(body.eventsInserted).toBeGreaterThanOrEqual(1);
    expect(typeof body.memories).toBe("number");
    expect(typeof body.files).toBe("number");
  });
});

describe("SPA fallback", () => {
  let tmp: string;
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "motor-spa-"));
    mkdirSync(join(tmp, "dist"), { recursive: true });
    writeFileSync(join(tmp, "dist", "index.html"), "<!doctype html><title>spa-fake</title>");
    writeFileSync(join(tmp, "config.json"), JSON.stringify(DEFAULT_CONFIG));
    writeFileSync(join(tmp, "pricing.json"), JSON.stringify({ models: { test: { input: 1, output: 2 } } }));
    server = await buildServer({
      dbPath: join(tmp, "motor.db"),
      configPath: join(tmp, "config.json"),
      pricingPath: join(tmp, "pricing.json"),
      distRoot: join(tmp, "dist"),
    });
  });

  afterEach(async () => {
    await server.app.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("sirve index.html para rutas de página (deep links)", async () => {
    const page = await server.app.inject({ method: "GET", url: "/configuracion" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("spa-fake");
  });

  it("las rutas /api/* desconocidas siguen respondiendo 404 JSON", async () => {
    const missing = await server.app.inject({ method: "GET", url: "/api/inexistente" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "not found" });
  });
});
