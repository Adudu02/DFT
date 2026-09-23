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
import { openDb, defaultDbPath, runPricingUpdate } from "how-much-did-u-waste-core";
import { ensureUserData } from "how-much-did-u-waste-core";
import { defaultProjectsRoot, ingestAll } from "how-much-did-u-waste-core";
import { rootsFromConfig } from "how-much-did-u-waste-core";
import { loadPricing, pricingAgeStatus, savePricing, type Pricing } from "how-much-did-u-waste-core";
import { getSummary } from "how-much-did-u-waste-core";
import { loadConfig, saveConfig, type Config } from "how-much-did-u-waste-insights";
import { discoverCatalog, getSkills } from "how-much-did-u-waste-insights";
import { scanMemory, syncMemoryNodes } from "how-much-did-u-waste-insights";
import { autoPricingCheck } from "how-much-did-u-waste-insights";
import { cacheFreshness, readQuotaCache, refreshQuota, defaultQuotaCachePath } from "how-much-did-u-waste-core";
import { getActivityPage, getSessionDetail, getSessionTurns, searchPrompts } from "how-much-did-u-waste-core";
import { getWaste } from "how-much-did-u-waste-insights";
import { writeReport } from "how-much-did-u-waste-core";
import { exportCsv, getExportData } from "how-much-did-u-waste-core";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8081);

export interface ServerOptions {
  dbPath?: string;
  configPath?: string;
  pricingPath?: string;
  catalogRoots?: { claudeRoot?: string; codexRoot?: string };
  /** Raíz del build del frontend; inyectable para tests herméticos del fallback SPA. */
  distRoot?: string;
  /** Caché de quota inyectable (tests). Default: <cwd>/data/quota-cache.json. */
  quotaCachePath?: string;
  /** fetch inyectable para los probers de quota (tests sin red). */
  quotaFetch?: typeof fetch;
  /** Credenciales de Claude inyectables (tests sin credenciales reales). */
  quotaClaudeCredentialsPath?: string;
  /** Actualizador inyectable para pruebas sin red. */
  pricingUpdate?: typeof runPricingUpdate;
}

