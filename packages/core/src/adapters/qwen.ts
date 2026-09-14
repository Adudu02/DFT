/**
 * Adapter Qwen (F-qwen). Transcripts en ~/.qwen/:
 *  - `usage/token-usage-YYYY-MM.jsonl`: uso per-request (fuente primaria de tokens).
 *  - `usage_record.jsonl`: metadata por sesión (sessionId → project).
 *  - `projects/<hash>/chats/<session>.jsonl`: transcripts completos (para prompts).
 *  - `projects/<hash>/chats/<session>.runtime.json`: metadata de sesión.
 * SOLO LECTURA.
 *
 * Formato usage file (verificado):
 *   { sessionId, model, timestamp, inputTokens, outputTokens, cachedTokens,
 *     thoughtsTokens, totalTokens }
 *
 * Mapeo al modelo normalizado:
 *   input  = inputTokens - cachedTokens  (el input "crudo" sin caché)
 *   output = outputTokens + thoughtsTokens  (thinking es salida)
 *   cacheRead = cachedTokens
 *   cacheWrite = 0  (Qwen no expone cache creation)
 */
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { readDirRO } from "../lib/fs-readonly.js";
import type { ParsedLine, SkillUsage, UsageEvent } from "./types.js";

export function defaultQwenRoot(): string {
  return join(homedir(), ".qwen");
}

function splitLines(raw: string): string[] {
  const parts = raw.split("\n");
  return parts.length && parts[parts.length - 1] === "" ? parts.slice(0, -1) : parts;
}

/**
 * Construye el mapa sessionId → project desde usage_record.jsonl.
 * Este archivo tiene un resumen por sesión con el campo `project` (work_dir).
 */
export function parseQwenSessionProjectMap(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of splitLines(raw)) {
    const t = line.trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    if (o?.sessionId && o?.project) {
      map.set(String(o.sessionId), String(o.project));
    }
  }
  return map;
}

/**
 * Extrae el nombre del proyecto desde un path de trabajo.
 * Usa el último componente del directorio (ej: "/home/user/projects/foo" → "foo").
 */
function projectFromPath(workDir: string): string {
  return basename(workDir) || "qwen";
}

/**
 * Parsea las líneas de un archivo token-usage-YYYY-MM.jsonl.
 * Cada línea es un request con sus tokens. El sessionId se extrae del evento.
 */
export function parseQwenUsageLines(
  raw: string,
  _sessionProjectMap: Map<string, string>,
  fromLine = 0,
): { events: ParsedLine[]; lineCount: number; skipped: number } {
  const lines = splitLines(raw);
  const events: ParsedLine[] = [];
  let skipped = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      if (i >= fromLine) skipped++;
      continue;
    }
    if (i < fromLine) continue;

    // Solo procesar líneas con datos de uso
    if (!o?.sessionId || !o?.model) continue;
    const inputTokens = o.inputTokens ?? 0;
    const outputTokens = o.outputTokens ?? 0;
    const cachedTokens = o.cachedTokens ?? 0;
    const thoughtsTokens = o.thoughtsTokens ?? 0;

    // Skip si no hay tokens
    if (inputTokens + outputTokens + cachedTokens + thoughtsTokens === 0) continue;

    const sessionId = String(o.sessionId);
    const ts = String(o.timestamp ?? "");
    const event: UsageEvent = {
      sessionId,
      ts,
      day: ts.slice(0, 10),
      model: String(o.model),
      // input = inputTokens - cachedTokens (el input "nuevo" sin caché)
      input: Math.max(0, inputTokens - cachedTokens),
      // output incluye thinking tokens
      output: outputTokens + thoughtsTokens,
      cacheWrite: 0, // Qwen no expone cache creation
      cacheRead: cachedTokens,
    };
    events.push({ dedupKey: `qwen::${o.id || `${sessionId}::${i}`}`, event });
  }
  return { events, lineCount: lines.length, skipped };
}

/**
 * Descubre todos los archivos token-usage-*.jsonl en ~/.qwen/usage/.
 * SEGURIDAD: lista blanca por nombre — solo `token-usage-*.jsonl`.
 */
export async function discoverQwenUsageFiles(root: string = defaultQwenRoot()): Promise<string[]> {
  const usageDir = join(root, "usage");
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readDirRO(usageDir);
  } catch {
    return []; // no hay ~/.qwen/usage
  }
  for (const e of entries) {
    if (e.isFile() && e.name.startsWith("token-usage-") && e.name.endsWith(".jsonl")) {
      out.push(join(usageDir, e.name));
    }
  }
  return out.sort();
}

