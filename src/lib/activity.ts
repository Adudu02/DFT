/**
 * Página Actividad (PLAN §4.4): timeline de sesiones por día (según ended_at) y
 * drill-down por sesión con desglose de tokens/costo por modelo.
 *
 * PRIVACIDAD: los prompts NO se guardan en la DB. `getSessionTurns` los lee del
 * transcript original (solo lectura) en el momento de la consulta y los devuelve
 * sin persistirlos — la garantía "la DB solo guarda métricas" sigue intacta.
 */
import { readFileRO } from "./fs-readonly.js";
import { dayInTz } from "./time.js";
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
export function getActivity(db: DB, timeZone?: string): ActivityDay[] {
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
    const src = r.endedAt ?? r.startedAt ?? "";
    const day = src ? dayInTz(src, timeZone) : "";
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

export interface SessionTurn {
  ts: string; // ISO del prompt (UTC, como viene del transcript)
  time: string; // HH:MM ya en la zona horaria de config.timeZone
  prompt: string;
  costUsd: number; // costo de los turnos del agente hasta el siguiente prompt
  tokens: number;
}

/** HH:MM en `timeZone` (vacío = zona del sistema). Zona inválida => cae a UTC. */
function hhmm(ts: string, timeZone?: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts.slice(11, 16);
  try {
    return d.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return ts.slice(11, 16); // timeZone inválida en config
  }
}

const MAX_PROMPT_CHARS = 2000; // se puede expandir en la UI, así que cabe más

/** Texto plano de un content de Claude Code (string o bloques). null si no es prompt real. */
function claudeUserText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  // Los tool_result llegan como type "user" pero no son algo que el usuario escribió.
  if (content.some((b: any) => b?.type === "tool_result")) return null;
  const text = content
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n");
  return text || null;
}

/** Limpia envoltorios (system-reminder, command wrappers) y recorta. */
function cleanPrompt(raw: string): string {
  const t = raw
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<local-command-[\s\S]*?>[\s\S]*?<\/local-command-[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > MAX_PROMPT_CHARS ? t.slice(0, MAX_PROMPT_CHARS) + "…" : t;
}

/** Prompts del usuario en un transcript (Claude Code o Codex), en orden. */
function extractPrompts(raw: string): { ts: string; prompt: string }[] {
  const out: { ts: string; prompt: string }[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    let text: string | null = null;
    if (o.type === "user") {
      text = claudeUserText(o.message?.content); // Claude Code
    } else if (o.type === "event_msg" && o.payload?.type === "user_message") {
      text = typeof o.payload.message === "string" ? o.payload.message : null; // Codex
    }
    if (!text) continue;
    const prompt = cleanPrompt(text);
    if (!prompt) continue;
    out.push({ ts: String(o.timestamp ?? ""), prompt });
  }
  return out;
}

/**
 * Turnos de una sesión: cada prompt del usuario con su hora y lo que costaron
 * las respuestas hasta el siguiente prompt. Lee el transcript en SOLO LECTURA;
 * no persiste nada.
 */
export async function getSessionTurns(
  db: DB,
  id: string,
  timeZone?: string,
): Promise<SessionTurn[] | null> {
  const row = db.prepare("SELECT source_path AS path FROM sessions WHERE id = ?").get(id) as
    | { path: string | null }
    | undefined;
  if (!row) return null;
  if (!row.path) return []; // sesión ingerida antes de guardar la ruta => rebuild

  let raw: string;
  try {
    raw = await readFileRO(row.path);
  } catch {
    return []; // el transcript ya no está donde estaba
  }

  const prompts = extractPrompts(raw);
  if (prompts.length === 0) return [];

  const events = db
    .prepare("SELECT ts, cost_usd AS costUsd, input_tokens + output_tokens + cache_write_tokens + cache_read_tokens AS tokens FROM usage_events WHERE session_id = ? ORDER BY ts")
    .all(id) as { ts: string; costUsd: number; tokens: number }[];

  // Cada evento se atribuye al último prompt anterior a él.
  return prompts.map((p, i) => {
    const next = prompts[i + 1]?.ts ?? "￿";
    const mine = events.filter((e) => e.ts >= p.ts && e.ts < next);
    return {
      ts: p.ts,
      time: hhmm(p.ts, timeZone),
      prompt: p.prompt,
      costUsd: mine.reduce((n, e) => n + e.costUsd, 0),
      tokens: mine.reduce((n, e) => n + e.tokens, 0),
    };
  });
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
