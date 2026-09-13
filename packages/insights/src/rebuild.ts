/**
 * Orquestador consciente de config: borra la DB (caché reconstruible), re-ingesta
 * todo y sincroniza los insights (memoria). Las primitivas viven en core; esto
 * es la capa de dominio del dashboard.
 */
import {
  defaultProjectsRoot,
  defaultDbPath,
  ingestAll,
  openDb,
  rootsFromConfig,
  type IngestSummary,
} from "motor-agentico-core";
import { unlink } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { syncMemoryNodes } from "./memory_sync.js";

export async function rebuild(
  opts: { dbPath?: string; projectsRoot?: string } = {},
): Promise<IngestSummary> {
  const dbPath = opts.dbPath ?? defaultDbPath();
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    await unlink(f).catch(() => {}); // puede no existir
  }
  const db = openDb(dbPath);
  try {
    // Honra config.agentPaths salvo que el llamador fuerce una raíz (tests).
    const config = await loadConfig();
    const roots = rootsFromConfig(config.agentPaths);
    const summary = await ingestAll(db, {
      staleDays: config.staleDays,
      timeZone: config.timeZone,
      projectsRoot: opts.projectsRoot ?? roots.projectsRoot,
      codexRoot: roots.codexRoot,
      qwenRoot: roots.qwenRoot,
    });
    // La memoria de Claude Code es dominio insights: se sincroniza aquí para
    // conservar `memories` en el summary que consumen CLI y server.
    const memRoot = opts.projectsRoot ?? roots.projectsRoot ?? defaultProjectsRoot();
    const memories = await syncMemoryNodes(db, memRoot, config.staleDays);
    return { ...summary, memories } as IngestSummary;
  } finally {
    db.close();
  }
}