/**
 * Lee usage_record.jsonl para construir el mapa sessionId → project.
 * Si no existe, devuelve mapa vacío.
 */
export async function loadQwenSessionProjectMap(root: string = defaultQwenRoot()): Promise<Map<string, string>> {
  const { readFileRO } = await import("../lib/fs-readonly.js");
  const path = join(root, "usage_record.jsonl");
  try {
    const raw = await readFileRO(path);
    return parseQwenSessionProjectMap(raw);
  } catch {
    return new Map();
  }
}

/**
 * Deriva sessionId y project desde un archivo de usage.
 * El sessionId viene del contenido (primer registro); el project del mapa.
 */
export function deriveQwenIdsFromUsage(
  raw: string,
  sessionProjectMap: Map<string, string>,
): { sessionId: string; project: string } {
  // Tomar el primer sessionId del archivo
  for (const line of splitLines(raw)) {
    const t = line.trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    if (o?.sessionId) {
      const sessionId = String(o.sessionId);
      const workDir = sessionProjectMap.get(sessionId);
      return { sessionId, project: workDir ? projectFromPath(workDir) : "qwen" };
    }
  }
  return { sessionId: "", project: "qwen" };
}

/**
 * Extrae prompts del usuario desde un chat JSONL de Qwen.
 * Formato: { type: "user", message: { role: "user", parts: [{ text: "..." }] } }
 */
export function parseQwenPrompts(raw: string): { ts: string; prompt: string }[] {
  const out: { ts: string; prompt: string }[] = [];
  for (const line of splitLines(raw)) {
    const t = line.trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    if (o?.type !== "user") continue;
    const parts = o.message?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts
      .filter((p: any) => p?.type === "text" || (typeof p?.text === "string" && !p?.thought))
      .map((p: any) => p.text)
      .join("\n");
    if (!text) continue;
    // Limpiar el prompt
    const clean = text
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) continue;
    out.push({ ts: String(o.timestamp ?? ""), prompt: clean.slice(0, 2000) });
  }
  return out;
}

/**
 * Descubre todos los chats JSONL bajo projects/{hash}/chats/.
 * Retorna rutas ordenadas.
 */
export async function discoverQwenChats(root: string = defaultQwenRoot()): Promise<string[]> {
  const projectsDir = join(root, "projects");
  const out: string[] = [];
  let projects: Dirent[];
  try {
    projects = await readDirRO(projectsDir);
  } catch {
    return [];
  }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const chatsDir = join(projectsDir, p.name, "chats");
    let chatEntries: Dirent[];
    try {
      chatEntries = await readDirRO(chatsDir);
    } catch {
      continue;
    }
    for (const c of chatEntries) {
      if (c.isFile() && c.name.endsWith(".jsonl") && !c.name.endsWith(".runtime.json")) {
        out.push(join(chatsDir, c.name));
      }
    }
  }
  return out.sort();
}

/** Detecta comandos (/skill) en mensajes de usuario de Qwen. */
export function parseQwenSkills(raw: string, fromLine = 0): SkillUsage[] {
  const out: SkillUsage[] = [];
  for (const [i, line] of splitLines(raw).entries()) {
    if (i < fromLine) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o?.type !== "user" || !Array.isArray(o.message?.parts)) continue;
    const text = o.message.parts
      .filter((p: any) => typeof p?.text === "string")
      .map((p: any) => p.text)
      .join("\n");
    for (const match of text.matchAll(/(?:^|\n)\s*\/([\w.:-]+)(?=\s|$)/g)) {
      out.push({ skill: match[1], ts: String(o.timestamp ?? ""), kind: "command" });
    }
  }
  return out;
}

/** Clase adapter para Qwen, paralela a ClaudeCodeAdapter y CodexAdapter. */
export class QwenAdapter {
  readonly id = "qwen";
  constructor(private root: string = defaultQwenRoot()) {}

  /** Rutas de todos los archivos token-usage-*.jsonl. */
  discoverSessions(): Promise<string[]> {
    return discoverQwenUsageFiles(this.root);
  }

  async parseSession(path: string) {
    const { readFileRO } = await import("../lib/fs-readonly.js");
    const raw = await readFileRO(path);
    const sessionMap = await loadQwenSessionProjectMap(this.root);
    const { sessionId, project } = deriveQwenIdsFromUsage(raw, sessionMap);
    const { events } = parseQwenUsageLines(raw, sessionMap);
    return {
      id: sessionId || basename(path, ".jsonl"),
      agent: this.id,
      project,
      events: events.map((e) => e.event),
    };
  }
}
