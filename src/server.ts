/**
 * Servidor local (PLAN §3). Bindea SOLO a 127.0.0.1:8081 — sin auth, sin
 * exposicion. Ingesta incremental al arrancar y expone /api/summary. Sirve el
 * build del frontend desde web/dist si existe.
 */
import Fastify, { LogController } from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { openDb, defaultDbPath } from "motor-agentico-core";
import { ensureUserData } from "motor-agentico-core";
import { ingestAll } from "motor-agentico-core";
import { rootsFromConfig } from "motor-agentico-core";
import { loadPricing, savePricing, type Pricing } from "motor-agentico-core";
import { getSummary } from "motor-agentico-core";
import { loadConfig, saveConfig, type Config } from "motor-agentico-core";
import { discoverCatalog, getSkills } from "motor-agentico-core";
import { scanMemory } from "motor-agentico-core";
import { getActivityPage, getSessionDetail, getSessionTurns, searchPrompts } from "motor-agentico-core";
import { getWaste } from "motor-agentico-core";
import { writeReport } from "motor-agentico-core";
import { exportCsv, getExportData } from "motor-agentico-core";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8081);

export interface ServerOptions {
  dbPath?: string;
  configPath?: string;
  pricingPath?: string;
  catalogRoots?: { claudeRoot?: string; codexRoot?: string };
}

export async function buildServer(options: ServerOptions = {}) {
  const db = openDb(options.dbPath ?? defaultDbPath());
  // Estado mutable: pricing/config se pueden editar desde Configuracion.
  let pricing: Pricing = await loadPricing(options.pricingPath);
  let config: Config = await loadConfig(options.configPath);
  const catalogRoots = () => {
    if (options.catalogRoots) return options.catalogRoots;
    const roots = rootsFromConfig(config.agentPaths);
    return { claudeRoot: roots.projectsRoot ? dirname(roots.projectsRoot) : undefined, codexRoot: roots.codexRoot };
  };
  let catalog = await discoverCatalog(catalogRoots());

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, logController: new LogController({ disableRequestLogging: true }) });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/summary", async (req) => {
    const q = req.query as { windowDays?: string };
    const windowDays = q.windowDays ? Number(q.windowDays) : undefined;
    return getSummary(db, pricing, { windowDays });
  });

  app.get("/api/skills", async () => getSkills(db, config, catalog));

  app.get("/api/memory", async () => scanMemory(undefined, { staleDays: config.staleDays }));

  app.get("/api/activity", async (req, reply) => {
    const q = req.query as { cursor?: string; limit?: string; project?: string; agent?: string; model?: string };
    try {
      return getActivityPage(db, { ...q, limit: q.limit ? Number(q.limit) : undefined }, config.timeZone);
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.get("/api/activity/search", async (req, reply) => {
    const q = req.query as { q?: string; limit?: string; project?: string; agent?: string; model?: string };
    try {
      return { results: await searchPrompts(db, q.q ?? "", q.limit ? Number(q.limit) : undefined, q) };
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message };
    }
  });

  app.get("/api/export", async (req, reply) => {
    const { format = "json" } = req.query as { format?: string };
    if (format !== "json" && format !== "csv") {
      reply.code(400);
      return { error: "format debe ser csv o json" };
    }
    const data = getExportData(db);
    const extension = format === "csv" ? "csv" : "json";
    reply.header("Content-Disposition", `attachment; filename="motor-agentico-${new Date().toISOString().slice(0, 10)}.${extension}"`);
    if (format === "csv") return reply.type("text/csv; charset=utf-8").send(exportCsv(data));
    return reply.type("application/json; charset=utf-8").send(data);
  });

  app.get("/api/waste", async () => getWaste(db, pricing, config.waste));

  app.get("/api/session/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = getSessionDetail(db, id);
    if (!detail) {
      reply.code(404);
      return { error: "sesión no encontrada" };
    }
    return detail;
  });

  app.get("/api/session/:id/turns", async (req, reply) => {
    const { id } = req.params as { id: string };
    const turns = await getSessionTurns(db, id, config.timeZone);
    if (turns === null) {
      reply.code(404);
      return { error: "sesión no encontrada" };
    }
    return turns;
  });

  // Ingesta incremental bajo demanda (la usa el auto-refresh de la UI). Barata:
  // salta archivos sin cambios por (size, mtime).
  app.post("/api/refresh", async () => {
    const t0 = Date.now();
    const s = await ingestAll(db, {
      pricing,
      staleDays: config.staleDays,
      timeZone: config.timeZone,
      ...rootsFromConfig(config.agentPaths),
    });
    return { ...s, durationMs: Date.now() - t0, at: new Date().toISOString() };
  });

  app.get("/api/config", async () => config);
  app.put("/api/config", async (req, reply) => {
    try {
      config = await saveConfig(req.body as Partial<Config>, options.configPath);
      catalog = await discoverCatalog(catalogRoots());
      return { ok: true, config };
    } catch (err) {
      reply.code(400);
      return { ok: false, error: (err as Error).message };
    }
  });

  app.get("/api/pricing", async () => pricing);
  app.put("/api/pricing", async (req, reply) => {
    try {
      pricing = await savePricing(req.body as Pricing, options.pricingPath);
      return { ok: true, pricing, note: "rebuild para recalcular costos ya ingeridos" };
    } catch (err) {
      reply.code(400);
      return { ok: false, error: (err as Error).message };
    }
  });

  app.post("/api/rebuild", async () =>
    ingestAll(db, { pricing, staleDays: config.staleDays, reparseSkills: true, ...rootsFromConfig(config.agentPaths) }),
  );

  const here = dirname(fileURLToPath(import.meta.url));
  const dist = join(here, "..", "web", "dist");
  if (existsSync(dist)) {
    app.register(fastifyStatic, { root: dist });
  }

  app.addHook("onClose", async () => db.close());
  return { app, db, pricing, config };
}

export async function main() {
  ensureUserData();
  const { app, db, pricing, config } = await buildServer();

  // Ingesta incremental al arrancar (fuentes read-only).
  const t0 = Date.now();
  const summary = await ingestAll(db, {
    pricing,
    staleDays: config.staleDays,
    ...rootsFromConfig(config.agentPaths),
  });
  await writeReport(summary, { durationMs: Date.now() - t0 });
  app.log.info({ event: "ingest_complete", files: summary.files, filesChanged: summary.filesChanged, eventsInserted: summary.eventsInserted, memories: summary.memories, unknownModels: summary.unknownModels.length }, "Ingesta completa");

  try {
    await app.listen({ host: HOST, port: PORT });
  } catch (err) {
    // El fallo más común al arrancar: ya hay un dashboard corriendo. El stack
    // crudo de EADDRINUSE no dice qué hacer; esto sí.
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      app.log.error({ event: "listen_failed", code: "EADDRINUSE", port: PORT }, "El puerto ya está en uso");
      await app.close();
      process.exit(1);
    }
    throw err;
  }
  app.log.info({ event: "listening", host: HOST, port: PORT }, "Motor agentico escuchando");

  let closing = false;
  const close = async (signal: "SIGINT" | "SIGTERM") => {
    if (closing) return;
    closing = true;
    app.log.info({ event: "shutdown", signal }, "Cierre limpio");
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));
}

// Arranca solo si se ejecuta directo (no al importar en tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
