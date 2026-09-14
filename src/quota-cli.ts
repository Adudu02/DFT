/**
 * CLI `pnpm quota`: tabla de cuota restante por proveedor/modelo/ventana.
 *   pnpm quota              # lee la caché (sin red)
 *   pnpm quota -- --refresh # fuerza los probes (red)
 *   pnpm quota -- --json    # machine-readable
 * Los datos vencidos se marcan stale con edad; nunca se agregan entre
 * modelos/ventanas. Estados: live | stale | error | no-credential.
 */
import { cacheFreshness, readQuotaCache, refreshQuota } from "motor-agentico-core";
import { loadConfig } from "motor-agentico-insights";

const json = process.argv.includes("--json");
const refresh = process.argv.includes("--refresh");
const config = await loadConfig();

if (refresh) {
  const { results } = await refreshQuota({
    providers: config.quota.providers,
    zaiApiKey: config.quota.zaiApiKey,
  });
  for (const r of results) {
    if (r.status === "live") console.log(`✓ ${r.provider}: ${r.snapshots.length} ventana(s)`);
    else if (r.status === "no-credential") console.warn(`– ${r.provider}: sin credencial (${r.error ?? ""})`);
    else console.error(`✗ ${r.provider}: ${r.error ?? "error"}`);
  }
}

const cache = readQuotaCache();
const ttl = config.quota.refreshTtlMinutes;
const { fresh, ageMinutes } = cacheFreshness(cache, ttl);

if (json) {
  console.log(JSON.stringify({ status: cache ? (fresh ? "live" : "stale") : "no-data", ageMinutes, ttlMinutes: ttl, snapshots: cache?.snapshots ?? [] }, null, 2));
  process.exit(0);
}

if (!cache || cache.snapshots.length === 0) {
  console.log("Sin datos de cuota. Corré `pnpm quota -- --refresh`.");
  process.exit(0);
}

console.log(`Cuota (${fresh ? "en vivo" : `stale, hace ${ageMinutes} min`} · TTL ${ttl}m):`);
const bar = (pct: number): string => {
  const filled = Math.round(pct / 5);
  return "█".repeat(filled) + "░".repeat(20 - filled);
};
for (const s of cache.snapshots) {
  if (s.usedPercent === undefined) continue;
  const pct = Math.round(s.usedPercent);
  const tag = pct >= 90 ? "CRÍTICO" : pct >= 70 ? "warn" : "ok";
  const scope = [s.provider, s.model, s.window].filter(Boolean).join("/");
  const reset = s.resetsAt ? ` · reset ${s.resetsAt}` : "";
  const origin = s.origin === "offline-stale" ? " · offline" : "";
  console.log(`  [${tag}] ${scope}  ${bar(pct)} ${pct}%${reset}${origin}`);
}
