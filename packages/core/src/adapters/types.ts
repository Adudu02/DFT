/** Modelo normalizado compartido por todos los adapters (PLAN §1.3). */

export interface UsageEvent {
  sessionId: string;
  ts: string; // ISO 8601
  day: string; // YYYY-MM-DD (derivado de ts)
  model: string;
  input: number;
  output: number;
  cacheWrite: number; // cache_creation_input_tokens
  cacheRead: number; // cache_read_input_tokens
}

export interface NormalizedSession {
  id: string;
  agent: string; // "claude-code", "codex", ...
  project: string;
  events: UsageEvent[];
}

export interface SkillUsage {
  skill: string;
  ts: string;
  kind: "command" | "skill-tool";
}
