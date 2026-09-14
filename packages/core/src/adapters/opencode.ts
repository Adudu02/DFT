/**
 * Adapter OpenCode (workstream A2). Fuente: `~/.local/share/opencode/opencode.db`
 * (SQLite viva → snapshot RO vía lib/sqlite-snapshot.ts). Schema VERIFICADO
 * contra DB real 2026-09-14: tabla `session` con tokens acumulativos por
 * sesión, `model` como JSON string, `directory` con el path del proyecto y
 * `time_created`/`time_updated` epoch-ms.
 *
 * Semántica ACUMULATIVA: una fila por sesión que crece con el uso. La sync usa
 * reemplazo comparativo (clave fija `opencode::<sessionId>`): si los valores no
 * cambiaron, 0 escrituras; si cambiaron, DELETE + INSERT (nunca doble conteo).
 * El `cost` propio de OpenCode se ignora: equiv-API de pricing.json.
 */
import type Database from "better-sqlite3";
import type { DB } from "../lib/db.js";

export function opencodeDbSyncAdapter(sourcePath: string) {
  return {
    id: "opencode",
    sourcePath,
    async sync(target: DB, snapshotDb: Database.Database): Promise<{ eventsInserted: number; skipped: number }> {
      const rows = snapshotDb.prepare("SELECT * FROM session").all() as Record<string, any>[];
      const upsertSession = target.prepare(`
        INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path)
        VALUES (?, 'opencode', ?, ?, ?, 0, ?)
        ON CONFLICT(id) DO UPDATE SET
          agent = excluded.agent, project = excluded.project,
          started_at = excluded.started_at, ended_at = excluded.ended_at,
          source_path = excluded.source_path
      `);
      const findEvent = target.prepare(
        "SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, ts FROM usage_events WHERE dedup_key = ?",
      );
      const deleteEvent = target.prepare("DELETE FROM usage_events WHERE dedup_key = ?");
      const insertEvent = target.prepare(`
        INSERT INTO usage_events
          (dedup_key, session_id, ts, day, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let eventsInserted = 0;
      let skipped = 0;
      for (const row of rows) {
        const sessionId: string = row.id;
        const model = parseModelId(row.model);
        const input = Number(row.tokens_input ?? 0);
        const output = Number(row.tokens_output ?? 0) + Number(row.tokens_reasoning ?? 0); // reasoning es salida
        const cacheRead = Number(row.tokens_cache_read ?? 0);
        const cacheWrite = Number(row.tokens_cache_write ?? 0);
        const ts = epochMsToIso(row.time_updated ?? row.time_created);
        if (!ts) {
          skipped++;
          continue;
        }
        const dedupKey = `opencode::${sessionId}`;
        const day = ts.slice(0, 10);

        const existing = findEvent.get(dedupKey) as
          | { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; ts: string }
          | undefined;
        if (
          existing &&
          existing.input_tokens === input &&
          existing.output_tokens === output &&
          existing.cache_read_tokens === cacheRead &&
          existing.cache_write_tokens === cacheWrite &&
          existing.ts === ts
        ) {
          skipped++; // sin cambios: reingesta idempotente, 0 escrituras
          continue;
        }

        upsertSession.run(sessionId, projectOf(row.directory), epochMsToIso(row.time_created) ?? ts, ts, sourcePath);
        const run = target.prepare("BEGIN");
        run.run();
        try {
          deleteEvent.run(dedupKey);
          insertEvent.run(dedupKey, sessionId, ts, day, model, input, output, cacheWrite, cacheRead, 0);
          target.prepare("COMMIT").run();
        } catch (err) {
          target.prepare("ROLLBACK").run();
          throw err;
        }
        eventsInserted++;
      }
      return { eventsInserted, skipped };
    },
  };
}

function projectOf(directory: unknown): string {
  if (typeof directory === "string" && directory.trim()) {
    const parts = directory.split("/").filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "opencode";
}

/** El model de OpenCode es JSON: {"id":"glm-5.3","providerID":"zai",...}. */
function parseModelId(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "unknown";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && parsed.id) return parsed.id;
  } catch {
    // no era JSON: usar el crudo
  }
  return raw;
}

function epochMsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}
