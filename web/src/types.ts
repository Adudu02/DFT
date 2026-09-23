// Tipos espejo del API — compartidos por todas las páginas.

export interface ModelShare {
  model: string;
  costUsd: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  known: boolean;
  share: number;
}

export interface AgentShare {
  agent: string;
  costUsd: number;
  tokens: number;
  share: number;
}

export interface Summary {
  from?: string;
  to?: string;
  windowDays: number;
  totalCostUsd: number;
  totalTokens: number;
  daily: { day: string; costUsd: number; input: number; output: number }[];
  perModel: ModelShare[];
  perAgentModels: Record<string, ModelShare[]>;
  perAgent: AgentShare[];
  activity: { turns: number; projects: number; deltaPct7d: number | null };
  streakDays: number;
  unknownModels: string[];
}

export interface SkillRow {
  name: string;
  uses: number;
  lastUsed: string | null;
  category: string;
  savedUsd: number;
  minutesPerUse: number;
  inCatalog: boolean;
  availableTo: string[];
  agents: { agent: string; uses: number; savedUsd: number }[];
}

export interface MemNode {
  id: string;
  label: string;
  kind: "memory" | "index" | "session" | "project";
  project: string;
  type?: string;
  lastTouched?: string;
  stale?: boolean;
}

export interface MemLink {
  source: string;
  target: string;
  rel: string;
}

export interface MemoryGraph {
  nodes: MemNode[];
  links: MemLink[];
  counts: { memories: number; stale: number };
}

export interface ActSession {
  id: string;
  project: string;
  agent: string;
  turns: number;
  costUsd: number;
  models: string[];
}

export interface ActivityDay {
  day: string;
  sessions: ActSession[];
}

export interface ActivityPage {
  days: ActivityDay[];
  nextCursor: string | null;
}

export interface PromptSearchResult {
  id: string;
  project: string;
  agent: string;
  startedAt: string | null;
  endedAt: string | null;
  prompt: string;
}

export interface SessionDetail {
  id: string;
  project: string;
  turns: number;
  totalCostUsd: number;
  models: { model: string; input: number; output: number; cacheWrite: number; cacheRead: number; costUsd: number }[];
}

export interface SessionTurn {
  ts: string;
  time: string;
  prompt: string;
  costUsd: number;
  tokens: number;
  inputTokens: number;
  cacheTokens: number;
  outputTokens: number;
  models: string[];
  effort: string | null;
}

export interface WasteThresholds {
  minCacheRatio: number;
  minInputTokens: number;
  bloatTurns: number;
  bloatTokens: number;
  expensiveInputRate: number;
  trivialOutputTokens: number;
  mismatchMinTurns: number;
  downgradePaths: Record<string, string>;
}

export interface Config {
  hourlyRate: number;
  staleDays: number;
  minutesPerUseDefault: number;
  minutesPerUse: Record<string, number>;
  agentPaths: Record<string, string>;
  timeZone: string;
  pricing: { maxAgeDays: number; autoUpdate: boolean; source: "litellm" | "modelsdev" };
  waste: WasteThresholds;
}

export interface WasteFinding {
  kind: "cache-miss" | "session-bloat" | "model-mismatch";
  sessionId: string;
  project: string;
  title: string;
  detail: string;
  estUsd?: number;
  estTokens?: number;
  metrics: { input: number; output: number; cacheWrite: number; cacheRead: number; turns: number; cacheHitRatio: number };
}

export interface WasteTrendPoint {
  day: string;
  estUsd: number;
  findings: number;
}

export interface WasteReport {
  findings: WasteFinding[];
  totalEstUsd: number;
  totalEstTokens: number;
  trend: WasteTrendPoint[];
  thresholds: WasteThresholds;
}
