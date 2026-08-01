/**
 * Servidor local (PLAN §3). Bindea SOLO a 127.0.0.1:8081 — sin auth, sin
 * exposicion. Ingesta incremental al arrancar y expone /api/summary. Sirve el
 * build del frontend desde web/dist si existe.
 */
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { openDb, defaultDbPath } from "./lib/db.js";
import { ingestAll } from "./ingest.js";
import { rootsFromConfig } from "./adapters/registry.js";
import { loadPricing, savePricing, type Pricing } from "./lib/pricing.js";
import { getSummary } from "./lib/summary.js";
import { loadConfig, saveConfig, type Config } from "./lib/config.js";
import { discoverCatalog, getSkills } from "./lib/skills.js";
import { scanMemory } from "./lib/memory.js";
import { getActivity, getSessionDetail, getSessionTurns } from "./lib/activity.js";
import { getWaste } from "./lib/waste.js";
import { writeReport } from "./lib/report.js";

const HOST = "127.0.0.1";
const PORT = 8081;

export async function buildServer() {
  const db = openDb(defaultDbPath());
  // Estado mutable: pricing/config se pueden editar desde Configuracion.
  let pricing: Pricing = await loadPricing();
  let config: Config = await loadConfig();
  const catalog = await discoverCatalog(); // read-only, una vez al arrancar

  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/summary", async (req) => {
    const q = req.query as { windowDays?: string };
    const windowDays = q.windowDays ? Number(q.windowDays) : undefined;
    return getSummary(db, pricing, { windowDays });
  });

  app.get("/api/skills", async () => getSkills(db, config, catalog));

  app.get("/api/memory", async () => scanMemory(undefined, { staleDays: config.staleDays }));

  app.get("/api/activity", async () => getActivity(db));

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
    const turns = await getSessionTurns(db, id);
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
      ...rootsFromConfig(config.agentPaths),
    });
    return { ...s, durationMs: Date.now() - t0, at: new Date().toISOString() };
  });

  app.get("/api/config", async () => config);
  app.put("/api/config", async (req) => {
    config = await saveConfig(req.body as Partial<Config>);
    return config;
  });

  app.get("/api/pricing", async () => pricing);
  app.put("/api/pricing", async (req, reply) => {
    try {
      pricing = await savePricing(req.body as Pricing);
      return { ok: true, pricing, note: "rebuild para recalcular costos ya ingeridos" };
    } catch (err) {
      reply.code(400);
      return { ok: false, error: (err as Error).message };
    }
  });

  app.post("/api/rebuild", async () =>
    ingestAll(db, { pricing, staleDays: config.staleDays, ...rootsFromConfig(config.agentPaths) }),
  );

  const here = dirname(fileURLToPath(import.meta.url));
  const dist = join(here, "..", "web", "dist");
  if (existsSync(dist)) {
    app.register(fastifyStatic, { root: dist });
  }

  app.addHook("onClose", async () => db.close());
  return { app, db, pricing, config };
}

async function main() {
  const { app, db, pricing, config } = await buildServer();

  // Ingesta incremental al arrancar (fuentes read-only).
  const t0 = Date.now();
  const summary = await ingestAll(db, {
    pricing,
    staleDays: config.staleDays,
    ...rootsFromConfig(config.agentPaths),
  });
  await writeReport(summary, { durationMs: Date.now() - t0 });
  console.log(
    `Ingesta: ${summary.files} archivos · ${summary.filesChanged} cambiados · ${summary.eventsInserted} eventos nuevos · ${summary.memories} memorias` +
      (summary.unknownModels.length ? ` · ${summary.unknownModels.length} modelos sin tarifa` : ""),
  );

  try {
    await app.listen({ host: HOST, port: PORT });
  } catch (err) {
    // El fallo más común al arrancar: ya hay un dashboard corriendo. El stack
    // crudo de EADDRINUSE no dice qué hacer; esto sí.
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.error(
        `\n⚠ El puerto ${PORT} ya está en uso — probablemente el dashboard ya está corriendo.\n` +
          `  Abrilo en http://${HOST}:${PORT}\n` +
          `  Si quedó un proceso colgado, cerralo con:\n` +
          `    kill $(ss -ltnp 'sport = :${PORT}' 2>/dev/null | grep -oP 'pid=\\K[0-9]+')\n`,
      );
      process.exit(1);
    }
    throw err;
  }
  console.log(`Motor agentico escuchando en http://${HOST}:${PORT}`);
}

// Arranca solo si se ejecuta directo (no al importar en tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
