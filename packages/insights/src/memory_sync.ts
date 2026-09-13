import type { DB } from "motor-agentico-core";
import { scanMemory } from "./memory.js";

/** Crea la tabla de insights si falta (idempotente; salió del schema de core). */
function ensureSchema(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS memory_nodes (
  path           TEXT PRIMARY KEY,
  name           TEXT,
  project        TEXT,
  type           TEXT,
  size           INTEGER,
  last_touched   TEXT,
  origin_session TEXT,
  stale_bool     INTEGER
);`);
}

/**
 * Reconstruye memory_nodes (snapshot) desde los archivos de memoria (RO).
 * Vive en insights: la memoria de Claude Code es dominio del dashboard, no
 * medición genérica. Devuelve cuántos nodos quedaron sincronizados.
 */
export async function syncMemoryNodes(db: DB, projectsRoot: string, staleDays?: number): Promise<number> {
  ensureSchema(db);
  const graph = await scanMemory(projectsRoot, { staleDays });
  const memNodes = graph.nodes.filter((n) => n.kind === "memory" || n.kind === "index");
  const origin = new Map<string, string>();
  for (const l of graph.links) {
    if (l.rel === "origin") origin.set(l.source, l.target.replace(/^session:/, ""));
  }
  db.prepare("BEGIN").run();
  try {
    const previous = db.prepare("SELECT path FROM memory_nodes").all() as { path: string }[];
    const seen = new Set<string>();
    const upsert = db.prepare(`
      INSERT INTO memory_nodes
        (path, name, project, type, size, last_touched, origin_session, stale_bool)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name, project = excluded.project, type = excluded.type,
        size = excluded.size, last_touched = excluded.last_touched,
        origin_session = excluded.origin_session, stale_bool = excluded.stale_bool
      WHERE name IS NOT excluded.name OR project IS NOT excluded.project OR type IS NOT excluded.type
         OR size IS NOT excluded.size OR last_touched IS NOT excluded.last_touched
         OR origin_session IS NOT excluded.origin_session OR stale_bool IS NOT excluded.stale_bool
    `);
    for (const n of memNodes) {
      seen.add(n.id);
      upsert.run(n.id, n.label, n.project, n.type ?? n.kind, n.size ?? 0, n.lastTouched ?? null, origin.get(n.id) ?? null, n.stale ? 1 : 0);
    }
    const del = db.prepare("DELETE FROM memory_nodes WHERE path = ?");
    for (const row of previous) if (!seen.has(row.path)) del.run(row.path);
    db.prepare("COMMIT").run();
  } catch (err) {
    db.prepare("ROLLBACK").run();
    throw err;
  }
  return graph.counts.memories;
}