export async function buildServer(options: ServerOptions = {}) {
  const db = openDb(options.dbPath ?? defaultDbPath());
  // Estado mutable: pricing/config se pueden editar desde Configuracion.
  let pricing: Pricing = await loadPricing(options.pricingPath);
  let config: Config = await loadConfig(options.configPath);
  let pricingRefresh: Promise<Awaited<ReturnType<typeof runPricingUpdate>> | null> | null = null;
  const catalogRoots = () => {
    if (options.catalogRoots) return options.catalogRoots;
    const roots = rootsFromConfig(config.agentPaths);
    return { claudeRoot: roots.projectsRoot ? dirname(roots.projectsRoot) : undefined, codexRoot: roots.codexRoot };
  };
  let catalog = await discoverCatalog(catalogRoots());

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, logController: new LogController({ disableRequestLogging: true }) });

  app.get("/api/health", async () => ({ ok: true, pid: process.pid }));

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
    reply.header("Content-Disposition", `attachment; filename="how-much-did-u-waste-${new Date().toISOString().slice(0, 10)}.${extension}"`);
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
    const roots = rootsFromConfig(config.agentPaths);
    const s = await ingestAll(db, {
      pricing,
      staleDays: config.staleDays,
      timeZone: config.timeZone,
      ...roots,
    });
    const memories = await syncMemoryNodes(db, roots.projectsRoot ?? defaultProjectsRoot(), config.staleDays);
    return { ...s, memories, durationMs: Date.now() - t0, at: new Date().toISOString() };
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

  // Frescura del pricing (badge UI): se lee del disco para reflejar updates
  // en background; cálculo local, sin red.
  app.get("/api/pricing-status", async () => {
    const current = await loadPricing(options.pricingPath);
    const status = pricingAgeStatus(current, config.pricing.maxAgeDays);
    return { ...status, maxAgeDays: config.pricing.maxAgeDays, verifiedAt: current.verified_at ?? null };
  });
  app.put("/api/pricing", async (req, reply) => {
    try {
      pricing = await savePricing(req.body as Pricing, options.pricingPath);
      return { ok: true, pricing, note: "rebuild para recalcular costos ya ingeridos" };
    } catch (err) {
      reply.code(400);
      return { ok: false, error: (err as Error).message };
    }
  });

  app.post("/api/pricing/refresh", async (_req, reply) => {
    if (!pricingRefresh) {
      pricingRefresh = (async () => {
        const report = await (options.pricingUpdate ?? runPricingUpdate)({
          pricingPath: options.pricingPath,
          source: config.pricing.source,
        });
        if (!report.error) pricing = await loadPricing(options.pricingPath);
        return report;
      })().finally(() => { pricingRefresh = null; });
    }
    const report = await pricingRefresh;
    if (report?.error) {
      reply.code(502);
      return { ok: false, report };
    }
    return { ok: true, report };
  });

  app.post("/api/rebuild", async () => {
    const roots = rootsFromConfig(config.agentPaths);
    const summary = await ingestAll(db, { pricing, staleDays: config.staleDays, reparseSkills: true, ...roots });
    const memories = await syncMemoryNodes(db, roots.projectsRoot ?? defaultProjectsRoot(), config.staleDays);
    return { ...summary, memories };
  });

  const quotaCachePath = options.quotaCachePath ?? defaultQuotaCachePath();
  let lastRefreshMs = 0;

  const runQuotaRefresh = async () => {
    const nowMs = Date.now();
    if (nowMs - lastRefreshMs < 30_000) {
      return { ok: false, error: "refresh debounced (30s)", results: [] };
    }
    lastRefreshMs = nowMs;
    const roots = rootsFromConfig(config.agentPaths);
    const { cache, results } = await refreshQuota({
      providers: config.quota.providers,
      zaiApiKey: config.quota.zaiApiKey,
      geminiProjectId: config.quota.geminiProjectId,
      claudeCredentialsPath: options.quotaClaudeCredentialsPath,
      codexRoot: roots.codexRoot,
      cachePath: quotaCachePath,
      fetchImpl: options.quotaFetch,
    });
    const { fresh, ageMinutes } = cacheFreshness(cache, config.quota.refreshTtlMinutes, Date.now());
    return { ok: true, status: fresh ? "live" : "stale", ageMinutes, results };
  };

  const startQuotaRefresh = (reason: string) => {
    void runQuotaRefresh().catch((err) => {
      app.log.warn({ event: "quota_refresh_failed", reason, err }, "Refresh de quota fallido");
    });
  };

  // GET /api/quota: SIEMPRE desde caché (offline-first); estado stale con edad.
  app.get("/api/quota", async () => {
    const cache = readQuotaCache(quotaCachePath);
    const ttl = config.quota.refreshTtlMinutes;
    const { fresh, ageMinutes } = cacheFreshness(cache, ttl);
    if (config.quota.autoRefresh && !fresh) startQuotaRefresh("stale_cache");
    return {
      status: cache ? (fresh ? "live" : "stale") : "no-data",
      ageMinutes,
      ttlMinutes: ttl,
      snapshots: cache?.snapshots ?? [],
    };
  });

  // POST /api/quota/refresh: corre los probers habilitados (paralelo, aislado),
  // fusiona la caché y responde por proveedor. Debounce 30 s.
  app.post("/api/quota/refresh", async () => {
    return runQuotaRefresh();
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const dist = options.distRoot ?? join(here, "..", "web", "dist");
  if (existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist });
    // Fallback SPA: cualquier ruta de página sirve la app (deep links + recarga).
    // Las /api/* desconocidas conservan su 404 JSON.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) {
        reply.code(404).send({ error: "not found" });
      } else {
        void reply.sendFile("index.html");
      }
    });
  }

  app.addHook("onClose", async () => db.close());
  // Auto-chequeo de pricing solo con paths por defecto (tests inyectan los
  // suyos y quedan herméticos); una vez por proceso, no bloquea nada.
  if (!options.pricingPath) {
    void autoPricingCheck(config, {
      onDone: async (report) => {
        if (!report.error) pricing = await loadPricing(options.pricingPath);
      },
    });
  }
  return { app, db, pricing, config, startQuotaRefresh };
}

export async function main() {
  ensureUserData();
  const { app, db, pricing, config, startQuotaRefresh } = await buildServer();

  // Ingesta incremental al arrancar (fuentes read-only) + insights de memoria.
  const t0 = Date.now();
  const roots = rootsFromConfig(config.agentPaths);
  const summary = await ingestAll(db, {
    pricing,
    staleDays: config.staleDays,
    timeZone: config.timeZone,
    ...roots,
  });
  const memories = await syncMemoryNodes(db, roots.projectsRoot ?? defaultProjectsRoot(), config.staleDays);
  await writeReport({ ...summary, memories } as typeof summary, { durationMs: Date.now() - t0 });
  app.log.info({ event: "ingest_complete", files: summary.files, filesChanged: summary.filesChanged, eventsInserted: summary.eventsInserted, memories, unknownModels: summary.unknownModels.length }, "Ingesta completa");
  startQuotaRefresh("startup");

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
  app.log.info({ event: "listening", host: HOST, port: PORT }, "How much did u waste? escuchando");

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
