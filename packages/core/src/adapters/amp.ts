/**
 * Adapter Amp (workstream A3). Fuente: `~/.local/share/amp/threads/T-<uuid>.json`
 * — un JSON por thread con `usage.{inputTokens, outputTokens,
 * cacheReadInputTokens, cacheCreationInputTokens, credits}` (agregado del
 * thread, camelCase vendor). Fixture-driven (sin datos locales).
 *
 * Semántica ACUMULATIVA por thread: reemplazo comparativo `amp::T-<uuid>`
 * (el usage del archivo ES el total; nunca se suma). `credits` se ignora:
 * costo equiv-API de pricing.json.
 */
import { readDirRO, readFileRO } from "../lib/fs-readonly.js";
import { basename, join } from "node:path";
import type { Dirent } from "node:fs";
import type { DB } from "../lib/db.js";
import { toIsoTimestamp } from "../lib/time.js";

export function ampSyncAdapter(threadsRoot: string) {
  return {
    id: "amp",
    async sync(target: DB): Promise<{ eventsInserted: number; skipped: number }> {
      let entries: Dirent[];
      try {
        entries = await readDirRO(threadsRoot);
      } catch {
        throw new Error(`sin directorio ${threadsRoot}`);
      }
      const upsertSession = target.prepare(`
        INSERT INTO sessions (id, agent, project, started_at, ended_at, turns, source_path)
        VALUES (?, 'amp', 'amp', ?, ?, 0, ?)
        ON CONFLICT(id) DO UPDATE SET agent = excluded.agent, ended_at = excluded.ended_at, source_path = excluded.source_path
      `);
      const findEvent = target.prepare("SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, ts FROM usage_events WHERE dedup_key = ?");
      const deleteEvent = target.prepare("DELETE FROM usage_events WHERE dedup_key = ?");
      const insertEvent = target.prepare(`
        INSERT INTO usage_events (dedup_key, session_id, ts, day, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let eventsInserted = 0;
      let skipped = 0;
      for (const e of entries) {
        if (!e.isFile() || !e.name.startsWith("T-") || !e.name.endsWith(".json")) continue;
        const path = join(threadsRoot, e.name);
        const sessionId = basename(e.name, ".json");
        let o: any;
        try {
          o = JSON.parse(await readFileRO(path));
        } catch {
          skipped++;
          continue;
        }
        const usage = o?.usage;
        if (!usage || typeof usage !== "object") { skipped++; continue; }
        const ts = toIsoTimestamp(o.updatedAt ?? o.createdAt ?? o.timestamp);
        if (!ts) { skipped++; continue; }
        const input = Number(usage.inputTokens ?? 0);
        const output = Number(usage.outputTokens ?? 0);
        const cacheRead = Number(usage.cacheReadInputTokens ?? 0);
        const cacheWrite = Number(usage.cacheCreationInputTokens ?? 0);
        const dedupKey = `amp::${sessionId}`;
        const existing = findEvent.get(dedupKey) as { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; ts: string } | undefined;
        if (existing && existing.input_tokens === input && existing.output_tokens === output && existing.cache_read_tokens === cacheRead && existing.cache_write_tokens === cacheWrite && existing.ts === ts) {
          skipped++;
          continue;
        }
        const model = typeof o.model === "string" && o.model ? o.model : "unknown";
        upsertSession.run(sessionId, ts, ts, path);
        const run = target.prepare("BEGIN");
        run.run();
        try {
          deleteEvent.run(dedupKey);
          insertEvent.run(dedupKey, sessionId, ts, ts.slice(0, 10), model, input, output, cacheWrite, cacheRead, 0);
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
