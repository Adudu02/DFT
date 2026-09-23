/**
 * Config del usuario (./data/config.json): tarifa/hora, min ahorrados por uso,
 * umbral de obsolescencia, rutas de agentes (PLAN §4.5). loadConfig hace merge
 * sobre defaults; nunca lanza si falta el archivo.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readFileRO } from "how-much-did-u-waste-core";
import { dataDir } from "how-much-did-u-waste-core";
import { DEFAULT_WASTE, type WasteThresholds } from "./waste.js";

export interface Config {
  hourlyRate: number;
  staleDays: number;
  minutesPerUseDefault: number;
  minutesPerUse: Record<string, number>;
  agentPaths: Record<string, string>;
  timeZone: string; // IANA, ej. "America/Merida". Vacío = zona del sistema.
  waste: WasteThresholds;
  pricing: { maxAgeDays: number; autoUpdate: boolean };
  quota: {
    providers: { claude: boolean; codex: boolean; zai: boolean; gemini: boolean; copilot: boolean; openrouter: boolean };
    zaiApiKey?: string;
    geminiProjectId?: string;
    refreshTtlMinutes: number;
    autoRefresh: boolean;
  };
}

export const DEFAULT_CONFIG: Config = {
  hourlyRate: 0,
  staleDays: 30,
  minutesPerUseDefault: 0,
  minutesPerUse: {},
  agentPaths: {},
  timeZone: "",
  waste: { ...DEFAULT_WASTE },
  pricing: { maxAgeDays: 7, autoUpdate: true },
  quota: {
    providers: { claude: true, codex: true, zai: true, gemini: true, copilot: true, openrouter: true },
    refreshTtlMinutes: 5,
    autoRefresh: false,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonNegative(value: unknown, field: string, integer = false): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`config inválida: ${field}`);
  }
}

/** Valida únicamente las claves recibidas, para preservar PUTs parciales. */
export function validateConfig(value: unknown): Partial<Config> {
  if (!isRecord(value)) throw new Error("config inválida: se esperaba un objeto");
  const allowed = new Set(["hourlyRate", "staleDays", "minutesPerUseDefault", "minutesPerUse", "agentPaths", "timeZone", "waste", "pricing", "quota"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`config inválida: clave desconocida '${key}'`);
  if (value.hourlyRate !== undefined) nonNegative(value.hourlyRate, "hourlyRate");
  if (value.staleDays !== undefined) nonNegative(value.staleDays, "staleDays", true);
  if (value.minutesPerUseDefault !== undefined) nonNegative(value.minutesPerUseDefault, "minutesPerUseDefault");
  if (value.timeZone !== undefined && typeof value.timeZone !== "string") throw new Error("config inválida: timeZone debe ser texto");
  for (const field of ["minutesPerUse", "agentPaths"] as const) {
    if (value[field] === undefined) continue;
    if (!isRecord(value[field])) throw new Error(`config inválida: ${field}`);
    for (const [key, item] of Object.entries(value[field])) {
      if (!key.trim()) throw new Error(`config inválida: ${field} contiene una clave vacía`);
      if (field === "minutesPerUse") nonNegative(item, `${field}.${key}`);
      else if (typeof item !== "string") throw new Error(`config inválida: ${field}.${key}`);
    }
  }
  if (value.waste !== undefined) {
    if (!isRecord(value.waste)) throw new Error("config inválida: waste");
    const w = value.waste;
    const wasteKeys = new Set(["minCacheRatio", "minInputTokens", "bloatTurns", "bloatTokens", "expensiveInputRate", "trivialOutputTokens", "mismatchMinTurns", "downgradePaths"]);
    for (const key of Object.keys(w)) if (!wasteKeys.has(key)) throw new Error(`config inválida: waste.${key}`);
    if (w.minCacheRatio !== undefined && (typeof w.minCacheRatio !== "number" || !Number.isFinite(w.minCacheRatio) || w.minCacheRatio < 0 || w.minCacheRatio > 1)) throw new Error("config inválida: waste.minCacheRatio");
    for (const field of ["minInputTokens", "bloatTurns", "bloatTokens", "trivialOutputTokens", "mismatchMinTurns"] as const) {
      if (w[field] !== undefined) nonNegative(w[field], `waste.${field}`, true);
    }
    if (w.expensiveInputRate !== undefined) nonNegative(w.expensiveInputRate, "waste.expensiveInputRate");
    if (w.downgradePaths !== undefined) {
      if (!isRecord(w.downgradePaths)) throw new Error("config inválida: waste.downgradePaths");
      for (const [from, to] of Object.entries(w.downgradePaths)) {
        if (!from.trim() || typeof to !== "string" || !to.trim()) throw new Error("config inválida: waste.downgradePaths");
      }
    }
  }
  if (value.pricing !== undefined) {
    if (!isRecord(value.pricing)) throw new Error("config inválida: pricing");
    const p = value.pricing;
    for (const key of Object.keys(p)) {
      if (key !== "maxAgeDays" && key !== "autoUpdate") throw new Error(`config inválida: pricing.${key}`);
    }
    if (p.maxAgeDays !== undefined) nonNegative(p.maxAgeDays, "pricing.maxAgeDays", true);
    if (p.autoUpdate !== undefined && typeof p.autoUpdate !== "boolean") throw new Error("config inválida: pricing.autoUpdate debe ser booleano");
  }
  if (value.quota !== undefined) {
    if (!isRecord(value.quota)) throw new Error("config inválida: quota");
    const q = value.quota;
    for (const key of Object.keys(q)) {
      if (key !== "providers" && key !== "zaiApiKey" && key !== "geminiProjectId" && key !== "refreshTtlMinutes" && key !== "autoRefresh") {
        throw new Error(`config inválida: quota.${key}`);
      }
    }
    if (q.zaiApiKey !== undefined && typeof q.zaiApiKey !== "string") throw new Error("config inválida: quota.zaiApiKey");
    if (q.geminiProjectId !== undefined && typeof q.geminiProjectId !== "string") throw new Error("config inválida: quota.geminiProjectId");
    if (q.refreshTtlMinutes !== undefined) nonNegative(q.refreshTtlMinutes, "quota.refreshTtlMinutes", true);
    if (q.autoRefresh !== undefined && typeof q.autoRefresh !== "boolean") throw new Error("config inválida: quota.autoRefresh");
    if (q.providers !== undefined) {
      if (!isRecord(q.providers)) throw new Error("config inválida: quota.providers");
      for (const [provider, enabled] of Object.entries(q.providers)) {
        if (!["claude", "codex", "zai", "gemini", "copilot", "openrouter"].includes(provider)) throw new Error(`config inválida: quota.providers.${provider}`);
        if (typeof enabled !== "boolean") throw new Error(`config inválida: quota.providers.${provider}`);
      }
    }
  }
  return value as Partial<Config>;
}

function defaultConfigPath(): string {
  return join(dataDir(), "config.json");
}

function merge(partial: Partial<Config>): Config {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    minutesPerUse: { ...DEFAULT_CONFIG.minutesPerUse, ...(partial.minutesPerUse ?? {}) },
    agentPaths: { ...DEFAULT_CONFIG.agentPaths, ...(partial.agentPaths ?? {}) },
    waste: { ...DEFAULT_WASTE, ...(partial.waste ?? {}) },
    pricing: { ...DEFAULT_CONFIG.pricing, ...(partial.pricing ?? {}) },
    quota: {
      ...DEFAULT_CONFIG.quota,
      ...(partial.quota ?? {}),
      providers: { ...DEFAULT_CONFIG.quota.providers, ...(partial.quota?.providers ?? {}) },
    },
  };
}

export async function loadConfig(path = defaultConfigPath()): Promise<Config> {
  try {
    return merge(validateConfig(JSON.parse(await readFileRO(path))));
  } catch {
    return { ...DEFAULT_CONFIG }; // sin archivo => defaults
  }
}

/** Merge del parcial sobre lo existente (o defaults) y persiste. */
export async function saveConfig(partial: Partial<Config>, path = defaultConfigPath()): Promise<Config> {
  const valid = validateConfig(partial);
  const current = await loadConfig(path);
  const next = merge({
    ...current,
    ...valid,
    minutesPerUse: { ...current.minutesPerUse, ...(valid.minutesPerUse ?? {}) },
    agentPaths: { ...current.agentPaths, ...(valid.agentPaths ?? {}) },
  });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
