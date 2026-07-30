/**
 * Ingesta incremental de transcripts hacia SQLite (PLAN §3).
 *  - Guarda por archivo cuantas lineas ya se leyeron (ingest_offsets).
 *  - Re-lee solo las lineas nuevas; la dedup cross-lectura la garantiza la PK
 *    dedup_key de usage_events (INSERT OR IGNORE).
 *  - Costo por evento se calcula en ingesta con el motor de Fase 1.
 * Fuentes = SOLO LECTURA (readFileRO + stat). Escritura solo en ./data.
 */
import { stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import type { DB } from "./lib/db.js";
import { openDb, defaultDbPath } from "./lib/db.js";
import { readFileRO } from "./lib/fs-readonly.js";
import {
  ClaudeCodeAdapter,
  defaultProjectsRoot,
  parseTranscriptLines,
  parseSkillUsages,
} from "./adapters/claude-code.js";
import { costForEvent } from "./lib/cost.js";
import { loadPricing, getRate, UnknownModels, type Pricing } from "./lib/pricing.js";
import { scanMemory } from "./lib/memory.js";

export interface IngestSummary {
  files: number;
  filesChanged: number;
  eventsInserted: number;
  memories: number;
  unknownModels: string[];
  unparseableLines: number;
}

interface OffsetRow {
  size: number;
  mtime_ms: number;
  line_count: number;
}

async function ingestFile(
  db: DB,
  path: string,
  project: string,
  pricing: Pricing,
  unknown: UnknownModels,
): Promise<{ inserted: number; skipped: number }> {
  const st = await stat(path);
  const sizeNow = st.size;
  const mtimeNow = Math.floor(st.mtimeMs);

  const prev = db
    .prepare("SELECT size, mtime_ms, line_count FROM ingest_offsets WHERE path = ?")
    .get(path) as OffsetRow | undefined;

  // Sin cambios (mismo tamano y mtime) => nada que hacer.
  if (prev && prev.size === sizeNow && prev.mtime_ms === mtimeNow) return { inserted: 0, skipped: 0 };

  // Archivo reemplazado/truncado (mas chico que lo leido) => releer desde 0.
  const fromLine = prev && sizeNow >= prev.size ? prev.line_count : 0;

  const raw = await readFileRO(path);
  const { events, lineCount, skipped } = parseTranscriptLines(raw, fromLine);
  const skillUsages = parseSkillUsages(raw, fromLine);

  const sessionId = basename(path, ".jsonl");

  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO usage_events
      (dedup_key, session_id, ts, day, model,
       input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSkill = db.prepare(`
    INSERT OR IGNORE INTO skills_usage (skill, session_id, ts, kind) VALUES (?, ?, ?, ?)
  `);

  let inserted = 0;
  const run = db.prepare("BEGIN");
  run.run();
  try {
    for (const su of skillUsages) {
      insertSkill.run(su.skill, sessionId, su.ts, su.kind);
    }
    for (const { dedupKey, event } of events) {
      const rate = getRate(pricing, event.model, unknown);
      const cost = costForEvent(event, rate);
      const res = insertEvent.run(
        dedupKey,
        sessionId,
        event.ts,
        event.day,
        event.model,
        event.input,
        event.output,
        event.cacheWrite,
        event.cacheRead,
        cost,
      );
      if (res.changes > 0) inserted++;
    }

    // Recalcula agregados de la sesion desde la DB (idempotente).
    const agg = db
      .prepare(
        "SELECT COUNT(*) AS turns, MIN(ts) AS started, MAX(ts) AS ended FROM usage_events WHERE session_id = ?",
      )
      .get(sessionId) as { turns: number; started: string | null; ended: string | null };

    db.prepare(`
      INSERT INTO sessions (id, agent, project, started_at, ended_at, turns)
      VALUES (?, 'claude-code', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project = excluded.project,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        turns = excluded.turns
    `).run(sessionId, project, agg.started, agg.ended, agg.turns);

    db.prepare(`
      INSERT INTO ingest_offsets (path, size, mtime_ms, line_count, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        size = excluded.size, mtime_ms = excluded.mtime_ms,
        line_count = excluded.line_count, updated_at = excluded.updated_at
    `).run(path, sizeNow, mtimeNow, lineCount, new Date().toISOString());

    db.prepare("COMMIT").run();
  } catch (err) {
    db.prepare("ROLLBACK").run();
    throw err;
  }

  return { inserted, skipped };
}

/** Ingesta todos los transcripts descubiertos hacia `db`. */
export async function ingestAll(
  db: DB,
  opts: { projectsRoot?: string; pricing?: Pricing; staleDays?: number } = {},
): Promise<IngestSummary> {
  const root = opts.projectsRoot ?? defaultProjectsRoot();
  const adapter = new ClaudeCodeAdapter(root);
  const pricing = opts.pricing ?? (await loadPricing());
  const unknown = new UnknownModels();

  const paths = await adapter.discoverSessions();
  let eventsInserted = 0;
  let filesChanged = 0;
  let unparseableLines = 0;

  for (const path of paths) {
    const project = basename(join(path, ".."));
    const { inserted, skipped } = await ingestFile(db, path, project, pricing, unknown);
    if (inserted > 0) filesChanged++;
    eventsInserted += inserted;
    unparseableLines += skipped;
  }

  const memories = await refreshMemoryNodes(db, root, opts.staleDays);

  return {
    files: paths.length,
    filesChanged,
    eventsInserted,
    memories,
    unknownModels: unknown.list(),
    unparseableLines,
  };
}

/** Reconstruye memory_nodes (snapshot) desde los archivos de memoria (RO). */
async function refreshMemoryNodes(db: DB, projectsRoot: string, staleDays?: number): Promise<number> {
  const graph = await scanMemory(projectsRoot, { staleDays });
  const memNodes = graph.nodes.filter((n) => n.kind === "memory" || n.kind === "index");
  const origin = new Map<string, string>();
  for (const l of graph.links) {
    if (l.rel === "origin") origin.set(l.source, l.target.replace(/^session:/, ""));
  }
  db.prepare("BEGIN").run();
  try {
    db.prepare("DELETE FROM memory_nodes").run();
    const ins = db.prepare(`
      INSERT OR REPLACE INTO memory_nodes
        (path, name, project, type, size, last_touched, origin_session, stale_bool)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const n of memNodes) {
      ins.run(n.id, n.label, n.project, n.type ?? n.kind, n.size ?? 0, n.lastTouched ?? null, origin.get(n.id) ?? null, n.stale ? 1 : 0);
    }
    db.prepare("COMMIT").run();
  } catch (err) {
    db.prepare("ROLLBACK").run();
    throw err;
  }
  return graph.counts.memories;
}

/** Borra la DB (cache reconstruible) y reingesta todo desde cero. */
export async function rebuild(
  opts: { dbPath?: string; projectsRoot?: string } = {},
): Promise<IngestSummary> {
  const dbPath = opts.dbPath ?? defaultDbPath();
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    await unlink(f).catch(() => {}); // puede no existir
  }
  const db = openDb(dbPath);
  try {
    return await ingestAll(db, { projectsRoot: opts.projectsRoot });
  } finally {
    db.close();
  }
}
