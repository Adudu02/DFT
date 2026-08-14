/**
 * Raíz del estado escribible del motor (DB, reportes, config, pricing editable).
 * Default = `<cwd>/data`. Un consumidor que use el motor como librería la fija
 * con setDataDir() antes de ingerir. ensureUserData() prepara ese directorio;
 * cualquier consumidor (app, reporter de CI) lo llama antes de ingerir.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ponytail: estado global de módulo, suficiente para un proceso single-tenant.
// Si algún día hay que ingerir varios roots a la vez en el mismo proceso, pasar
// el path explícito a openDb/loadPricing/loadConfig (ya lo aceptan) en vez de esto.
let dataRoot: string | null = null;

/** Estado escribible del motor (default `<cwd>/data`, override con setDataDir). */
export function dataDir(): string {
  return dataRoot ?? join(process.cwd(), "data");
}

/** Fija la raíz del estado escribible (para embeber el motor como librería). */
export function setDataDir(dir: string): void {
  dataRoot = dir;
}

/**
 * Ruta al `pricing.json` de fábrica que se empaqueta con el core (rates por
 * defecto, solo lectura). La capa app lo usa para sembrar el estado del usuario.
 */
export function packagedPricingPath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/lib | src/lib
  return join(here, "..", "..", "data", "pricing.json");
}

/**
 * Prepara el directorio de estado: lo crea y siembra `pricing.json` desde el
 * default de fábrica si falta (loadPricing no tiene fallback: el archivo es
 * obligatorio). Idempotente. Cualquier consumidor lo llama antes de ingerir.
 */
export function ensureUserData(): void {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const pricing = join(dir, "pricing.json");
  if (!existsSync(pricing)) {
    const seed = packagedPricingPath();
    if (existsSync(seed) && seed !== pricing) copyFileSync(seed, pricing);
  }
}
