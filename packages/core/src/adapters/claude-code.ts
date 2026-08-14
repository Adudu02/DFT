/**
 * Adapter Claude Code (PLAN §1.1). Transcripts JSONL en
 * ~/.claude/projects/<proj>/<session>.jsonl. Cada línea es un evento; los
 * `assistant` traen message.model + message.usage. SOLO LECTURA.
 *
 * Reglas: dedup por (message.id + requestId), se excluye model "<synthetic>",
 * las líneas corruptas se saltan sin lanzar, modelo desconocido se conserva
 * (la tarifa se decide después, en el motor de costos).
 */
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { readFileRO, readDirRO } from "../lib/fs-readonly.js";
import type { NormalizedSession, SkillUsage, UsageEvent } from "./types.js";

export function defaultProjectsRoot(): string {
  return join(homedir(), ".claude", "projects");
}

interface ParsedLine {
  dedupKey: string;
  event: UsageEvent;
}

function splitLines(raw: string): string[] {
  const parts = raw.split("\n");
  // Descarta el "" final que deja el newline de cierre, para que el offset
  // incremental no se descoloque al re-leer.
  return parts.length && parts[parts.length - 1] === "" ? parts.slice(0, -1) : parts;
}

function toParsedLine(o: any, fallbackKey: string): ParsedLine | null {
  if (!o || o.type !== "assistant") return null;
  const m = o.message;
  if (!m || !m.usage) return null;
  const model: string | undefined = m.model;
  if (!model || model === "<synthetic>") return null;

  const u = m.usage;
  const ts = String(o.timestamp ?? m.timestamp ?? "");
  const event: UsageEvent = {
    sessionId: String(o.sessionId ?? ""),
    ts,
    day: ts.slice(0, 10),
    model,
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
  };
  const idKey = `${m.id ?? ""}::${o.requestId ?? ""}`;
  const dedupKey = m.id || o.requestId ? idKey : fallbackKey;
  return { dedupKey, event };
}

/**
 * Parsea las líneas desde `fromLine` (para ingesta incremental). Dedup dentro
 * del slice por dedupKey. `lineCount` = líneas físicas del archivo (offset).
 */
export function parseTranscriptLines(
  raw: string,
  fromLine = 0,
): { events: ParsedLine[]; lineCount: number; skipped: number } {
  const lines = splitLines(raw);
  const events: ParsedLine[] = [];
  const seen = new Set<string>();
  let skipped = 0; // líneas no vacías que no se pudieron parsear (JSON corrupto)
  for (let i = fromLine; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      skipped++; // línea corrupta => se salta y se reporta
      continue;
    }
    const parsed = toParsedLine(o, `noid::${i}`);
    if (!parsed) continue;
    if (seen.has(parsed.dedupKey)) continue;
    seen.add(parsed.dedupKey);
    events.push(parsed);
  }
  return { events, lineCount: lines.length, skipped };
}

/** Eventos de uso únicos de un transcript completo. */
export function extractUsageEvents(raw: string): UsageEvent[] {
  return parseTranscriptLines(raw).events.map((e) => e.event);
}

const COMMAND_RE = /<command-name>\/?([\w.:-]+)<\/command-name>/;

/** Detecta uso de skills/comandos: /nombre en user + tool_use Skill en assistant. */
export function parseSkillUsages(raw: string, fromLine = 0): SkillUsage[] {
  const lines = splitLines(raw);
  const out: SkillUsage[] = [];
  for (let i = fromLine; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    const ts = String(o.timestamp ?? "");
    if (o.type === "user") {
      const c = o.message?.content;
      let text: string | null = null;
      if (typeof c === "string") {
        text = c;
      } else if (Array.isArray(c)) {
        // Los tool_result traen contenido de archivos: un README que documenta
        // `<command-name>/x</command-name>` NO es un uso de skill. Antes se
        // serializaba todo el content y esos textos contaban como usos falsos.
        if (!c.some((b: any) => b?.type === "tool_result")) {
          text = c
            .filter((b: any) => b?.type === "text" && typeof b.text === "string")
            .map((b: any) => b.text)
            .join("\n");
        }
      }
      const mm = text ? text.match(COMMAND_RE) : null;
      if (mm) out.push({ skill: mm[1], ts, kind: "command" });
    } else if (o.type === "assistant" && Array.isArray(o.message?.content)) {
      for (const b of o.message.content) {
        if (b?.type === "tool_use" && b.name === "Skill" && b.input?.skill) {
          const skill = String(b.input.skill).split(":").pop() as string;
          out.push({ skill, ts, kind: "skill-tool" });
        }
      }
    }
  }
  return out;
}

export class ClaudeCodeAdapter {
  readonly id = "claude-code";
  constructor(private root: string = defaultProjectsRoot()) {}

  /** Rutas de todos los transcripts .jsonl bajo projects/<proj>/. */
  async discoverSessions(): Promise<string[]> {
    let projects;
    try {
      projects = await readDirRO(this.root);
    } catch {
      return []; // no hay ~/.claude/projects
    }
    const paths: string[] = [];
    for (const p of projects) {
      if (!p.isDirectory()) continue;
      const dir = join(this.root, p.name);
      let files;
      try {
        files = await readDirRO(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (f.isFile() && f.name.endsWith(".jsonl")) paths.push(join(dir, f.name));
      }
    }
    return paths.sort();
  }

  async parseSession(path: string): Promise<NormalizedSession> {
    const raw = await readFileRO(path);
    return {
      id: basename(path, ".jsonl"),
      agent: this.id,
      project: basename(dirname(path)),
      events: extractUsageEvents(raw),
    };
  }
}
