/**
 * Página Actividad (PLAN §4.4): timeline de sesiones por día (según ended_at) y
 * drill-down por sesión con desglose de tokens/costo por modelo.
 *
 * PRIVACIDAD: los prompts NO se guardan en la DB. `getSessionTurns` los lee del
 * transcript original o de un snapshot temporal read-only de OpenCode al
 * consultarlos — la garantía "la DB solo guarda métricas" sigue intacta.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { readFileRO } from "./fs-readonly.js";
import { dayInTz, toIsoTimestamp } from "./time.js";
import { withSqliteSnapshot } from "./sqlite-snapshot.js";
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

export interface ActivityPage {
  days: ActivityDay[];
  nextCursor: string | null;
}

export interface ActivityFilters {
  cursor?: string;
  limit?: number;
  project?: string;
  agent?: string;
  model?: string;
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

function encodeCursor(endedAt: string, id: string): string {
  return Buffer.from(JSON.stringify([endedAt, id])).toString("base64url");
}

function decodeCursor(cursor?: string): [string, string] | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string" ? [parsed[0], parsed[1]] : null;
  } catch {
    return null;
  }
}

function toDays(rows: (ActivitySession & { orderAt: string })[], timeZone?: string): ActivityDay[] {
  const byDay = new Map<string, ActivityDay>();
  for (const r of rows) {
    const day = r.orderAt ? dayInTz(r.orderAt, timeZone) : "";
    if (!day) continue;
    let d = byDay.get(day);
    if (!d) {
      d = { day, sessions: [] };
      byDay.set(day, d);
    }
    d.sessions.push({
      id: r.id,
      project: r.project,
      agent: r.agent,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      turns: r.turns,
      costUsd: r.costUsd,
      models: r.models,
    });
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/** Sesiones paginadas, filtrables y agrupadas por día; cursor = ended_at + id. */
export function getActivityPage(db: DB, filters: ActivityFilters = {}, timeZone?: string): ActivityPage {
  const limit = Number.isFinite(filters.limit) ? Math.max(1, Math.min(Math.floor(filters.limit as number), 100)) : 50;
  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (filters.project) {
    clauses.push("s.project = ?");
    args.push(filters.project);
  }
  if (filters.agent) {
    clauses.push("s.agent = ?");
    args.push(filters.agent);
  }
  if (filters.model) {
    clauses.push("EXISTS (SELECT 1 FROM usage_events um WHERE um.session_id = s.id AND um.model = ?)");
    args.push(filters.model);
  }
  const cursor = decodeCursor(filters.cursor);
  if (filters.cursor && !cursor) throw new Error("cursor inválido");
  if (cursor) {
    clauses.push("(COALESCE(s.ended_at, s.started_at, '') < ? OR (COALESCE(s.ended_at, s.started_at, '') = ? AND s.id < ?))");
    args.push(cursor[0], cursor[0], cursor[1]);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT s.id, s.project, s.agent, s.started_at AS startedAt, s.ended_at AS endedAt, s.turns,
              COALESCE(s.ended_at, s.started_at, '') AS orderAt,
              COALESCE(SUM(u.cost_usd), 0) AS costUsd,
              GROUP_CONCAT(DISTINCT u.model) AS models
       FROM sessions s LEFT JOIN usage_events u ON u.session_id = s.id
       ${where}
       GROUP BY s.id ORDER BY orderAt DESC, s.id DESC LIMIT ?`,
    )
    .all(...args, limit + 1) as (Omit<ActivitySession, "models"> & { orderAt: string; models: string | null })[];
  const pageRows = rows.slice(0, limit).map((r) => ({ ...r, models: r.models ? r.models.split(",") : [] }));
  const last = pageRows.at(-1);
  return { days: toDays(pageRows, timeZone), nextCursor: rows.length > limit && last ? encodeCursor(last.orderAt, last.id) : null };
}

/** Compatibilidad para los consumidores internos que aún necesitan todo. */
export function getActivity(db: DB, timeZone?: string): ActivityDay[] {
  return getActivityPage(db, { limit: 100 }, timeZone).days;
}

export interface PromptSearchResult {
  id: string;
  project: string;
  agent: string;
  startedAt: string | null;
  endedAt: string | null;
  prompt: string;
}

/** Busca texto en transcripts existentes sin guardar prompts en SQLite. */
export async function searchPrompts(
  db: DB,
  query: string,
  limit = 30,
  filters: Pick<ActivityFilters, "project" | "agent" | "model"> = {},
): Promise<PromptSearchResult[]> {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2) throw new Error("la búsqueda debe tener al menos 2 caracteres");
  const clauses = ["source_path IS NOT NULL"];
  const args: string[] = [];
  if (filters.project) {
    clauses.push("project = ?");
    args.push(filters.project);
  }
  if (filters.agent) {
    clauses.push("agent = ?");
    args.push(filters.agent);
  }
  if (filters.model) {
    clauses.push("EXISTS (SELECT 1 FROM usage_events um WHERE um.session_id = sessions.id AND um.model = ?)");
    args.push(filters.model);
  }
  const sessions = db
    .prepare(
      `SELECT id, project, agent, started_at AS startedAt, ended_at AS endedAt, source_path AS path
       FROM sessions WHERE ${clauses.join(" AND ")}
       ORDER BY COALESCE(ended_at, started_at) DESC, id DESC LIMIT 200`,
    )
    .all(...args) as { id: string; project: string; agent: string; startedAt: string | null; endedAt: string | null; path: string }[];
  const max = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 50)) : 30;
  const results: PromptSearchResult[] = [];
  const idsByPath = new Map<string, string[]>();
  for (const session of sessions) {
    if (!isBinarySource(session.path)) continue;
    const ids = idsByPath.get(session.path) ?? [];
    ids.push(session.id);
    idsByPath.set(session.path, ids);
  }
  const promptsByPath = new Map<string, Map<string, { ts: string; prompt: string }[]>>();
  for (const session of sessions) {
    if (results.length >= max) break;
    if (isBinarySource(session.path)) {
      let promptsBySession = promptsByPath.get(session.path);
      if (!promptsBySession) {
        promptsBySession = await opencodePrompts(session.path, idsByPath.get(session.path) ?? []);
        promptsByPath.set(session.path, promptsBySession);
      }
      for (const item of promptsBySession.get(session.id) ?? []) {
        if (!item.prompt.toLocaleLowerCase().includes(needle)) continue;
        results.push({ ...session, prompt: item.prompt.slice(0, 300) });
        if (results.length >= max) break;
      }
      continue;
    }
    // Streaming línea a línea (solo lectura): nunca carga el transcript completo.
    const input = createReadStream(session.path, { encoding: "utf8" });
    const rl = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const item = promptFromLine(line);
        if (!item || !item.prompt.toLocaleLowerCase().includes(needle)) continue;
        results.push({ ...session, prompt: item.prompt.slice(0, 300) });
        if (results.length >= max) break;
      }
    } catch {
    } finally {
      rl.close();
      input.destroy();
    }
  }
  return results;
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
  if (Number.isNaN(d.getTime())) return ts.slice(11, 16);
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
  return t.length > MAX_PROMPT_CHARS ? `${t.slice(0, MAX_PROMPT_CHARS)}…` : t;
}

/**
 * Prompt de usuario en UNA línea de transcript (Claude Code o Codex), o null.
 * Codex tiene dos formatos según versión: el legado `event_msg/user_message`
 * y el actual `response_item` con `payload.message` (role=user, bloques
 * `input_text`). Los bloques de contexto inyectado (AGENTS.md, environment)
 * se descartan: no son prompts del usuario.
 */
const INJECTED_CONTEXT = /^(#\s*AGENTS\.md instructions|<environment_context>|<user_instructions>|<ENVIRONMENT_CONTEXT>)/i;

function promptFromLine(line: string): { ts: string; prompt: string } | null {
  const t = line.trim();
  if (!t) return null;
  let o: any;
  try {
    o = JSON.parse(t);
  } catch {
    return null;
  }
  let text: string | null = null;
  if (o.type === "user") {
    text = claudeUserText(o.message?.content); // Claude Code
  } else if (o.type === "event_msg" && o.payload?.type === "user_message") {
    text = typeof o.payload.message === "string" ? o.payload.message : null; // Codex legado
  } else if (o.type === "response_item" && o.payload?.type === "message" && o.payload?.role === "user") {
    const blocks: any[] = Array.isArray(o.payload.content) ? o.payload.content : [];
    text =
      blocks
        .map((b) => (b?.type === "input_text" && typeof b.text === "string" ? b.text : null))
        .filter((s): s is string => s !== null)
        .filter((s) => !INJECTED_CONTEXT.test(s.trimStart()))
        .join("\n") || null; // Codex actual (2026+)
  }
  if (!text) return null;
  const prompt = cleanPrompt(text);
  if (!prompt) return null;
  return { ts: String(o.timestamp ?? ""), prompt };
}

/** Prompts del usuario en un transcript (Claude Code o Codex), en orden. */
function extractPrompts(raw: string): { ts: string; prompt: string }[] {
  const out: { ts: string; prompt: string }[] = [];
  for (const line of raw.split("\n")) {
    const item = promptFromLine(line);
    if (item) out.push(item);
  }
  return out;
}

/** Fuentes que no son transcripts JSONL (p.ej. el opencode.db de OpenCode). */
function isBinarySource(path: string): boolean {
  return /\.(db|sqlite|sqlite3)$/i.test(path);
}

/**
 * Lee prompts OpenCode desde un snapshot temporal; nunca abre la fuente para
 * escribir ni persiste el texto.
 */
export async function opencodePrompts(sourcePath: string, sessionIds: string[]): Promise<Map<string, { ts: string; prompt: string }[]>> {
  const out = new Map<string, { ts: string; prompt: string }[]>();
  if (sessionIds.length === 0) return out;
  try {
    return await withSqliteSnapshot(sourcePath, (snapshot) => {
      const rows = snapshot
        .prepare(
          `SELECT m.id AS mid, m.session_id AS sid, m.time_created AS mts, m.data AS mdata, p.data AS pdata
           FROM message m JOIN part p ON p.message_id = m.id
           WHERE m.session_id IN (${sessionIds.map(() => "?").join(",")})
           ORDER BY m.session_id, m.time_created, m.id, p.time_created, p.id`,
        )
        .all(...sessionIds) as { mid: string; sid: string; mts: unknown; mdata: string; pdata: string }[];
      const messages = new Map<string, { sid: string; mts: unknown; texts: string[] }>();
      for (const row of rows) {
        let messageData: unknown;
        let partData: unknown;
        try {
          messageData = JSON.parse(row.mdata);
          partData = JSON.parse(row.pdata);
        } catch {
          continue;
        }
        if (!messageData || typeof messageData !== "object" || Array.isArray(messageData)) continue;
        if (!partData || typeof partData !== "object" || Array.isArray(partData)) continue;
        if ((messageData as { role?: unknown }).role !== "user") continue;
        const part = partData as { type?: unknown; text?: unknown; synthetic?: unknown; ignored?: unknown };
        if (part.type !== "text" || typeof part.text !== "string" || part.synthetic === true || part.ignored === true) continue;
        let message = messages.get(row.mid);
        if (!message) {
          message = { sid: row.sid, mts: row.mts, texts: [] };
          messages.set(row.mid, message);
        }
        message.texts.push(part.text);
      }
      for (const message of messages.values()) {
        const ts = toIsoTimestamp(message.mts);
        if (!ts) continue;
        const prompt = cleanPrompt(message.texts.join("\n"));
        if (!prompt) continue;
        const prompts = out.get(message.sid) ?? [];
        prompts.push({ ts, prompt });
        out.set(message.sid, prompts);
      }
      return out;
    });
  } catch {
    return new Map();
  }
}

/** Divide en unidades enteras y concentra el residuo por redondeo en el último turno. */
export function evenSplit(total: number, n: number, scale: number): number[] {
  if (n <= 0) return [];
  const units = Math.round(total * scale);
  const base = Math.floor(units / n);
  const rows = Array.from({ length: n - 1 }, () => base / scale);
  rows.push(total - rows.reduce((sum, row) => sum + row, 0));
  return rows;
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
  if (isBinarySource(row.path)) {
    const prompts = (await opencodePrompts(row.path, [id])).get(id) ?? [];
    if (prompts.length === 0) return [];
    const totals = db
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS cost,
                COALESCE(SUM(input_tokens + output_tokens + cache_write_tokens + cache_read_tokens), 0) AS tokens
         FROM usage_events WHERE session_id = ?`,
      )
      .get(id) as { cost: number; tokens: number };
    const costs = evenSplit(totals.cost, prompts.length, 1e6);
    const tokens = evenSplit(totals.tokens, prompts.length, 1);
    return prompts.map((prompt, i) => ({
      ...prompt,
      time: hhmm(prompt.ts, timeZone),
      costUsd: costs[i],
      tokens: tokens[i],
    }));
  }

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
