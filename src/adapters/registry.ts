/**
 * Registro de adapters para la ingesta incremental (F5). Cada adapter sabe
 * descubrir sus transcripts, derivar (sessionId, project) y parsear líneas al
 * modelo normalizado. La ingesta itera todos y comparte el offset por archivo.
 */
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { SkillUsage, UsageEvent } from "./types.js";
import {
  ClaudeCodeAdapter,
  defaultProjectsRoot,
  parseTranscriptLines,
  parseSkillUsages,
} from "./claude-code.js";
import {
  defaultCodexRoot,
  discoverCodexSessions,
  parseCodexLines,
  parseCodexMeta,
  parseCodexSkills,
} from "./codex.js";

export interface ParsedLine {
  dedupKey: string;
  event: UsageEvent;
}

export interface IngestAdapter {
  id: string;
  discover(): Promise<string[]>;
  /** raw = archivo COMPLETO (la meta suele estar en la línea 0). */
  deriveIds(path: string, raw: string): { sessionId: string; project: string };
  parseLines(
    raw: string,
    fromLine: number,
    sessionId: string,
  ): { events: ParsedLine[]; lineCount: number; skipped: number };
  parseSkills(raw: string, fromLine: number): SkillUsage[];
}

function claudeAdapter(root: string): IngestAdapter {
  const disc = new ClaudeCodeAdapter(root);
  return {
    id: "claude-code",
    discover: () => disc.discoverSessions(),
    deriveIds: (path) => ({ sessionId: basename(path, ".jsonl"), project: basename(dirname(path)) }),
    parseLines: (raw, fromLine) => parseTranscriptLines(raw, fromLine),
    parseSkills: (raw, fromLine) => parseSkillUsages(raw, fromLine),
  };
}

function codexAdapter(root: string): IngestAdapter {
  return {
    id: "codex",
    discover: () => discoverCodexSessions(root),
    deriveIds: (path, raw) => {
      const meta = parseCodexMeta(raw);
      return {
        sessionId: meta.sessionId || basename(path, ".jsonl"),
        project: meta.cwd ? basename(meta.cwd) : "codex",
      };
    },
    parseLines: (raw, fromLine, sessionId) => parseCodexLines(raw, sessionId, fromLine),
    parseSkills: (raw, fromLine) => parseCodexSkills(raw, fromLine),
  };
}

/**
 * Adapters activos para la ingesta. Regla de aislamiento de tests: si el llamador
 * OVERRIDEA claudeRoot (fixtures), NO se agrega Codex con su raíz por defecto —
 * solo si se pasa codexRoot explícito. En producción (sin overrides) ambos usan
 * su raíz real.
 */
export function getIngestAdapters(roots: { claudeRoot?: string; codexRoot?: string } = {}): IngestAdapter[] {
  const claudeRoot = roots.claudeRoot ?? defaultProjectsRoot();
  const adapters: IngestAdapter[] = [claudeAdapter(claudeRoot)];

  const codexRoot = roots.codexRoot ?? (roots.claudeRoot ? undefined : defaultCodexRoot());
  if (codexRoot) adapters.push(codexAdapter(codexRoot));

  return adapters;
}

/**
 * Traduce `config.agentPaths` (rutas que el usuario configura para conectar sus
 * agentes) a las raíces de ingesta. Claves = id del adapter ("claude-code",
 * "codex"). Si no se configura una ruta se usa la raíz por defecto del agente;
 * Codex se incluye siempre para no perderlo al personalizar la ruta de Claude.
 */
export function rootsFromConfig(
  agentPaths: Record<string, string> = {},
): { projectsRoot?: string; codexRoot: string } {
  return {
    projectsRoot: expandTilde(agentPaths["claude-code"]) || undefined,
    codexRoot: expandTilde(agentPaths["codex"]) || defaultCodexRoot(),
  };
}

/** Expande un `~/` inicial a la home (fs no lo hace). "" y undefined => "". */
function expandTilde(p?: string): string {
  if (!p) return "";
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}
