/**
 * Orquestador de refresh (usado por el server y el CLI): corre los probers
 * habilitados, fusiona la caché (reemplazo por proveedor) y persiste atómicamente.
 * Todo inyectable para tests sin red.
 */
import { mergeCache, readQuotaCache, writeQuotaCache } from "./cache.js";
import { runQuotaProbers, PHASE1_PROBERS, type QuotaProbers } from "./probers.js";
import type { QuotaCacheFile, QuotaProviderResult } from "./types.js";

export interface RefreshQuotaOptions {
  providers?: Record<string, boolean>;
  zaiApiKey?: string;
  codexRoot?: string;
  claudeCredentialsPath?: string;
  codexAuthPath?: string;
  cachePath?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  probers?: QuotaProbers;
}

export async function refreshQuota(
  opts: RefreshQuotaOptions = {},
): Promise<{ cache: QuotaCacheFile; results: QuotaProviderResult[] }> {
  const now = opts.now ?? ((): Date => new Date());
  const results = await runQuotaProbers(
    opts.probers ?? PHASE1_PROBERS,
    opts.providers ?? {},
    { claudeCredentialsPath: opts.claudeCredentialsPath, codexAuthPath: opts.codexAuthPath, codexRoot: opts.codexRoot, zaiApiKey: opts.zaiApiKey },
    { fetchImpl: opts.fetchImpl, now: () => now(), timeoutMs: opts.timeoutMs },
  );
  const cache = mergeCache(readQuotaCache(opts.cachePath), now().toISOString(), results.filter((r) => r.snapshots.length > 0 || r.status === "live"));
  writeQuotaCache(cache.fetchedAt, cache.snapshots, opts.cachePath);
  return { cache, results };
}

export { readQuotaCache, cacheFreshness, defaultQuotaCachePath } from "./cache.js";
export type { QuotaSnapshot, QuotaStatus, QuotaCacheFile, QuotaProviderResult } from "./types.js";
