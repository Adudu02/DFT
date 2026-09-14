/**
 * Tipos del módulo de quota probes (add-quota-probes). Un snapshot por
 * combinación (proveedor, modelo, ventana) — JAMÁS agregado entre modelos o
 * ventanas: lo que el proveedor no da queda undefined (nunca 0).
 */

export type QuotaOrigin = "live" | "offline-stale";

export interface QuotaSnapshot {
  provider: string;
  /** Modelo específico cuando el proveedor distingue límites por modelo. */
  model?: string;
  /** Ventana normalizada: five_hour | weekly | monthly | <n>h | <n>d | ... */
  window: string;
  /** 0–100. */
  usedPercent?: number;
  limit?: number;
  remaining?: number;
  /** ISO o epoch-ms ISO-serializado; formato libre del proveedor normalizado a ISO. */
  resetsAt?: string;
  plan?: string;
  fetchedAt: string;
  origin: QuotaOrigin;
}

export type QuotaStatus = "live" | "stale" | "error" | "no-credential" | "disabled";

export interface QuotaProviderResult {
  provider: string;
  status: QuotaStatus;
  /** Causa sanitizada (sin credenciales) cuando status = error. */
  error?: string;
  snapshots: QuotaSnapshot[];
}

export interface QuotaCacheFile {
  version: 1;
  fetchedAt: string;
  snapshots: QuotaSnapshot[];
}

/** Claves de credencial/rutas por proveedor — inyectables para tests. */
export interface ProberContext {
  fetchImpl: typeof fetch;
  now: () => Date;
  timeoutMs: number;
  claudeCredentialsPath?: string;
  codexAuthPath?: string;
  codexRoot?: string; // rollouts para el fallback offline
  zaiApiKey?: string;
  geminiCredentialsPath?: string;
  geminiProjectId?: string;
  copilotAppsPath?: string;
  openrouterApiKey?: string;
}
