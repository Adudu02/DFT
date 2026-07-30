/**
 * Config del usuario (./data/config.json): tarifa/hora, min ahorrados por uso,
 * umbral de obsolescencia, rutas de agentes (PLAN §4.5). loadConfig hace merge
 * sobre defaults; nunca lanza si falta el archivo.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileRO } from "./fs-readonly.js";

export interface Config {
  hourlyRate: number;
  staleDays: number;
  minutesPerUseDefault: number;
  minutesPerUse: Record<string, number>;
  agentPaths: Record<string, string>;
}

export const DEFAULT_CONFIG: Config = {
  hourlyRate: 0,
  staleDays: 30,
  minutesPerUseDefault: 0,
  minutesPerUse: {},
  agentPaths: {},
};

function defaultConfigPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "data", "config.json");
}

function merge(partial: Partial<Config>): Config {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    minutesPerUse: { ...DEFAULT_CONFIG.minutesPerUse, ...(partial.minutesPerUse ?? {}) },
    agentPaths: { ...DEFAULT_CONFIG.agentPaths, ...(partial.agentPaths ?? {}) },
  };
}

export async function loadConfig(path = defaultConfigPath()): Promise<Config> {
  try {
    return merge(JSON.parse(await readFileRO(path)) as Partial<Config>);
  } catch {
    return { ...DEFAULT_CONFIG }; // sin archivo => defaults
  }
}

/** Merge del parcial sobre lo existente (o defaults) y persiste. */
export async function saveConfig(partial: Partial<Config>, path = defaultConfigPath()): Promise<Config> {
  const current = await loadConfig(path);
  const next = merge({
    ...current,
    ...partial,
    minutesPerUse: { ...current.minutesPerUse, ...(partial.minutesPerUse ?? {}) },
    agentPaths: { ...current.agentPaths, ...(partial.agentPaths ?? {}) },
  });
  await writeFile(path, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}
