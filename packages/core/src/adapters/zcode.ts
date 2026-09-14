/**
 * Adapter ZCode (workstream A1). Rollouts en ~/.zcode/cli/rollout/:
 *  - `model-io-sess_<uuid>.jsonl`: un JSON `model_io` por request del agente,
 *    con `response.usage` estilo Anthropic (campos camelCase).
 * SOLO LECTURA. Lista blanca: solo `model-io-sess_*.jsonl` — `model-io-no-session.jsonl`
 * no es descubrible (sus líneas no tienen sessionId y no cumplen el modelo de datos).
 *
 * Formato (verificado contra datos reales 2026-09-13):
 *   { completedAt, requestId, sessionId: "sess_<uuid>", type: "model_io",
 *     model: { modelId }, response: { usage: { inputTokens, outputTokens,
 *     totalTokens, cacheReadTokens, cacheWriteTokens } } }
 *
 * Mapeo al modelo normalizado (convención Anthropic — totalTokens = input + output
 * exacto en datos reales, así que cacheRead va APARTE del input):
 *   input  = inputTokens
 *   output = outputTokens
 *   cacheRead  = cacheReadTokens
 *   cacheWrite = cacheWriteTokens
 */
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { readDirRO } from "../lib/fs-readonly.js";
import type { SkillUsage, UsageEvent } from "./types.js";

export function defaultZcodeRoot(): string {
  return join(homedir(), ".zcode", "cli", "rollout");
}

interface ParsedLine {
  dedupKey: string;
  event: UsageEvent;
}

/** Sesión desde el filename: `model-io-sess_<uuid>.jsonl` → `sess_<uuid>`. */
function sessionIdFromFilename(path: string): string | null {
  const base = basename(path, ".jsonl");
  return base.startsWith("model-io-") ? base.slice("model-io-".length) : null;
}

/** Descubre rollouts de sesión (lista blanca estricta). */
export async function discoverZcodeRollouts(root: string = defaultZcodeRoot()): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readDirRO(root);
  } catch {
    return []; // no hay ~/.zcode/cli/rollout
  }
  return entries
    .filter((e) => e.isFile() && e.name.startsWith("model-io-sess_") && e.name.endsWith(".jsonl"))
    .map((e) => join(root, e.name))
    .sort();
}

/**
 * Parsea las líneas de un rollout. Un evento por línea `model_io` con usage;
 * líneas corruptas o sin sesión (ni en la línea ni en el filename) => skipped.
 */
export function parseZcodeLines(
  raw: string,
  fromLine = 0,
  fallbackSessionId: string | null = null,
): { events: ParsedLine[]; lineCount: number; skipped: number } {
  const events: ParsedLine[] = [];
  let skipped = 0;
  let lineCount = 0;
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
    const usage = o?.response?.usage;
    const sessionId: string | null = typeof o?.sessionId === "string" && o.sessionId ? o.sessionId : fallbackSessionId;
    if (!usage || !sessionId) {
      skipped++;
      continue;
    }
    const model: string = o?.model?.modelId ?? o?.request?.body?.model ?? "unknown";
    events.push({
      dedupKey: `zcode::${o.requestId ?? `${sessionId}::${o.completedAt ?? i}`}`,
      event: {
        sessionId,
        ts: String(o.completedAt ?? ""),
        day: String(o.completedAt ?? "").slice(0, 10),
        model,
        input: Number(usage.inputTokens ?? 0),
        output: Number(usage.outputTokens ?? 0),
        cacheWrite: Number(usage.cacheWriteTokens ?? 0),
        cacheRead: Number(usage.cacheReadTokens ?? 0),
      },
    });
  }
  return { events, lineCount, skipped };
}

/** Deriva (sessionId, project) de un rollout. project fijo: los rollouts no traen cwd. */
export function deriveZcodeIds(path: string, raw: string): { sessionId: string; project: string } {
  const first = raw.split("\n").find((l) => l.trim());
  if (first) {
    try {
      const sessionId = JSON.parse(first)?.sessionId;
      if (typeof sessionId === "string" && sessionId) return { sessionId, project: "zcode" };
    } catch {
      // filename fallback abajo
    }
  }
  return { sessionId: sessionIdFromFilename(path) ?? "zcode", project: "zcode" };
}

/** ZCode no expone usos de skills en este formato. */
export function parseZcodeSkills(_raw: string, _fromLine = 0): SkillUsage[] {
  return [];
}
