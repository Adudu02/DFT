/**
 * Adapter Crush (workstream A3). Fuente: `~/.local/share/crush/crush.db`
 * (SQLite viva → snapshot RO). Fixture-driven (sin datos locales): la tabla
 * `sessions` mantiene `cost` (USD REAL) — las columnas de tokens NO se
 * mantienen. EXCEPCIÓN DOCUMENTADA (spec): sin tokens no hay equiv-API
 * posible, así que el costo se registra directo del proveedor con tokens 0/0:
 * Crush contribuye al gasto pero no a las métricas de tokens.
 */
import type { DB } from "../lib/db.js";
import { withSqliteSnapshot } from "../lib/sqlite-snapshot.js";
import { toIsoTimestamp } from "../lib/time.js";

export function crushSyncAdapter(sourcePath: string) {
  return {
    id: "crush",
    async sync(target: DB): Promise<{ eventsInserted: number; skipped: number }> {
      return withSqliteSnapshot(sourcePath, (snapshotDb) => doSync(target, sourcePath, snapshotDb));
    },
  };
}

async function doSync(target: DB, sourcePath: string, snapshotDb: import("better-sqlite3").Database): Promise<{ eventsInserted: number; skipped: number }> {
  const cols = (snapshotDb.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.length) throw new Error("sin tabla sessions");
  const idCol = cols.includes("session_id") ? "session_id" : "id";
  const tsCol = ["updated_at", "created_at", "timestamp"].find((c) => cols.includes(c));

  const rows = snapshotDb.prepare(`SELECT ${idCol} AS sid, ${tsCol ?? "NULL"} AS ts, * FROM sessions`).all() as Record<string, any>[];
  const upsertSession = target.prepare(`
    INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path)
    VALUES (?, 'crush', 'crush', ?, ?, 0, ?)
    ON CONFLICT(id) DO UPDATE SET agent = excluded.agent, ended_at = excluded.ended_at, source_path = excluded.source_path
  `);
  const findEvent = target.prepare("SELECT cost_usd, ts FROM usage_events WHERE dedup_key = ?");
  const deleteEvent = target.prepare("DELETE FROM usage_events WHERE dedup_key = ?");
  // cost_usd se escribe DIRECTO (excepción cost-only); model por fila si existe.
  const insertEvent = target.prepare(`
    INSERT INTO usage_events (dedup_key, session_id, ts, day, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd)
    VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, ?)
  `);

  let eventsInserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const sessionId = String(row.sid ?? "");
    const cost = Number(row.cost ?? 0);
    if (!sessionId || !Number.isFinite(cost)) { skipped++; continue; }
    const ts = toIsoTimestamp(row.ts) ?? new Date(0).toISOString(); // sin ts: epoch 0 (dato minimamente ubicable)
    const dedupKey = `crush::${sessionId}`;
    const existing = findEvent.get(dedupKey) as { cost_usd: number; ts: string } | undefined;
    if (existing && existing.cost_usd === cost && existing.ts === ts) {
      skipped++;
      continue;
    }
    const model = typeof row.model === "string" && row.model ? row.model : "crush";
    upsertSession.run(sessionId, ts, ts, sourcePath);
    const run = target.prepare("BEGIN");
    run.run();
    try {
      deleteEvent.run(dedupKey);
      insertEvent.run(dedupKey, sessionId, ts, ts.slice(0, 10), model, cost);
      target.prepare("COMMIT").run();
    } catch (err) {
      target.prepare("ROLLBACK").run();
      throw err;
    }
    eventsInserted++;
  }
  return { eventsInserted, skipped };
}
