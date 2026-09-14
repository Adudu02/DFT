/**
 * Adapter Gemini CLI (workstream A1). Chats en ~/.gemini/tmp/<hash>/chats/:
 *  - `session-*.jsonl`: un JSON por mensaje; los de `type: 'gemini'` traen
 *    `tokens: {input, output, cached?, thoughts?, tool?, total}` y `timestamp`.
 * SOLO LECTURA. Fixture-driven: formato según el research del plan
 * (docs/implementation-plan.md); sin datos locales en la máquina de desarrollo.
 *
 * Mapeo al modelo normalizado (misma convención que Qwen):
 *   input  = input - cached      (cached ⊆ input: el input "crudo" sin caché)
 *   output = output + thoughts   (thinking es salida)
 *   cacheRead  = cached
 *   cacheWrite = 0               (Gemini CLI no expone cache creation)
 *
 * Un mensaje sin `timestamp` no tiene día posible => skipped (contado).
 */
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { readDirRO } from "../lib/fs-readonly.js";
import type { ParsedLine, SkillUsage } from "./types.js";

export function defaultGeminiRoot(): string {
  return join(homedir(), ".gemini", "tmp");
}

/** Descubre `session-*.jsonl` bajo `<hash>/chats/` (lista blanca estricta). */
export async function discoverGeminiChats(root: string = defaultGeminiRoot()): Promise<string[]> {
  let projects: Dirent[];
  try {
    projects = await readDirRO(root);
  } catch {
    return []; // no hay ~/.gemini/tmp
  }
  const out: string[] = [];
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    let chats: Dirent[];
    try {
      chats = await readDirRO(join(root, p.name, "chats"));
    } catch {
      continue; // proyecto sin chats/
    }
    for (const c of chats) {
      if (c.isFile() && c.name.startsWith("session-") && c.name.endsWith(".jsonl")) {
        out.push(join(root, p.name, "chats", c.name));
      }
    }
  }
  return out.sort();
}

/**
 * Parsea las líneas de un chat. Un evento por mensaje `type: 'gemini'` con
 * `tokens` y `timestamp`; corruptos, sin tokens o sin timestamp => skipped.
 */
export function parseGeminiLines(
  raw: string,
  fromLine = 0,
  sessionId = "gemini",
): { events: ParsedLine[]; lineCount: number; skipped: number } {
  const events: ParsedLine[] = [];
  let skipped = 0;
  let lineCount = 0;
  const base = sessionId; // dedup por sesión + índice de línea (chats append-only)
  for (const [i, line] of raw.split("\n").entries()) {
    if (i < fromLine) continue;
    const t = line.trim();
    if (!t) continue;
    lineCount++;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      skipped++;
      continue;
    }
    if (o?.type !== "gemini" || !o.tokens || typeof o.timestamp !== "string" || !o.timestamp) {
      skipped++;
      continue;
    }
    const input = Number(o.tokens.input ?? 0);
    const output = Number(o.tokens.output ?? 0);
    const cached = Number(o.tokens.cached ?? 0);
    const thoughts = Number(o.tokens.thoughts ?? 0);
    events.push({
      dedupKey: `gemini::${base}::${i}`,
      event: {
        sessionId,
        ts: o.timestamp,
        day: o.timestamp.slice(0, 10),
        model: typeof o.model === "string" && o.model ? o.model : "unknown",
        input: input - cached,
        output: output + thoughts,
        cacheWrite: 0,
        cacheRead: cached,
      },
    });
  }
  return { events, lineCount, skipped };
}

/** Deriva (sessionId, project): el hash de carpeta no es reversible => project fijo. */
export function deriveGeminiIds(path: string): { sessionId: string; project: string } {
  return { sessionId: basename(path, ".jsonl"), project: "gemini" };
}

/** Gemini CLI no expone usos de skills en este formato. */
export function parseGeminiSkills(_raw: string, _fromLine = 0): SkillUsage[] {
  return [];
}
