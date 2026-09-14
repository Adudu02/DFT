/**
 * Adapter Goose (workstream A3). Fuente: `~/.local/share/goose/sessions/
 * sessions.db` (SQLite viva → snapshot RO). Fixture-driven (sin datos
 * locales): tabla `sessions` con contadores acumulativos por sesión —
 * `input_tokens`/`output_tokens` (o `accumulated_*`), sin cache/reasoning
 * (0 tolerado). Semántica ACUMULATIVA tipo OpenCode: reemplazo comparativo
 * `goose::<id>`, nunca suma (así se satisface la advertencia del plan sobre
 * contadores acumulativos).
 */
import type { DB } from "../lib/db.js";
import { withSqliteSnapshot } from "../lib/sqlite-snapshot.js";
import { toIsoTimestamp } from "../lib/time.js";

export function gooseSyncAdapter(sourcePath: string) {
  return {
    id: "goose",
    async sync(target: DB): Promise<{ eventsInserted: number; skipped: number }> {
      return withSqliteSnapshot(sourcePath, (snapshotDb) => doSync(target, sourcePath, snapshotDb));
    },
  };
}

async function doSync(target: DB, sourcePath: string, snapshotDb: import("better-sqlite3").Database): Promise<{ eventsInserted: number; skipped: number }> {
  const cols = (snapshotDb.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.length) throw new Error("sin tabla sessions");
  const idCol = cols.includes("session_id") ? "session_id" : "id";
  const tsCol = ["updated_at", "created_at", "timestamp", "time_created"].find((c) => cols.includes(c));
  const inputCol = cols.includes("input_tokens") ? "input_tokens" : cols.includes("accumulated_input_tokens") ? "accumulated_input_tokens" : null;
  const outputCol = cols.includes("output_tokens") ? "output_tokens" : cols.includes("accumulated_output_tokens") ? "accumulated_output_tokens" : null;

  const rows = snapshotDb.prepare(`SELECT ${idCol} AS sid, ${tsCol ?? "NULL"} AS ts, ${inputCol ?? "0"} AS inp, ${outputCol ?? "0"} AS out, * FROM sessions`).all() as Record<string, any>[];
  const upsertSession = target.prepare(`
    INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path)
    VALUES (?, 'goose', 'goose', ?, ?, 0, ?)
    ON CONFLICT(id) DO UPDATE SET agent = excluded.agent, ended_at = excluded.ended_at, source_path = excluded.source_path
  `);
  const findEvent = target.prepare("SELECT input_tokens, output_tokens, ts FROM usage_events WHERE dedup_key = ?");
  const deleteEvent = target.prepare("DELETE FROM usage_events WHERE dedup_key = ?");
  const insertEvent = target.prepare(`
    INSERT INTO usage_events (dedup_key, session_id, ts, day, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
  `);

  let eventsInserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const sessionId = String(row.sid ?? "");
    if (!sessionId) { skipped++; continue; }
    const ts = toIsoTimestamp(row.ts);
    if (!ts) { skipped++; continue; }
    const input = Number(row.inp ?? 0);
    const output = Number(row.out ?? 0);
    const dedupKey = `goose::${sessionId}`;
    const existing = findEvent.get(dedupKey) as { input_tokens: number; output_tokens: number; ts: string } | undefined;
    if (existing && existing.input_tokens === input && existing.output_tokens === output && existing.ts === ts) {
      skipped++;
      continue;
    }
    const model = typeof row.model === "string" && row.model ? row.model : "unknown";
    upsertSession.run(sessionId, ts, ts, sourcePath);
    const run = target.prepare("BEGIN");
    run.run();
    try {
      deleteEvent.run(dedupKey);
      insertEvent.run(dedupKey, sessionId, ts, ts.slice(0, 10), model, input, output, 0);
      target.prepare("COMMIT").run();
    } catch (err) {
      target.prepare("ROLLBACK").run();
      throw err;
    }
    eventsInserted++;
  }
  return { eventsInserted, skipped };
}
