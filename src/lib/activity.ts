/**
 * Página Actividad (PLAN §4.4): timeline de sesiones por día (según ended_at) y
 * drill-down por sesión con desglose de tokens/costo por modelo.
 */
import type { DB } from "./db.js";

export interface ActivitySession {
  id: string;
  project: string;
  agent: string;
  startedAt: string | null;
  endedAt: string | null;
  turns: number;
  costUsd: number;
  models: string[];
}

export interface ActivityDay {
  day: string;
  sessions: ActivitySession[];
}

export interface ModelBreakdown {
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  costUsd: number;
}

export interface SessionDetail {
  id: string;
  project: string;
  agent: string;
  startedAt: string | null;
  endedAt: string | null;
  turns: number;
  totalCostUsd: number;
  models: ModelBreakdown[];
}

/** Sesiones agrupadas por día (día = substr de ended_at), más reciente primero. */
export function getActivity(db: DB): ActivityDay[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.project, s.agent, s.started_at AS startedAt, s.ended_at AS endedAt, s.turns,
              COALESCE(SUM(u.cost_usd), 0) AS costUsd,
              GROUP_CONCAT(DISTINCT u.model) AS models
       FROM sessions s LEFT JOIN usage_events u ON u.session_id = s.id
       GROUP BY s.id ORDER BY s.ended_at DESC`,
    )
    .all() as (Omit<ActivitySession, "models"> & { models: string | null })[];

  const byDay = new Map<string, ActivityDay>();
  for (const r of rows) {
    const day = (r.endedAt ?? r.startedAt ?? "").slice(0, 10);
    if (!day) continue;
    let d = byDay.get(day);
    if (!d) {
      d = { day, sessions: [] };
      byDay.set(day, d);
    }
    d.sessions.push({ ...r, models: r.models ? r.models.split(",") : [] });
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

export function getSessionDetail(db: DB, id: string): SessionDetail | null {
  const s = db
    .prepare(
      "SELECT id, project, agent, started_at AS startedAt, ended_at AS endedAt, turns FROM sessions WHERE id = ?",
    )
    .get(id) as Omit<SessionDetail, "totalCostUsd" | "models"> | undefined;
  if (!s) return null;

  const models = db
    .prepare(
      `SELECT model,
              SUM(input_tokens) AS input, SUM(output_tokens) AS output,
              SUM(cache_write_tokens) AS cacheWrite, SUM(cache_read_tokens) AS cacheRead,
              SUM(cost_usd) AS costUsd
       FROM usage_events WHERE session_id = ? GROUP BY model ORDER BY costUsd DESC`,
    )
    .all(id) as unknown as ModelBreakdown[];

  return { ...s, totalCostUsd: models.reduce((n, m) => n + m.costUsd, 0), models };
}
