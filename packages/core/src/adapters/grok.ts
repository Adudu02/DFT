/**
 * Adapter grok-cli (workstream A2). Fuente: `~/.grok/grok.db` (SQLite viva →
 * snapshot RO). Fixture-driven (grok no está instalado en la máquina de
 * desarrollo; README upstream no documenta la DB): tabla
 * `usage_events(session_id, model, input_tokens, output_tokens, total_tokens,
 * cost_micros)` — filas append-only por request.
 *
 * Semántica APPEND-ONLY: dedup `grok::<session>::<rowid>` + INSERT OR IGNORE
 * (reingesta incremental). Sin campos de cache (null tolerado). Los cost_micros
 * del proveedor se IGNORAN: equiv-API de pricing.json (0 + aviso si unknown).
 *
 * SUPUESTO a verificar contra una DB real: timestamp en la primera columna
 * disponible de (`created_at`, `timestamp`, `time_created`), aceptando epoch-s,
 * epoch-ms o ISO. Filas sin timestamp utilizable => skipped.
 */
import type { DB } from "../lib/db.js";
import { withSqliteSnapshot } from "../lib/sqlite-snapshot.js";
import { toIsoTimestamp } from "../lib/time.js";

export function grokSyncAdapter(sourcePath: string) {
  return {
    id: "grok",
    async sync(target: DB): Promise<{ eventsInserted: number; skipped: number }> {
      return withSqliteSnapshot(sourcePath, (snapshotDb) => doSync(target, sourcePath, snapshotDb));
    },
  };
}

async function doSync(target: DB, sourcePath: string, snapshotDb: import("better-sqlite3").Database): Promise<{ eventsInserted: number; skipped: number }> {
      const cols = (snapshotDb.prepare("PRAGMA table_info(usage_events)").all() as { name: string }[]).map(
        (c) => c.name,
      );
      if (!cols.length) throw new Error("sin tabla usage_events");
      const tsCol = ["created_at", "timestamp", "time_created"].find((c) => cols.includes(c));
      if (!tsCol) throw new Error("sin columna de timestamp reconocida");

      const insertEvent = target.prepare(`
        INSERT OR IGNORE INTO usage_events
          (dedup_key, session_id, ts, day, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
      `);
      const upsertSession = target.prepare(`
        INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path)
        VALUES (?, 'grok', 'grok', ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          agent = excluded.agent,
          ended_at = excluded.ended_at,
          source_path = excluded.source_path
      `);

      let eventsInserted = 0;
      let skipped = 0;
      const rows = snapshotDb
        .prepare(`SELECT rowid AS rid, * FROM usage_events ORDER BY rowid`)
        .all() as Record<string, any>[];

      const run = target.prepare("BEGIN");
      run.run();
      try {
        for (const row of rows) {
          const ts = toIsoTimestamp(row[tsCol]);
          if (!ts) {
            skipped++;
            continue;
          }
          const sessionId = String(row.session_id ?? "grok");
          const model = String(row.model ?? "unknown");
          const input = Number(row.input_tokens ?? 0);
          const output = Number(row.output_tokens ?? 0);
          const dedupKey = `grok::${sessionId}::${row.rid}`;
          const res = insertEvent.run(dedupKey, sessionId, ts, ts.slice(0, 10), model, input, output, 0);
          if (res.changes > 0) {
            upsertSession.run(sessionId, ts, ts, sourcePath);
            eventsInserted++;
          } else {
            skipped++;
          }
        }
        target.prepare("COMMIT").run();
      } catch (err) {
        target.prepare("ROLLBACK").run();
        throw err;
      }
      return { eventsInserted, skipped };
}

