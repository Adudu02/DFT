/**
 * Ingesta incremental de transcripts hacia SQLite (PLAN §3).
 *  - Guarda por archivo cuantas lineas ya se leyeron (ingest_offsets).
 *  - Re-lee solo las lineas nuevas; la dedup cross-lectura la garantiza la PK
 *    dedup_key de usage_events (INSERT OR IGNORE).
 *  - Costo por evento se calcula en ingesta con el motor de Fase 1.
 * Fuentes = SOLO LECTURA (readFileRO + stat). Escritura solo en ./data.
 */
import { stat } from "node:fs/promises";
import { getIngestAdapters, type IngestAdapter } from "./adapters/registry.js";
import type { DB } from "./lib/db.js";
import { readFileRO } from "./lib/fs-readonly.js";
import { costForEvent } from "./lib/cost.js";
import { loadPricing, getRate, UnknownModels, type Pricing } from "./lib/pricing.js";
import { dayInTz } from "./lib/time.js";

export interface IngestSummary {
  files: number;
  filesChanged: number;
  eventsInserted: number;
  skillsInserted?: number;
  /** Producido por insights (syncMemoryNodes); core solo mide. */
  memories?: number;
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
  adapter: IngestAdapter,
  path: string,
  pricing: Pricing,
  unknown: UnknownModels,
  timeZone?: string,
  reparseSkills = false,
): Promise<{ inserted: number; skillsInserted: number; skipped: number }> {
  const st = await stat(path);
  const sizeNow = st.size;
  const mtimeNow = Math.floor(st.mtimeMs);

  const prev = db
    .prepare("SELECT size, mtime_ms, line_count FROM ingest_offsets WHERE path = ?")
    .get(path) as OffsetRow | undefined;

  // Sin cambios (mismo tamano y mtime) => nada que hacer.
  if (prev && prev.size === sizeNow && prev.mtime_ms === mtimeNow && !reparseSkills) {
    return { inserted: 0, skillsInserted: 0, skipped: 0 };
  }

  // Archivo reemplazado/truncado (mas chico que lo leido) => releer desde 0.
  const fromLine = prev && sizeNow >= prev.size ? prev.line_count : 0;

  const raw = await readFileRO(path);
  const { sessionId, project } = adapter.deriveIds(path, raw);
  const { events, lineCount, skipped } = adapter.parseLines(raw, fromLine, sessionId);
  const skillUsages = adapter.parseSkills(raw, reparseSkills ? 0 : fromLine);

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
  let skillsInserted = 0;
  const run = db.prepare("BEGIN");
  run.run();
  try {
    for (const su of skillUsages) {
      if (insertSkill.run(su.skill, sessionId, su.ts, su.kind).changes > 0) skillsInserted++;
    }
    for (const { dedupKey, event } of events) {
      const rate = getRate(pricing, event.model, unknown);
      const cost = costForEvent(event, rate);
      // Para adapters multiSession (Qwen), cada event tiene su propio sessionId.
      // Para adapters normales (Claude, Codex), se usa el sessionId del archivo.
      const eventSessionId = adapter.multiSession ? event.sessionId : sessionId;
      const res = insertEvent.run(
        dedupKey,
        eventSessionId,
        event.ts,
        dayInTz(event.ts, timeZone),
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
    // Para adapters multiSession (Qwen), upsertamos una entrada por cada sessionId único.
    const sessionIdsToUpsert = adapter.multiSession
      ? [...new Set(events.map((e) => e.event.sessionId))]
      : [sessionId];

    const upsertSession = db.prepare(`
      INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        agent = excluded.agent,
        project = excluded.project,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        turns = excluded.turns,
        source_path = excluded.source_path
    `);

    for (const sid of sessionIdsToUpsert) {
      const agg = db
        .prepare(
          "SELECT COUNT(*) AS turns, MIN(ts) AS started, MAX(ts) AS ended FROM usage_events WHERE session_id = ?",
        )
        .get(sid) as { turns: number; started: string | null; ended: string | null };
      upsertSession.run(sid, adapter.id, project, agg.started, agg.ended, agg.turns, path);
    }

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

  return { inserted, skillsInserted, skipped };
}

/** Ingesta todos los transcripts descubiertos (todos los adapters) hacia `db`. */
export async function ingestAll(
  db: DB,
  opts: { projectsRoot?: string; codexRoot?: string; qwenRoot?: string; zcodeRoot?: string; geminiRoot?: string; pricing?: Pricing; staleDays?: number; timeZone?: string; reparseSkills?: boolean } = {},
): Promise<IngestSummary> {
  const pricing = opts.pricing ?? (await loadPricing());
  const unknown = new UnknownModels();
  const adapters = getIngestAdapters({ claudeRoot: opts.projectsRoot, codexRoot: opts.codexRoot, qwenRoot: opts.qwenRoot, zcodeRoot: opts.zcodeRoot, geminiRoot: opts.geminiRoot });

  let files = 0;
  let eventsInserted = 0;
  let skillsInserted = 0;
  let filesChanged = 0;
  let unparseableLines = 0;

  for (const adapter of adapters) {
    const paths = await adapter.discover();
    files += paths.length;
    for (const path of paths) {
      const { inserted, skillsInserted: skills, skipped } = await ingestFile(
        db, adapter, path, pricing, unknown, opts.timeZone, opts.reparseSkills,
      );
      if (inserted > 0 || skills > 0) filesChanged++;
      eventsInserted += inserted;
      skillsInserted += skills;
      unparseableLines += skipped;
    }
  }

  return {
    files,
    filesChanged,
    eventsInserted,
    skillsInserted,
    unknownModels: unknown.list(),
    unparseableLines,
  };
}


