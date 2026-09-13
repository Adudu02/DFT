/**
 * Adapter Codex (PLAN §1.2 / F5). Transcripts JSONL "rollout" en
 * ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl y ~/.codex/archived_sessions/.
 * SOLO LECTURA.
 *
 * Formato (verificado sobre archivos reales):
 *  - `session_meta` (línea 0): payload.session_id, payload.cwd.
 *  - `turn_context`: payload.model (ej. "gpt-5.5") — fija el modelo de los
 *    token_count siguientes.
 *  - `event_msg` con payload.type "token_count": payload.info.last_token_usage
 *    = uso de UNA petición { input_tokens (incluye cached), cached_input_tokens,
 *    cache_write_input_tokens, output_tokens }. Se emite un UsageEvent por cada
 *    uno (mapeo: input = input_tokens − cached; cacheRead = cached).
 *
 * Modelo desconocido (gpt-*) => se conserva; la tarifa se decide en el motor de
 * costos (0 + badge hasta que el usuario lo agregue a pricing.json).
 */
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { readDirRO, readFileRO } from "../lib/fs-readonly.js";
import type { SkillUsage, UsageEvent } from "./types.js";

export function defaultCodexRoot(): string {
  return join(homedir(), ".codex");
}

interface ParsedLine {
  dedupKey: string;
  event: UsageEvent;
}

function splitLines(raw: string): string[] {
  const parts = raw.split("\n");
  return parts.length && parts[parts.length - 1] === "" ? parts.slice(0, -1) : parts;
}

/** session_id y cwd del primer session_meta (el que corresponde al archivo). */
export function parseCodexMeta(raw: string): { sessionId: string; cwd: string } {
  for (const line of splitLines(raw)) {
    const t = line.trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    if (o?.type === "session_meta") {
      const p = o.payload ?? {};
      return { sessionId: String(p.session_id ?? ""), cwd: String(p.cwd ?? "") };
    }
  }
  return { sessionId: "", cwd: "" };
}

/**
 * Un UsageEvent por token_count (usa last_token_usage = uso de una petición). El
 * modelo se toma del turn_context más reciente. Escanea desde 0 para conocer el
 * modelo en `fromLine`, pero solo emite eventos con índice >= fromLine.
 */
export function parseCodexLines(
  raw: string,
  sessionId: string,
  fromLine = 0,
): { events: ParsedLine[]; lineCount: number; skipped: number } {
  const lines = splitLines(raw);
  const events: ParsedLine[] = [];
  let model = "unknown";
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
    if (o?.type === "turn_context" && o.payload?.model) {
      model = String(o.payload.model);
      continue;
    }
    if (o?.type === "event_msg" && o.payload?.type === "token_count") {
      if (i < fromLine) continue; // ya ingerido
      const u = o.payload.info?.last_token_usage;
      if (!u) continue;
      const cached = u.cached_input_tokens ?? 0;
      const ts = String(o.timestamp ?? "");
      const event: UsageEvent = {
        sessionId,
        ts,
        day: ts.slice(0, 10),
        model,
        input: Math.max(0, (u.input_tokens ?? 0) - cached),
        output: u.output_tokens ?? 0,
        cacheWrite: u.cache_write_input_tokens ?? 0,
        cacheRead: cached,
      };
      if (event.input + event.output + event.cacheWrite + event.cacheRead === 0) continue;
      events.push({ dedupKey: `codex::${sessionId || "nosess"}::${i}`, event });
    }
  }
  return { events, lineCount: lines.length, skipped };
}

/**
 * Rutas de todos los rollout-*.jsonl bajo sessions/** y archived_sessions/.
 * SEGURIDAD: lista blanca por nombre — solo `rollout-*.jsonl`. Nunca se recorre
 * la raíz de ~/.codex directamente, así que archivos de credenciales como
 * `~/.codex/auth.json` jamás se leen.
 */
export async function discoverCodexSessions(root: string = defaultCodexRoot()): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readDirRO(dir);
    } catch {
      return; // dir inexistente
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.startsWith("rollout-") && e.name.endsWith(".jsonl")) out.push(p);
    }
  }
  await walk(join(root, "sessions"));
  await walk(join(root, "archived_sessions"));
  return out.sort();
}

/** Detecta comandos directos (`/skill`) en mensajes de usuario de Codex. */
export function parseCodexSkills(raw: string, fromLine = 0): SkillUsage[] {
  const out: SkillUsage[] = [];
  for (const [i, line] of splitLines(raw).entries()) {
    if (i < fromLine) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const p = o?.type === "response_item" ? o.payload : undefined;
    if (p?.type !== "message" || p.role !== "user" || !Array.isArray(p.content)) continue;
    const text = p.content
      .filter((b: any) => b?.type === "input_text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n");
    for (const match of text.matchAll(/(?:^|\n)\s*\/([\w.:-]+)(?=\s|$)/g)) {
      out.push({ skill: match[1], ts: String(o.timestamp ?? ""), kind: "command" });
    }
  }
  return out;
}

/** Clase paralela a ClaudeCodeAdapter para uso directo (no incremental). */
export class CodexAdapter {
  readonly id = "codex";
  constructor(private root: string = defaultCodexRoot()) {}
  discoverSessions(): Promise<string[]> {
    return discoverCodexSessions(this.root);
  }
  async parseSession(path: string) {
    const raw = await readFileRO(path);
    const meta = parseCodexMeta(raw);
    const sessionId = meta.sessionId || basename(path, ".jsonl");
    return {
      id: sessionId,
      agent: this.id,
      project: meta.cwd ? basename(meta.cwd) : "codex",
      events: parseCodexLines(raw, sessionId).events.map((e) => e.event),
    };
  }
}
