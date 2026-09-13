import type { DB } from "./db.js";

export interface ExportData {
  sessions: Record<string, unknown>[];
  usageEvents: Record<string, unknown>[];
}

/** Métricas exportables; los transcripts y prompts nunca salen de esta consulta. */
export function getExportData(db: DB): ExportData {
  const sessions = db.prepare(
    `SELECT id, agent, project, started_at AS startedAt, ended_at AS endedAt, turns
     FROM sessions ORDER BY COALESCE(ended_at, started_at) DESC, id DESC`,
  ).all() as Record<string, unknown>[];
  const usageEvents = db.prepare(
    `SELECT dedup_key AS dedupKey, session_id AS sessionId, ts, day, model,
            input_tokens AS inputTokens, output_tokens AS outputTokens,
            cache_write_tokens AS cacheWriteTokens, cache_read_tokens AS cacheReadTokens,
            cost_usd AS costUsd
     FROM usage_events ORDER BY ts DESC, dedup_key DESC`,
  ).all() as Record<string, unknown>[];
  return { sessions, usageEvents };
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Un CSV plano con ambos tipos de métrica, distinguibles por recordType. */
export function exportCsv(data: ExportData): string {
  const headers = ["recordType", "id", "agent", "project", "startedAt", "endedAt", "turns", "dedupKey", "sessionId", "ts", "day", "model", "inputTokens", "outputTokens", "cacheWriteTokens", "cacheReadTokens", "costUsd"];
  const rows: Record<string, unknown>[] = [
    ...data.sessions.map((row) => ({ recordType: "session", ...row })),
    ...data.usageEvents.map((row) => ({ recordType: "usage_event", ...row })),
  ];
  return `${[headers.join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\n")}\n`;
}
