/**
 * Caché de snapshots de cuota: `data/quota-cache.json` (estado propio, NO
 * read-only). Escritura atómica tmp+rename; lectura offline siempre posible;
 * el estado stale se calcula contra el TTL al consultar.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { QuotaCacheFile, QuotaSnapshot } from "./types.js";

export function defaultQuotaCachePath(): string {
  return join(process.cwd(), "data", "quota-cache.json");
}

export function readQuotaCache(path = defaultQuotaCachePath()): QuotaCacheFile | null {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (raw?.version !== 1 || !Array.isArray(raw.snapshots)) return null;
    return raw as QuotaCacheFile;
  } catch {
    return null; // sin caché / corrupta => sin dato (la UI muestra el estado)
  }
}

export function writeQuotaCache(fetchedAt: string, snapshots: QuotaSnapshot[], path = defaultQuotaCachePath()): void {
  const file: QuotaCacheFile = { version: 1, fetchedAt, snapshots };
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  renameSync(tmp, path); // atómico en POSIX
}

/**
 * Snapshot vivo o vencido según el TTL. `ageMinutes` es la edad de la caché
 * (para que la UI muestre "hace X"), null si no hay caché.
 */
export function cacheFreshness(
  cache: QuotaCacheFile | null,
  ttlMinutes: number,
  now = Date.now(),
): { fresh: boolean; ageMinutes: number | null } {
  if (!cache) return { fresh: false, ageMinutes: null };
  const ts = Date.parse(cache.fetchedAt);
  if (Number.isNaN(ts)) return { fresh: false, ageMinutes: null };
  const ageMinutes = Math.floor((now - ts) / 60_000);
  return { fresh: ageMinutes <= ttlMinutes, ageMinutes };
}

/** Fusiona el refresh nuevo sobre la caché: reemplaza por proveedor, preserva el resto. */
export function mergeCache(
  cache: QuotaCacheFile | null,
  fetchedAt: string,
  results: { provider: string; snapshots: QuotaSnapshot[] }[],
): QuotaCacheFile {
  const previous = cache?.snapshots ?? [];
  const refreshedProviders = new Set(results.map((r) => r.provider));
  const kept = previous.filter((s) => !refreshedProviders.has(s.provider));
  const fresh = results.flatMap((r) => r.snapshots);
  return { version: 1, fetchedAt, snapshots: [...kept, ...fresh] };
}
